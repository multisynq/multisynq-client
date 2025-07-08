import stableStringify from "fast-json-stable-stringify";
import WordArray from "crypto-js/lib-typedarrays";
import Base64 from "crypto-js/enc-base64";
import SHA256 from "crypto-js/sha256";
import urlOptions from "./_URLOPTIONS_MODULE_"; // eslint-disable-line import/no-unresolved
import { App } from "./_HTML_MODULE_"; // eslint-disable-line import/no-unresolved
import VirtualMachine from "./vm";
import { sessionProps, OLD_DATA_SERVER } from "./controller";


const MAXVERSION = '4';

const DATAHANDLE_HASH = Symbol("hash");
const DATAHANDLE_KEY = Symbol("key");
const DATAHANDLE_URL = Symbol("url");

const HandleCache = new Map();      // map hash => handle
let fetchCount = 0;

function debug(what) {
    return urlOptions.has("debug", what, false);
}

function hashFromUrl(url) {
    return url.replace(/.*\//, '');
}

function toBase64Url(base64) {
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(base64url) {
    return base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd((base64url.length + 3) & ~3, "=");
}

function scramble(key, string) {
    if (!key) key = '*';
    return string.replace(/[\s\S]/g, c => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(0)));
}

/**
 * **Secure bulk data storage**
 *
 * This Data API allows encrypted bulk data storage. E.g. if a user drops a file into a Croquet
 * application, the contents of that file can be handed off to the Data API for storage.
 * It will be encrypted and uploaded to a file server. Other participants will download and
 * decrypt the data.
 *
 * The [Data.store()]{@link Data#store} method returns a *data handle* that is to be stored in the model
 * via [view.publish()]{@link View#publish}, and then other participants fetch the stored data via
 * [Data.fetch()]{@link Data#fetch}, passing the handle from the model.
 *
 * Off-loading the actual bits of data to a file server and keeping only the meta data
 * (including the data handle) in the replicated model meta is a lot more efficient than
 * trying to send that data via [publish]{@link View#publish}/[subscribe]{@link Model#subscribe}.
 * It also allows caching.
 *
 * **Shareable handles:** By default, data handles are not shareable outside the session.
 * The uploaded data is encrypted with the session password, just like snapshots, messages, etc.
 * If you set the `shareable` option to `true`, the data handle will include the decryption key
 * so it can be decrypted by anyone who has the handle, even without the session password.
 * It is not protected by the session's end-to-end encryption. If the handle leaks, anyone can
 * download and decrypt the data. Again:
 *
 * **IF MADE SHAREABLE, THE DATA IS ENCRYPTED INDEPENDENTLY, THE HANDLE INCLUDES THE DECRYPTION KEY**
 *
 * **Note:** The Data API is not available in `Model` code, only available in `View` code.
 * Typically, you would access the Data API in a view as `this.session.data.store()` and `this.session.data.fetch()`.
 *
 * See this [tutorial]{@tutorial 2_9_data} for a complete example.
 *
 * @public
 */
class Data {
    /**
     * Store data and return an (opaque) handle.
     *
     * If `options.shareable` is `true`, the handle will include the decryption key and can be shared (see security/privacy warning above).
     *
     * By default, `data` will become unusable after this call, because the ArrayBuffer is detached when being [transferred]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer#transferring_arraybuffers} to a web worker for encryption and upload.
     * Set `options.keep` to `true` to make a copy instead of moving the data.
     *
     * @param {ArrayBuffer} data the data to be stored
     * @param {Object} [options=null]
     * @param {Boolean} [options.shareable=false] create data handle that can be shared outside this session
     * @param {Boolean} [options.keep=false] if true, keep the data intact (do not detach buffer)
     * @returns {Promise<DataHandle>} return promise for the handle
     * @tutorial 2_9_data
     * @example
     * // in a view, perhaps after a file drop event
     * const handle = await this.session.data.store(arrayBuffer);
     * this.publish("set-file", handle);
     * @public
     */
    async store() { throw Error("Data.store() needs to be called from session.data"); }

    /**
     * Fetch data for a given data handle
     * @param {DataHandle} dataHandle created by [Data.store()]{@link Data#store}
     * @returns {Promise<ArrayBuffer>} the data
     * @tutorial 2_9_data
     * @example
     * // in a view, perhaps after a "got-file" event from the model
     * const handle = this.model.handle;
     * const arrayBuffer = await this.session.data.fetch(handle);
     * @public
     */
    async fetch() { throw Error("Data.fetch() needs to be called from session.data"); }

    static async store(data, options, deprecatedKeep) {
        if (VirtualMachine.hasCurrent()) throw Error(`${App.libName}.Data.store() called from Model code`);
        let sessionId, shareable, keep;
        // signature used to be (sessionId, data, optionalKeep) and only shareable
        if (typeof data === "string") {
            sessionId = data;
            data = options;
            shareable = true;
            keep = deprecatedKeep;
        } else {
            sessionId = options && options.sessionId; // optional, sessionProps() will use any session
            shareable = options && options.shareable;
            keep = options && options.keep;
        }
        if (!(data instanceof ArrayBuffer)) throw Error(`${App.libName}.Data.store() called with non-ArrayBuffer data`);

        const { appId, persistentId, key: sessionKey, uploadEncrypted } = sessionProps(sessionId);
        const key = shareable ? WordArray.random(32).toString(Base64) : Base64.stringify(sessionKey);
        const path = `apps/${appId}/${persistentId}/data/%HASH%`; // %HASH% will be replaced by uploadEncrypted()
        const what = `data#${++fetchCount}`;
        if (debug("data")) console.log(`${App.libName}.Data: storing ${what} ${data.byteLength} bytes`);
        const url = await uploadEncrypted({ path, content: data, key, keep, debug: debug("data"), what });
        const hash = hashFromUrl(url);
        const handle = new DataHandle(hash, shareable && key, url);
        if (debug("data")) console.log(`${App.libName}.Data: stored ${what} as ${this.toId(handle)}`);
        return handle;

        // TODO: publish events and handle in vm to track assets even if user code fails to do so
        // publish(sessionId, "data-storing", handle);
        // promise.then(() => publish(sessionId, "data-stored", handle));
    }

    static async fetch(handle, options) {
        let sessionId;
        // signature used to be (sessionId, handle)
        if (options && options[DATAHANDLE_URL]) {
            sessionId = handle;
            handle = options;
        } else {
            sessionId = options && options.sessionId; // optional, sessionProps() will use any session
        }
        if (VirtualMachine.hasCurrent()) throw Error(`${App.libName}.Data.fetch() called from Model code`);
        const  { downloadEncrypted, key: sessionKey } = sessionProps(sessionId);
        const hash = handle && handle[DATAHANDLE_HASH];
        const key = handle && handle[DATAHANDLE_KEY] || Base64.stringify(sessionKey);
        const url = handle && handle[DATAHANDLE_URL];
        if (typeof hash !== "string" || typeof key !== "string" || typeof url !== "string" ) throw Error(`${App.libName}.Data.fetch() called with invalid handle`);
        const what = `data#${++fetchCount}`;
        if (debug("data")) console.log(`${App.libName}.Data: fetching ${what} ${this.toId(handle)}`);
        return downloadEncrypted({ url, key, debug: debug("data"), what });
    }

    /**
     * Answer a hash for the given data.
     * Strings and binary arrays are hashed directly, other objects use a stable JSON stringification
     * @param {ArrayBuffer|String|*} data the data to be hashed
     * @param {"hex"|"base64"|"base64url"} output hash encoding (default: "base64url")
     * @returns {String} SHA256 hash
     */
    static hash(data, output='base64url') {
        if (typeof data === "function") data = Function.prototype.toString.call(data);
        if (typeof data === "string") data = new TextEncoder().encode(data);
        else if (data && data.constructor === DataView) data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        else if (data && data.constructor === ArrayBuffer) data = new Uint8Array(data);
        else if (!ArrayBuffer.isView(data)) data = new TextEncoder().encode(stableStringify(data));
        const result = SHA256(WordArray.create(data));
        switch (output) {
            case "hex": return result.toString();
            case "base64": return result.toString(Base64);
            case "base64url": return toBase64Url(result.toString(Base64));
            default: throw Error(`${App.libName}.Data: unknown hash output "${output}", expected "hex"/"base64"/"base64url"`);
        }
    }

    /**
     * Create a data handle from a string id.
     *
     * @param {String} id an id created by [Data.toId()]{@link Data.toId}
     * @returns {DataHandle} a handle to be used with [Data.fetch()]{@link Data#fetch}
     * @public
     */
    static fromId(id) {
        const version = id.slice(0, 1);
        let hash, key, url, path;
        switch (version) {
            case '0':
                hash = id.slice(1, 1 + 43);
                key = id.slice(1 + 43);
                url = `${OLD_DATA_SERVER}/sessiondata/${hash}`;
                break;
            case '1':
                hash = id.slice(1, 1 + 43);
                key = id.slice(1 + 43, 1 + 43 + 43) + '=';
                path = id.slice(1 + 43 + 43);
                url = `${OLD_DATA_SERVER}/apps/${path}/data/${hash}`;
                break;
            case '2':
                hash = id.slice(1, 1 + 43);
                key = fromBase64Url(id.slice(1 + 43, 1 + 43 + 43));
                path = scramble(key, atob(fromBase64Url(id.slice(1 + 43 + 43))));
                url = `${OLD_DATA_SERVER}/apps/${path}/data/${hash}`;
                break;
            case '3':
                key = fromBase64Url(id.slice(1, 1 + 43));
                url = scramble(key, atob(fromBase64Url(id.slice(1 + 43))));
                hash = url.slice(-43);
                break;
            case '4':
                key = null; // use session key
                url = scramble(key, atob(fromBase64Url(id.slice(1))));
                hash = url.slice(-43);
                break;
            default:
                throw Error(`${App.libName}.Data expected handle v0-v${MAXVERSION} got v${version}`);
        }
        return new this(hash, key, url);
    }

    /**
     * Create a string id from a data handle.
     *
     * This base64url-encoded id is a string that includes the data location and decryption key.
     * @param {DataHandle} handle a handle created by [Data.store()]{@link Data#store}
     * @returns {String} id an id to be used with [Data.fromId()]{@link Data.fromId}
     * @public
     */
    static toId(handle) {
        if (!handle) return '';
        const hash = handle[DATAHANDLE_HASH];
        const key = handle[DATAHANDLE_KEY];
        const url = handle[DATAHANDLE_URL];
        if (url.slice(-43) !== hash) throw Error(`${App.libName} Data: malformed URL`);
        // key is plain Base64, make it url-safe
        const encodedKey = key && toBase64Url(key);
        // the only reason for obfuscation here is so devs do not rely on any parts of the id
        const encodedUrl = toBase64Url(btoa(scramble(key, url)));
        return key ? `3${encodedKey}${encodedUrl}` : `4${encodedUrl}`;
    }

    constructor(hash, key=null, url) {
        const existing = HandleCache.get(hash);
        if (existing) {
            // if (debug("data")) console.log(`${App.libName}.Data: using cached handle for ${hash}`);
            return existing;
        }
        if (url.slice(-43) !== hash) throw Error(`${App.libName} Data: malformed URL`);
        // stored under Symbol key to be invisible to user code
        Object.defineProperty(this, DATAHANDLE_HASH, { value: hash });
        if (key) Object.defineProperty(this, DATAHANDLE_KEY, { value: key });
        Object.defineProperty(this, DATAHANDLE_URL, { value: url });
        HandleCache.set(hash, this);
        // if (debug("data")) console.log(`${App.libName}.Data: created new handle for ${hash}`);
    }

    // no other methods - API is static
}


export default class DataHandle extends Data {}

export const DataHandleSpec = {
    cls: DataHandle,
    write: handle => DataHandle.toId(handle),
    read: state => DataHandle.fromId(state),
};
