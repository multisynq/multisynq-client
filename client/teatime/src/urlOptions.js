const sessionFromPath = window && window.location.hostname.endsWith("croquet.studio");
let sessionApp = "";
let sessionArgs = "";

class UrlOptions {
    constructor() {
        this.getSession();
        parseUrlOptionString(this, window.location.search.slice(1));
        parseUrlOptionString(this, sessionFromPath ? window.location.hash.slice(1) : sessionArgs);
        if (window.location.pathname.indexOf('/ar.html') >= 0) this.ar = true;
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
    has(key, item, defaultValue = false) {
        if (typeof defaultValue === "string") defaultValue = this.isHost(defaultValue);
        const urlString = this[key];
        if (typeof urlString !== "string") return defaultValue;
        const urlItems = urlString.split(',');
        if (defaultValue === true) item =`no${item}`;
        if (item.endsWith("s")) item = item.slice(0, -1);
        if (urlItems.includes(item) || urlItems.includes(`${item}s`)) return !defaultValue;
        return defaultValue;
    }

    /** Extract session from either path or hash or option
     * - on croquet.studio, it is "/app/session/with/slashes"
     * - elsewhere, it is "...#session/with/slashes&..."
     * - or optionally, passed as "session=session/with/slashes"
     * @return {String} "" or "session/with/slashes"
     */
    getSession() {
        // extract app and session from /(app)/(session)
        if (sessionFromPath) {
            const PATH_REGEX = /^\/([^/]+)\/(.*)$/;
            const pathMatch = window.location.pathname.match(PATH_REGEX);
            if (pathMatch) {
                sessionApp = pathMatch[1];     // used in setSession()
                return pathMatch[2];
            }
        } else {
            // extract session and args from #(session)&(arg=val&arg)
            const HASH_REGEX = /^#([^&]+)&?(.*)$/;
            const hashMatch = window.location.hash.match(HASH_REGEX);
            if (hashMatch) {
                // if first match includes "=" it's not a session
                if (hashMatch[1].includes("=")) {
                    sessionArgs = `${hashMatch[1]}&${hashMatch[2]}`;
                    return "";
                }
                sessionArgs = hashMatch[2];    // used in setSession()
                return hashMatch[1];
            }
        }
        // check session arg
        if (typeof this.session === "string") {
            sessionArgs = window.location.hash.slice(1);
            return this.session;
        }
        // no session
        return "";
    }

    setSession(session, replace=false) {
        // make sure sessionFromPath, sessionApp and sessionArgs
        // are initialized
        if (sessionFromPath == null) this.getSession();
        const {search, hash} = window.location;
        const url = sessionFromPath
            ? `/${sessionApp}/${session}${search}${hash}`
            : `#${session}${sessionArgs ? "&" + sessionArgs: ""}`;
        if (replace) window.history.replaceState({}, "", url);
        else window.history.pushState({}, "", url);
    }

    isHost(hostname) {
        const actualHostname = window.location.hostname;
        if (actualHostname === hostname) return true;
        if (hostname !== "localhost") return false;
        // answer true for a variety of localhost equivalents
        if (actualHostname.endsWith(".ngrok.io")) return true;
        if (actualHostname === "croquet.io") {
            const path = window.location.pathname;
            if (path.match(/^\/(dev|files)\//)) return true;
        }
        if (window.location.protocol === "file:") return true;
        return ["127.0.0.1", "[::1]"].includes(actualHostname);
    }

    isLocalhost() {
        return this.isHost("localhost");
    }
}

function parseUrlOptionString(target, optionString) {
    if (!optionString) return;
    for (const arg of optionString.split("&")) {
        const keyAndVal = arg.split("=");
        const key = keyAndVal[0];
        let val = true;
        if (keyAndVal.length > 1) {
            val = decodeURIComponent(keyAndVal.slice(1).join("="));
            if (val.match(/^(true|false|null|[0-9.]*|["[{].*)$/)) {
                try { val = JSON.parse(val); } catch (e) {
                    if (val[0] === "[") val = val.slice(1, -1).split(","); // handle string arrays
                    // if not JSON use string itself
                }
            }
        }
        target[key] = val;
    }
}

const urlOptions = new UrlOptions();
export default urlOptions;
