import minimist from 'minimist';
const argObj = minimist(process.argv.slice(2));

const actualHostname = "localhost";

class UrlOptions {
    constructor() {
        parseOptions(this);
    }

    /**
     * - has("debug", "recv", false) matches debug=recv and debug=send,recv
     * - has("debug", "recv", true) matches debug=norecv and debug=send,norecv
     * - has("debug", "recv", "localhost") defaults to true on localhost, false otherwise
     *
     * @param {String} key - key for list of items
     * @param {String} item - value to look for in list of items
     * @param {Boolean|String} defaultValue - if string, true on that hostname, false otherwise
     */
    has(key, item, defaultValue) {
        if (typeof defaultValue !== "boolean") defaultValue = this.isHost(defaultValue);
        const urlString = this[key];
        if (typeof urlString !== "string") return defaultValue;
        const urlItems = urlString.split(',');
        if (defaultValue === true) item =`no${item}`;
        if (item.endsWith("s")) item = item.slice(0, -1);
        if (urlItems.includes(item) || urlItems.includes(`${item}s`)) return !defaultValue;
        return defaultValue;
    }

    isHost(hostname) {
        return actualHostname === hostname;
    }

    isLocalhost() {
        return this.isHost("localhost");
    }
}

function parseOptions(target) {
    for (const key of Object.keys(argObj)) {
        if (key === "_") continue;

        let val = argObj[key];
        if (typeof val === 'string' && val[0] === "[") val = val.slice(1, -1).split(","); // handle string arrays
        target[key] = val;
    }
}

const urlOptions = new UrlOptions();
export default urlOptions;
