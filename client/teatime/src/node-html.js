import urlOptions from "./node-urlOptions";
import { toBase64url } from "./hashing";

// this is the default App.messageFunction
export function showMessageInConsole(msg, options = {}) {
    const level = options.level;
    console.log(`${level === 'status' ? "" : (level + ": ")} ${msg}`);
}

export function displayError(msg, options={}) {
    return msg && App.showMessage(msg, { ...options, level: 'error' });
}

export function displayWarning(msg, options={}) {
    return msg && App.showMessage(msg, { ...options, level: 'warning' });
}

export function displayStatus(msg, options={}) {
    return msg && App.showMessage(msg, { ...options, level: 'status' });
}

export function displayAppError(where, error, level = "error") {
    console.error(`Error during ${where}`, error);
    const userStack = (error.stack || '').split("\n").filter(l => !l.match(/croquet-.*\.min.js/)).join('\n');
    App.showMessage(`Error during ${where}: ${error.message}\n\n${userStack}`,  {
        level,
        duration: level === "error" ? 10000 : undefined,
        stopOnFocus: true,
    });
}

export const App = {
    get libName() { return globalThis.__MULTISYNQ__ ? "Multisynq" : "Croquet"; },

    sessionURL: null,
    root: false, // root for messages, the sync spinner, and the info dock (defaults to document.body)
    sync: false, // whether to show the sync spinner while starting a session, or catching up
    messages: false, // whether to show status messages (e.g., as toasts)

    // the following can take a DOM element, an element ID, or false (to suppress)
    badge: false, // the two-colour session badge and 5-letter moniker
    stats: false, // the frame-by-frame stats display
    qrcode: false,

    // make a fancy collapsible dock of info widgets (currently badge, qrcode, stats).
    // disable any widget by setting e.g. { stats: false } in the options.
    makeWidgetDock() { },

    // build widgets in accordance with latest settings for root, badge, stats, and qrcode.
    // called internally immediately after a session is established.
    // can be called by an app at any time, to take account of changes in the settings.
    makeSessionWidgets() { },

    // make a canvas painted with the qr code for the currently set sessionURL (if there is one).
    makeQRCanvas() { return null; },

    clearSessionMoniker() { },

    showSyncWait(_bool) { },

    // messageFunction(msg, options) - where options from internally generated messages will include { level: 'status' | 'warning' | 'error' }
    messageFunction: showMessageInConsole,

    showMessage(msg, options={}) {
        // thin layer on top of messageFunction, to discard messages if there's nowhere
        // (or no permission) to show them
        if (urlOptions.nomessages || App.root === false || App.messages === false || !App.messageFunction) {
            if (options.level === "warning") console.warn(msg);
            if (options.level === "error") console.error(msg);
            return null;
        }

        return App.messageFunction(msg, options);
    },

    // this is also used in prerelease.js [or is it?]
    isCroquetHost(hostname) {
        return hostname.endsWith("croquet.io")
            || ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
            || hostname.endsWith("ngrok.io");
    },

    // sanitized session URL (always without @user:password and #hash, and without query if not same-origin as croquet.io)
    referrerURL() {
        return "http://localhost/node.html";
    },

    // session name is typically `${app}/${fragment}` where
    // "app" is constant and "fragment" comes from this autoSession
    autoSession(options = { key: 'q' }) {
        if (typeof options === "string") options = { key: options };
        if (!options) options = {};
        const key = options.key || 'q';
        let fragment = urlOptions[key] || '';
        if (fragment) try { fragment = decodeURIComponent(fragment); } catch (ex) { /* ignore */ }
        // if not found, create random fragment
        else {
            fragment = Math.floor(Math.random() * 36**10).toString(36);
            console.warn(`no ${App.libName} session name provided, using "${fragment}"`);
        }
        if (urlOptions.has("debug", "session")) console.log(`${App.libName}.App.autoSession: "${fragment}"`);
        // return Promise for future-proofing
        const retVal = Promise.resolve(fragment);
        // warn about using it directly
        retVal[Symbol.toPrimitive] = () => {
            console.warn(`Deprecated: ${App.libName}.App.autoSession() return value used directly. It returns a promise now!`);
            return fragment;
        };
        return retVal;
    },

    autoPassword(options = { key: 'pw' }) {
        const key = options.key || 'pw';
        let password = urlOptions[key] || '';
        // create random password if none provided
        if (!password) {
            const buffer = require('crypto').randomBytes(16); // eslint-disable-line global-require
            password = toBase64url(buffer);
            console.warn(`no ${App.libName} session password provided, using "${password}"`);
        }
        if (urlOptions.has("debug", "session")) console.log(`${App.libName}.App.autoPassword: "${password}"`);
        // return Promise for future-proofing
        const retVal = Promise.resolve(password);
        // warn about using it directly
        retVal[Symbol.toPrimitive] = () => {
            console.warn(`Deprecated: ${App.libName}.App.autoPassword() return value used directly. It returns a promise now!`);
            return password;
        };
        return retVal;
    },
};
