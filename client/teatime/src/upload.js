// this is our UploadWorker

import { deflate } from 'pako/dist/pako_deflate.js'; // eslint-disable-line import/extensions
import Base64 from "crypto-js/enc-base64";
import AES from "crypto-js/aes";
import SHA256 from "crypto-js/sha256";
import WordArray from "crypto-js/lib-typedarrays";
import HmacSHA256 from "crypto-js/hmac-sha256";

// NOTE: if you add a new import, you must also add it to "dependencies" in package.json
//       so thet it gets bundled. The "peerDependencies" are not bundled.

/* eslint-disable-next-line */
const NODE = _IS_NODE_; // replaced by rollup

let poster;
let fetcher = fetch;
if (NODE) {
    /* eslint-disable global-require */
    const { parentPort } = require('worker_threads');
    parentPort.on('message', msg => handleMessage({ data: msg }));
    poster = msg => parentPort.postMessage({ data: msg });
} else {
    onmessage = handleMessage;
    poster = postMessage;
}

const offlineFiles = new Map();

function handleMessage(msg) {
    const { job, cmd, server, path: templatePath, buffer, keyBase64, gzip,
        referrer, id, appId, persistentId, CROQUET_VERSION, debug, what, offline } = msg.data;
    if (offline) fetcher = offlineStore;
    switch (cmd) {
        case "uploadEncrypted": uploadEncrypted(templatePath); break;
        case "getOfflineFile": getOfflineFile(msg.data.url); break;
        default: console.error("Unknown worker command", cmd);
    }

    function encrypt(bytes) {
        const start = Date.now();
        const plaintext = WordArray.create(bytes);
        const key = Base64.parse(keyBase64);
        const hmac = HmacSHA256(plaintext, key);
        const iv = WordArray.random(16);
        const { ciphertext } = AES.encrypt(plaintext, key, { iv });
        // Version 0 used Based64:
        // const encrypted = "CRQ0" + [iv, hmac, ciphertext].map(wordArray => wordArray.toString(Base64)).join('');
        // Version 1 is binary:
        const encrypted = new ArrayBuffer(4 + iv.sigBytes + hmac.sigBytes + ciphertext.sigBytes);
        const view = new DataView(encrypted);
        let i = 0;
        view.setUint32(i, 0x43525131, false); i += 4; //"CRQ1"
        // CryptoJS WordArrays are big-endian
        for (const array of [iv, hmac, ciphertext]) {
            for (const word of array.words) {
                view.setInt32(i, word, false); i += 4;
            }
        }
        if (debug) console.log(id, `${what} encrypted (${encrypted.byteLength} bytes) in ${Date.now() - start}ms`);
        return encrypted;
    }

    function compress(bytes) {
        const start = Date.now();
        const compressed = deflate(bytes, { gzip: true, level: 1 }); // sloppy but quick
        if (debug) console.log(id, `${what} compressed (${compressed.length} bytes) in ${Date.now() - start}ms`);
        return compressed;
    }

    function hash(bytes) {
        const start = Date.now();
        const sha256 = SHA256(WordArray.create(bytes));
        const base64 = Base64.stringify(sha256);
        const base64url = base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
        if (debug) console.log(id, `${what} hashed (${bytes.byteLength} bytes) in ${Date.now() - start}ms`);
        return base64url;
    }

    async function getUploadUrl(path) {
        if (offline) {
            const url = `offline:///${path}`;
            return { url, uploadUrl: url };
        }
        const start = Date.now();
        const url = `${server.url}/${path}`;
        if (!server.apiKey) return { url, uploadUrl: url };

        const response = await fetcher(url, {
            headers: {
                "X-Croquet-Auth": server.apiKey,
                "X-Croquet-App": appId,
                "X-Croquet-Id": persistentId,
                "X-Croquet-Session": id,
                "X-Croquet-Version": CROQUET_VERSION,
                "X-Croquet-Path": (new URL(referrer)).pathname,
            },
            referrer
            });

        const { ok, status, statusText } = response;
        if (!ok) throw Error(`Error in signing URL: ${status} - ${statusText}`);

        const { error, read, write } = await response.json();
        if (error) throw Error(error);
        if (debug) console.log(id, `${what} upload authorized in ${Date.now() - start}ms`);
        return { url: read, uploadUrl: write };
    }

    async function uploadEncrypted(path) {
        try {
            let body = encrypt(gzip ? compress(buffer) : buffer);
            if (NODE) body = new Uint8Array(body); // buffer needs to be put in an array
            if (path.includes("%HASH%")) path = path.replace("%HASH%", hash(body));
            const { uploadUrl, url } = await getUploadUrl(path);
            const start = Date.now();
            const { ok, status, statusText } = await fetcher(uploadUrl, {
                method: "PUT",
                mode: "cors",
                headers: { "Content-Type": "application/octet-stream" },
                referrer,
                body
            });
            if (!ok) throw Error(`server returned ${status} ${statusText} for PUT ${uploadUrl}`);
            if (debug) console.log(id, `${what} uploaded (${status}) in ${Date.now() - start}ms ${url}`);
            poster({ job, url, ok, status, statusText, bytes: NODE ? body.length : body.byteLength });
        } catch (e) {
            if (debug) console.error(`${id} upload error ${e.message}`);
            poster({ job, ok: false, status: -1, statusText: e.message });
        }
    }

    function offlineStore(requestUrl, options) {
        if (debug) console.log(id, `storing ${requestUrl}`);
        offlineFiles.set(requestUrl, options.body);
        return { ok: true, status: 201, statusText: "Offline created" };
    }

    function getOfflineFile(requestUrl) {
        const body = offlineFiles.get(requestUrl);
        if (!body) {
            if (debug) console.error(`${id} file not found ${requestUrl}`);
            poster({ job, ok: false, status: -1, statusText: "Offline file not found" });
            return;
        }
        if (debug) console.log(id, `retrieved ${requestUrl}`);
        poster({ job, ok: true, status: 200, statusText: "Offline file found", body, bytes: NODE ? body.length : body.byteLength });
    }
}
