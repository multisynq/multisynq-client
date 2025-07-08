import Toastify from 'toastify-js';
import SeedRandom from "../thirdparty-patched/seedrandom/seedrandom";
import QRCode from "../thirdparty-patched/qrcodejs/qrcode";
import urlOptions from "./urlOptions";
import { toBase64url } from "./hashing";
import { makeStats } from "./stats";


const TOUCH = 'ontouchstart' in document.documentElement;
const IFRAMED = window && window.parent !== window;
const BAR_PROPORTION = 18; // height of dock, in % of content size
const BUTTON_RIGHT = 2; // %
const BUTTON_WIDTH = TOUCH ? 20 : 12; // %
const BUTTON_SEPARATION = 2; // %
const BUTTON_OFFSET = TOUCH ? 0 : 15; // extra % from the right
const CONTENT_MARGIN = 2; // px
const TRANSITION_TIME = 0.3; // seconds

// add style for the standard widgets that can appear on a Croquet page
let addedWidgetStyle = false;
function addWidgetStyle() {
    if (addedWidgetStyle) return;
    addedWidgetStyle = true;
    const widgetCSS = `
        #croquet_dock { position: fixed; z-index: 2; border: 3px solid white; bottom: 6px; left: 6px; width: 36px; height: 36px; box-sizing: border-box; background: white; opacity: 0.4; transition: all ${TRANSITION_TIME}s ease; }
        #croquet_dock.active { opacity: 0.95; border-radius: 12px; }
        #croquet_dock.debug { width: 84px; }
        #croquet_dock_bar { position: absolute; border: 3px solid white; width: 100%; height: 30px; box-sizing: border-box; background: white; }

        #croquet_badge { position: absolute; width: 72px; height: 24px; top: 50%; transform: translate(0px, -50%); cursor: none; }
        #croquet_dock.active #croquet_badge { left: 2%; }
        #croquet_dock:not(.debug) #croquet_badge { display: none; }

        .croquet_dock_button { position: absolute; width: ${BUTTON_WIDTH}%; height: 90%; top: 50%; transform: translate(0px, -50%); border-radius: 20%; }
        .croquet_dock_button:focus { outline: 0; }
        .croquet_dock_button canvas { position: absolute; width: 100%; height: 100%; top: 0px; left: 0px; }
        #croquet_dock:not(.active) .croquet_dock_button { display: none; }
        #croquet_dock_left { right: ${BUTTON_RIGHT + BUTTON_OFFSET + BUTTON_WIDTH + BUTTON_SEPARATION}% }
        #croquet_dock:not(.debug) #croquet_dock_left { display: none; }
        #croquet_dock_right { right: ${BUTTON_RIGHT + BUTTON_OFFSET}%; }
        #croquet_dock:not(.debug) #croquet_dock_right { display: none; }
        #croquet_dock_pin { right: ${BUTTON_RIGHT}%; }
        #croquet_dock_pin.pinned { background: #cce6ff; }

        #croquet_dock_content { position: absolute; left: ${CONTENT_MARGIN}px; top: ${CONTENT_MARGIN}px; right: ${CONTENT_MARGIN}px; bottom: ${CONTENT_MARGIN}px; background: white; overflow: hidden; }
        #croquet_dock.debug:not(.active) #croquet_dock_content { display: none; }
        #croquet_dock.debug:not(.active) #croquet_dock_content div { display: none; }

        #croquet_qrcode { position: absolute; width: 100%; height: 100%;box-sizing: border-box; cursor: crosshair; }
        #croquet_dock.active #croquet_qrcode { border: 6px solid white; }
        #croquet_dock.debug #croquet_qrcode:not(.active) { display: none; }
        #croquet_qrcode canvas { image-rendering: pixelated; }

        #croquet_stats { position: absolute; width: 70%; height: 90%; left: 15%; top: 5%; opacity: 0.8; font-family: sans-serif; }
        #croquet_stats:not(.active) { display: none; }
`;
    const widgetStyle = document.createElement("style");
    widgetStyle.innerHTML = widgetCSS;
    document.head.insertBefore(widgetStyle, document.head.querySelector("style,link[rel=stylesheet]"));
}

// add style for the spinner
let addedSpinnerStyle = false;
function addSpinnerStyle() {
    if (addedSpinnerStyle) return;
    addedSpinnerStyle = true;
    // unless this app is explicitly rejecting our default html additions by setting
    // App.root to false (in which case the spinner won't be made), we add a default
    // minimum height for document.body to help our IntersectionObserver (controller.js)
    // make accurate judgements about whether an iframed app is in or out of view.
    const spinnerCSS = `
        ${IFRAMED ? "body { min-height: 100vh }" : ""}
        #croquet_spinnerOverlay {
            z-index: 1000;
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color:#333;
            opacity:0.9;
            display:flex;
            align-items:center;
            justify-content:center;
            transition: opacity 1.0s ease-out;
        }
        /* https://github.com/lukehaas/css-loaders */
        @keyframes croquet_dots {
            0%, 80%, 100% { box-shadow: 0 2.5em 0 -1.3em; }
            40% { box-shadow: 0 2.5em 0 0; }
        }
        #croquet_loader,
        #croquet_loader::before,
        #croquet_loader::after {
          border-radius: 50%;
          width: 2.5em;
          height: 2.5em;
          animation: croquet_dots 1.8s infinite ease-in-out;
        }
        #croquet_loader {
          color: #fff;
          font-size: 10px;
          margin: 80px auto;
          position: relative;
          text-indent: -9999em;
          animation-delay: -0.16s;
        }
        #croquet_loader::before,
        #croquet_loader::after {
          content: '';
          position: absolute;
          top: 0;
        }
        #croquet_loader::before { left: -3.5em; animation-delay: -0.32s; }
        #croquet_loader::after { left: 3.5em; }
        #croquet_spinnerOverlay.croquet_error>*,
        #croquet_spinnerOverlay.croquet_error>*::before,
        #croquet_spinnerOverlay.croquet_error>*::after {
            color: #f00;
        }
        #croquet_spinnerOverlay.croquet_fatal>*,
        #croquet_spinnerOverlay.croquet_fatal>*::before,
        #croquet_spinnerOverlay.croquet_fatal>*::after {
            color: #f00;
            box-shadow: 0 2.5em 0 0 !important;
            animation: none !important;
        }
`;
    const spinnerStyle = document.createElement("style");
    spinnerStyle.innerHTML = spinnerCSS;
    document.head.insertBefore(spinnerStyle, document.head.querySelector("style,link[rel=stylesheet]"));
}

let addedToastifyStyle = false;
function addToastifyStyle() {
    if (addedToastifyStyle) return;
    addedToastifyStyle = true;
    // inject toastify's standard css
    let toastifyCSS = `/*!
        * Toastify js 1.5.0
        * https://github.com/apvarun/toastify-js
        * @license MIT licensed
        *
        * Copyright (C) 2018 Varun A P
        */
        .toastify {
            padding: 12px 20px;
            color: #ffffff;
            display: inline-block;
            box-shadow: 0 3px 6px -1px rgba(0, 0, 0, 0.12), 0 10px 36px -4px rgba(77, 96, 232, 0.3);
            background: -webkit-linear-gradient(315deg, #73a5ff, #5477f5);
            background: linear-gradient(135deg, #73a5ff, #5477f5);
            position: fixed;
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.215, 0.61, 0.355, 1);
            border-radius: 2px;
            cursor: pointer;
            text-decoration: none;
            max-width: calc(50% - 20px);
            z-index: 2147483647;
        }
        .toastify.on {
            opacity: 1;
        }
        .toast-close {
            opacity: 0.4;
            padding: 0 5px;
        }
        .toastify-right {
            right: 15px;
        }
        .toastify-left {
            left: 15px;
        }
        .toastify-top {
            top: -150px;
        }
        .toastify-bottom {
            bottom: -150px;
        }
        .toastify-rounded {
            border-radius: 25px;
        }
        .toastify-avatar {
            width: 1.5em;
            height: 1.5em;
            margin: 0 5px;
            border-radius: 2px;
        }
        @media only screen and (max-width: 360px) {
            .toastify-right, .toastify-left {
                margin-left: auto;
                margin-right: auto;
                left: 0;
                right: 0;
                max-width: fit-content;
            }
        }
`;
    // add our own (post-v1.5.0) preferences
    toastifyCSS += `
        .toastify {
            font-family: sans-serif;
            border-radius: 8px;
        }

        .toastify-center {
            margin-left: auto;
            margin-right: auto;
            left: 0;
            right: 0;
            max-width: fit-content;
            max-width: -moz-fit-content;
        }
`;
    const toastifyStyle = document.createElement("style");
    toastifyStyle.innerHTML = toastifyCSS;
    document.head.insertBefore(toastifyStyle, document.head.querySelector("style,link[rel=stylesheet]"));
}

// this is the default App.messageFunction
export function showMessageAsToast(msg, options = {}) {
    const level = options.level;
    let gradient;
    if (level === 'error') { gradient = 'orangered,red'; console.error(msg); }
    else if (level === 'warning') { gradient = 'gold,orange'; console.warn(msg); }
    else gradient = 'silver,gray';

    return displayToast(msg, { style: { background: `linear-gradient(90deg,${gradient})`}, ...options });
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

function displayToast(msg, options) {
    const parentDef = findElement(App.root, () => document.body);
    if (parentDef === false) return null;

    addToastifyStyle();

    const toastOpts = {
        text: msg,
        duration: 3000,
        //close: true,
        gravity: 'bottom', // `top` or `bottom`
        position: 'right', // `left`, `center` or `right`
        stopOnFocus: true, // Prevents dismissing of toast on hover
        ...options };

    let selector;
    if (parentDef instanceof Element && parentDef !== document.body) {
        // toastify needs an id, not an element.  if the element has no id, give it one.
        selector = parentDef.id;
        if (!selector) parentDef.id = selector = '_croquetToastParent';
    } else if (typeof parentDef === 'string') selector = parentDef;
    // else fall through with no selector (so body will be used as parent)

    if (selector) toastOpts.selector = selector;

    return Toastify(toastOpts).showToast();
}

function monikerForId(id) {
    // random page title suffix
    const random = new SeedRandom(id);
    const letters = ['bcdfghjklmnpqrstvwxyz', 'aeiou'];
    let moniker = '';
    for (let i = 0; i < 5; i++) moniker += letters[i % 2][random.quick() * letters[i % 2].length | 0];
    return moniker;
}

function colorsForId(id, n=1) {
    const random = new SeedRandom(id);
    const colors = [];
    for (let i=0; i<n; i++) colors.push(`hsl(${random.quick() * 360}, 50%, 70%)`);
    return colors;
}

function clearSessionMoniker() {
    if (App.badge === false) return; // we have reason to believe the moniker was never set (so don't mess with a title that might be being used to show something else)

    document.title = document.title.replace(/:.*/, '');
}

let localStorage;
try {
    // check if we're allowed to use localStorage
    localStorage = window.localStorage;
    localStorage['croquet-debug-persist-allowed'] = "true";
    if (localStorage['croquet-debug-persist-allowed'] !== "true") throw Error("localStorage not persisted");
    delete localStorage['croquet-debug-persist-allowed'];
} catch (err) {
    // if not, fake it
    console.warn('localStorage not allowed');
    localStorage = {};
}

const dockState = {
    // localStorage is per-host, but we also want per-app
    get pinned() { return localStorage[window.location.pathname + '/croquet-debug-ui-pinned'] === "true"; },
    set pinned(bool) { localStorage[window.location.pathname + '/croquet-debug-ui-pinned'] = !!bool; },
    get activePage() { return localStorage[window.location.pathname + '/croquet-debug-ui-activePage']; },
    set activePage(id) { localStorage[window.location.pathname + '/croquet-debug-ui-activePage'] = id; },
};

const smotherEvent = evt => {
    // console.log("smothering event", evt);
    evt.preventDefault();
    evt.stopPropagation();
};

// an app can call App.makeWidgetDock with options specifying which of the widgets to include
// in the dock.  by default, widgets badge, qrcode, stats are shown; turn off by setting
// corresponding options property to false.
function makeWidgetDock(options = {}) {
    if (urlOptions.nodock) return;

    const debug = options.debug || urlOptions.debug;

    const oldDockDiv = document.getElementById('croquet_dock');
    if (oldDockDiv) oldDockDiv.parentElement.removeChild(oldDockDiv);

    const dockParent = findElement(App.root, () => document.body);
    if (!dockParent) return;

    addWidgetStyle();

    const dockDiv = document.createElement('div');
    dockDiv.id = 'croquet_dock';
    if (debug) dockDiv.classList.add("debug");
    if (IFRAMED && options.iframe === false) dockDiv.style.display = "none";
    dockParent.appendChild(dockDiv);

    const barDiv = document.createElement('div');
    barDiv.id = 'croquet_dock_bar';
    dockDiv.appendChild(barDiv);

    let badgeDiv;
    if (options.badge !== false) {
        badgeDiv = document.createElement('div');
        badgeDiv.id = 'croquet_badge';
        barDiv.appendChild(badgeDiv);
        App.badge = badgeDiv;
    }

    const contentDiv = document.createElement('div');
    contentDiv.id = 'croquet_dock_content';
    dockDiv.appendChild(contentDiv);

    const dockPageIds = []; // an ordered collection of available page (i.e., element) ids

    let qrDiv;
    if (options.qrcode !== false) {
        const url = App.sessionURL;
        if (url) {
            qrDiv = document.createElement('div');
            qrDiv.id = 'croquet_qrcode';
            contentDiv.appendChild(qrDiv);
            dockPageIds.push(qrDiv.id);
            App.qrcode = qrDiv;
            if (!debug) dockState.activePage = qrDiv.id;
        }
    }

    let statsDiv;
    if (options.stats !== false) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'croquet_stats';
        contentDiv.appendChild(statsDiv);
        dockPageIds.push(statsDiv.id);
        App.stats = statsDiv;
    }

    if (dockPageIds.length) {
        function shiftPage(dir) {
            const numPages = dockPageIds.length;
            // on reconnect it's possible that a previously selected page is no longer available.
            // if so, or if no page has been selected yet, act as if the first was.
            let oldIndex = 0, oldElem;
            if (dockState.activePage) {
                const index = dockPageIds.indexOf(dockState.activePage);
                if (index >= 0) {
                    oldIndex = index;
                    oldElem = document.getElementById(dockState.activePage);
                } else dockState.activePage = null;
            }
            const newIndex = (oldIndex + numPages + dir) % numPages, newPage = dockPageIds[newIndex];
            let newElem;
            if (newPage === dockState.activePage) newElem = oldElem;
            else {
                if (oldElem) oldElem.classList.remove('active');
                newElem = document.getElementById(newPage);
            }
            if (newElem) newElem.classList.add('active');

            dockState.activePage = newPage;
        }

        if (dockPageIds.length > 1) {
            barDiv.appendChild(makeButton('<', 'croquet_dock_left', () => shiftPage(-1)));
            barDiv.appendChild(makeButton('>', 'croquet_dock_right', () => shiftPage(1)));
        }

        shiftPage(0); // set up a starting page (or re-select, if already set)
    }

    if (!TOUCH && !options.alwaysPinned) {
        const pinButton = makeButton('📌', 'croquet_dock_pin', () => {
            dockState.pinned = !dockState.pinned;
            setPinState();
            });
        const setPinState = () => { if (dockState.pinned) pinButton.classList.add('pinned'); else pinButton.classList.remove('pinned'); };
        setPinState();
        barDiv.appendChild(pinButton);
    }

    const expandedSize = 200;
    const minExpandedSize = 166;
    const expandedBorder = 8;
    const setCustomSize = sz => {
        dockDiv.style.width = `${sz}px`;
        const docHeight = sz * (1 + BAR_PROPORTION/100);
        dockDiv.style.height = `${docHeight}px`;

        const barHeight = sz * BAR_PROPORTION/100;
        barDiv.style.height = `${barHeight}px`;
        contentDiv.style.top = `${barHeight + CONTENT_MARGIN}px`;

        if (badgeDiv) {
            badgeDiv.style.height = `${barHeight * 0.9}px`;
            badgeDiv.style.width = `${barHeight * 0.9 * 3}px`;
        }

        if (qrDiv) qrDiv.style.border = `${expandedBorder * sz / expandedSize}px solid white`;
    };
    const removeCustomSize = () => {
        dockDiv.style.width = dockDiv.style.height = "";

        barDiv.style.height = "";
        contentDiv.style.top = "";

        if (badgeDiv) badgeDiv.style.height = badgeDiv.style.width = "";
        if (qrDiv) qrDiv.style.border = "";
    };
    let size = options.fixedSize || expandedSize; // start with default size for "active" state
    const active = () => dockDiv.classList.contains('active');
    const activate = () => {
        dockDiv.classList.add('active');
        setCustomSize(size);
        // remove timed transition, to allow instant response during mouse-wheel resizing
        setTimeout(() => dockDiv.style.transition = "none", TRANSITION_TIME * 1000);
        };
    const deactivate = () => {
        dockDiv.style.transition = ""; // remove override - i.e., revert to timed transition
        dockDiv.classList.remove('active');
        removeCustomSize();
        };
    if (TOUCH) {
        deactivate();
        dockDiv.ontouchstart = evt => {
            evt.preventDefault();
            evt.stopPropagation();
            if (active()) deactivate(); else activate();
            };
        dockDiv.ontouchend = smotherEvent;
        dockDiv.onpointerdown = smotherEvent;
        dockDiv.onpointerup = smotherEvent;
    } else {
        if (options.alwaysPinned) activate();
        else {
            if (dockState.pinned) activate(); else deactivate();
            dockDiv.onmouseenter = activate;
            dockDiv.onmouseleave = () => { if (!dockState.pinned) deactivate(); };
        }
        if (!options.fixedSize) {
            let lastWheelTime = 0;
            dockDiv.addEventListener("wheel", evt => {
                evt.stopPropagation();

                const now = Date.now();
                if (now - lastWheelTime < 100) return;
                lastWheelTime = now;

                let { deltaY } = evt;
                deltaY = Math.sign(deltaY) * Math.min(5, Math.abs(deltaY)); // real mouse wheels generate huge deltas
                const max = Math.min(window.innerWidth, window.innerHeight) * 0.8;
                size = Math.max(minExpandedSize, Math.min(max, dockDiv.offsetWidth / (1.05 ** deltaY)));
                setCustomSize(size);
            }, { passive: true });
        }
    }
}

function makeButton(text, id, fn) {
    const canvas = document.createElement('canvas');
    const w = canvas.width = 40 * BUTTON_WIDTH/12; // @@ fudge to allow diff button width on touch
    const h = canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.font = "36px Arial";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'black';
    ctx.fillText(text, w / 2, h * 0.55);

    const button = document.createElement('button');
    button.id = id;
    button.className = 'croquet_dock_button';
    const trigger = evt => {
        evt.preventDefault();
        evt.stopPropagation();
        fn();
        };
    if (TOUCH) {
        button.ontouchstart = trigger;
        button.ontouchend = smotherEvent;
        button.onpointerdown = smotherEvent;
        button.onpointerup = smotherEvent;
    } else {
        button.onclick = trigger;
        button.onpointerdown = smotherEvent;
        button.onpointerup = smotherEvent;
    }
    button.appendChild(canvas);
    return button;
}

function makeBadge(div, sessionId) {
    if (App.badge === false) return;

    const moniker = monikerForId(sessionId);
    document.title = document.title.replace(/:.*/, '');
    document.title += ':' + moniker;

    while (div.firstChild) div.removeChild(div.firstChild);
    const canvas = document.createElement('canvas');
    const w = canvas.width = 120;
    const h = canvas.height = 40;
    canvas.style.width = "100%";
    div.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = colorsForId(sessionId, 2);
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.font = "30px Arial";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'black';
    ctx.fillText(moniker, w/2, h/2);
}

// the QRCode maker takes an element and options (including the text for the code).
// it adds a canvas to the element, draws the code into the canvas, and returns an
// object that allows the code to be cleared and replaced.
function makeQRCode(div, url, options={}) {
    while (div.firstChild) div.removeChild(div.firstChild);
    return new QRCode(div, {
        text: url,
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L,   // L, M, Q, H
        ...options
        });
}

function displayBadgeIfNeeded(sessionId) {
    if (!sessionId || App.root === false) return;

    const badgeDiv = findElement(App.badge);
    if (!badgeDiv) return;

    makeBadge(badgeDiv, sessionId);
}

function toggleDebug() {
    const dockDiv = document.getElementById('croquet_dock');
    if (dockDiv) dockDiv.classList.toggle("debug");
}

function displayQRCodeIfNeeded() {
    if (App.root === false || App.qrcode === false) return;
    if (urlOptions.noqr) return;

    const url = App.sessionURL;
    if (!url) { console.warn("App.sessionURL is not set"); return; }

    const qrDiv = findElement(App.qrcode);
    if (!qrDiv) return;

    if (!TOUCH) qrDiv.onclick = evt => {
        evt.preventDefault();
        evt.stopPropagation();
        if (evt.shiftKey) toggleDebug();
        else window.open(url);
        };
    const qrcode = makeQRCode(qrDiv, url); // default options
    qrcode.getCanvas().style.width = "100%";
}

function displayStatsIfNeeded() {
    if (App.root === false) return;
    if (urlOptions.nostats) return;

    const statsDiv = findElement(App.stats);
    if (!statsDiv) return;

    makeStats(statsDiv);
}

function makeSessionWidgets(sessionId) {
    // sessionId can be undefined (in which case you won't get a badge)
    displayBadgeIfNeeded(sessionId);
    displayQRCodeIfNeeded();
    displayStatsIfNeeded();
}


let spinnerOverlay;
let spinnerEnabled; // set true when spinner is shown, or about to be shown
let spinnerTimeout = 0; // used to debounce.  only act on enabled true/false if steady for 500ms.

function displaySpinner(enabled) {
    if (spinnerEnabled === enabled) return;

    // don't overwrite "error" or "fatal" status
    if (typeof spinnerEnabled === "string" && enabled === true) return;

    if (App.sync === false) enabled = false;

    spinnerEnabled = enabled;
    if (enabled) {
        clearTimeout(spinnerTimeout);

        // set timer to add the overlay after 500ms iff still enabled
        spinnerTimeout = setTimeout(() => {
            if (!spinnerEnabled) return; // not enabled any more.  don't show.

            const parent = findElement(App.root, () => document.body);
            parent.appendChild(spinnerOverlay);

            spinnerOverlay.style.opacity = 0.9; // animate into view
            if (spinnerEnabled === "error") spinnerOverlay.className = "croquet_error";
            else if (spinnerEnabled === "fatal") spinnerOverlay.className = "croquet_fatal";
            else spinnerOverlay.className = "";
        }, 500);
    } else {
        if (!spinnerOverlay) return;

        clearTimeout(spinnerTimeout);

        spinnerOverlay.style.opacity = 0.0; // start the animated fade
        spinnerOverlay.className = "";

        // set timer to remove the overlay after 500ms iff still disabled
        spinnerTimeout = setTimeout(() => {
            if (spinnerEnabled) return; // now enabled.  don't remove.

            if (spinnerOverlay.parentElement) spinnerOverlay.parentElement.removeChild(spinnerOverlay);
        }, 500);
    }
}

function makeSpinner() {
    addSpinnerStyle();

    const overlay = document.createElement("div");
    overlay.id = "croquet_spinnerOverlay";

    const spinner = document.createElement("div");
    spinner.id = "croquet_loader";
    spinner.innerText = "Catching up...";

    overlay.appendChild(spinner);

    return overlay;
}

function findElement(value, ifNotFoundDo) {
    if (value === false) return false;

    if (value instanceof Element) return value;

    if (typeof value === "string") {
        const elem = document.getElementById(value);
        if (elem) return elem;
    }

    return ifNotFoundDo ? ifNotFoundDo() : null;
}

function defaultSessionURL() {
    // use window.location.href unless there is a canonical url

    let canonicalUrl = null;
    const metas = document.getElementsByTagName('link');
    for (const meta of metas) {
        if (meta.getAttribute('rel') === 'canonical') {
            canonicalUrl = meta.getAttribute('href');
            break;
        }
    }

    if (!canonicalUrl) {
        return window.location.href;
    }

    return canonicalUrl;
}

function secureRandomString(length=16) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes); // okay to use on insecure origin
    return toBase64url(bytes.buffer);
}

const seenMessages = new Set();

let _sessionURL = defaultSessionURL();

export const App = {
    get libName() { return globalThis.__MULTISYNQ__ ? "Multisynq" : "Croquet"; },

    get sessionURL() { return _sessionURL; },
    set sessionURL(url) { _sessionURL = url; displayQRCodeIfNeeded(); },
    root: null, // root for messages, the sync spinner, and the info dock (defaults to document.body)
    sync: true, // whether to show the sync spinner while starting a session, or catching up
    messages: false, // whether to show status messages (e.g., as toasts)

    // the following can take a DOM element, an element ID, or false (to suppress)
    badge: false, // the two-colour session badge and 5-letter moniker
    stats: false, // the frame-by-frame stats display
    qrcode: false,

    // make a fancy collapsible dock of info widgets (currently badge, qrcode, stats).
    // disable any widget by setting e.g. { stats: false } in the options.
    makeWidgetDock,

    // build widgets in accordance with latest settings for root, badge, stats, and qrcode.
    // called internally immediately after a session is established.
    // can be called by an app at any time, to take account of changes in the settings.
    makeSessionWidgets,

    // make a canvas painted with the qr code for the currently set sessionURL (if there is one).
    // options are used as overrides on our default settings, which are:
    // { width: 128, height: 128, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L }
    // the available CorrectLevel values are L, M, Q, H
    makeQRCanvas(options = {}) {
        if (!App.sessionURL) return null;

        const div = document.createElement('div');
        const qrcode = makeQRCode(div, App.sessionURL, options);
        return qrcode && qrcode.getCanvas();
    },

    clearSessionMoniker,

    showSyncWait(bool) {
        // usually first invoked with bool=true on controller construction in Session.join
        if (App.root === false) bool = false; // if root (now) false, only allow disabling
        else if (!spinnerOverlay) spinnerOverlay = makeSpinner(); // includes our default style for document.body

        displaySpinner(bool);
    },

    // messageFunction(msg, options) - where options from internally generated messages will include { level: 'status' | 'warning' | 'error' }
    messageFunction: showMessageAsToast,

    showMessage(msg, options={}) {
        // thin layer on top of messageFunction, to discard messages if there's nowhere
        // (or no permission) to show them, as well as add non-toastify features like
        // { only: "once" } or { level: "fatal" } or { showSyncWait: "error" }
        if (options.only === "once") {
            if (seenMessages.has(msg)) return null;
            seenMessages.add(msg);
        }
        if (options.level === "fatal") {
            options.level = "error";
            options.showSyncWait = "fatal";
        }
        if (options.showSyncWait) {
            if (options.showSyncWait === "fatal" && !options.duration) options.duration = -1;
            App.showSyncWait(options.showSyncWait);
        }
        if (urlOptions.nomessages || App.root === false || App.messages === false || !App.messageFunction) {
            if (options.level === "warning") console.warn(msg);
            if (options.level === "error") console.error(msg);
            return null;
        }

        return App.messageFunction(msg, options);
    },

    // this is also used in prerelease.js
    isCroquetHost(hostname) {
        return hostname.endsWith("croquet.io")
            || ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
            || hostname.endsWith("ngrok.io");
    },

    // sanitized session URL (always without @user:password and #hash, and without query if not same-origin as croquet.io)
    referrerURL() {
        const url = new URL(App.sessionURL);
        const sameOrigin = this.isCroquetHost(url.hostname);
        // can't use url.origin because Firefox answers "null" for file:// URLs
        return `${url.protocol}//${url.host}${url.pathname}${sameOrigin ? url.search : ""}`;
    },

    // get session name from url search under the key given, or create random name
    // If force=true, always create a new name (even if one is already there)
    // If default is given, use that instead of random
    // If keyless=true, allow ?name and #name without key (backwards compatibility)
    autoSession(options = { key: 'q', force: false, default: '', keyless: false }) {
        if (typeof options === "string") options = { key: options };
        if (!options) options = {};
        const key = options.key || 'q';
        const url = new URL(App.sessionURL);
        // fragment comes from ?key=fragment, or ?fragment or #fragment if keyless is enabled
        let fragment = '';
        if (!options.force) {
            // Note: cannot use url.searchParams because browsers differ for malformed % sequences
            const params = url.search.slice(1).split("&");
            const keyAndFragment = params.find(param => param.split("=")[0] === key);
            if (keyAndFragment) {
                fragment = keyAndFragment.replace(/[^=]*=/, '');
            } else if (options.keyless) {
                // allow keyless ?fragment
                fragment = params.find(param => !param.includes("="));
                if (!fragment) { // fall back to #fragment for old URLs
                    fragment = url.hash.slice(1);
                    if (fragment) { // ... but redirect to new url
                        url.hash = '';
                        if (url.search) url.searchParams.set(key, fragment);
                        else url.search = fragment;
                    }
                }
            }
        }
        // decode % entities if possible
        if (fragment) try { fragment = decodeURIComponent(fragment); } catch (ex) { /* ignore */ }
        // if not found, create random fragment
        else {
            if (options.default) fragment = options.default;
            else fragment = this.randomSession();
            url.searchParams.set(key, fragment);
        }
        // change page url if needed
        App.sessionURL = url.href;
        if (window.location.href !== url.href) {
            try {
                window.history.replaceState({}, "", url.href);
            } catch (ex) {
                App.showMessage(`Setting address bar to ${url.href}`, { only: "once" });
                App.showMessage(`Failed to change address bar: ${ex.message}`, { level: "warning", only: "once" });
            }
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

    // get password from url hash under the key given, or create random password
    // If scrub=true, remove it but keep in sessionURL for QR code (this makes
    //    debugging hard, set debug=password to keep anyways)
    // If keyless=true, allow #password without key (backwards compatibility)
    // If force=true, always create a new password (even if one is already there)
    // If default is given, use that instead of random
    autoPassword(options = { key: 'pw', default: '', force: false, scrub: false, keyless: false}) {
        if (typeof options === "string") options = { key: options };
        const key = options.key || 'pw';
        const scrub = options.scrub && !urlOptions.has("debug", "password");
        const keyless = options.keyless;
        const url = new URL(App.sessionURL);
        let password = '';
        const hash = options.force ? '' : url.hash.slice(1);
        if (hash) {
            const params = hash.split("&");
            const keyAndPassword = params.find(param => param.split("=")[0] === key);
            if (keyAndPassword) {
                password = keyAndPassword.replace(/[^=]*=/, '');
                // App.sessionURL has it, but scrub from address bar
                if (password && scrub) url.hash = params.filter(param => param.split("=")[0] !== key).join('&');
            } else if (keyless) { // allow keyless #password
                password = params.find(param => !param.includes("="));
                // App.sessionURL has it, but scrub from address bar
                if (password && scrub) url.hash = params.filter(param => param !== password).join('&');
            }
        }
        // create random password if none provided (or forced)
        if (!password) {
            if (options.default) password = options.default;
            else password = this.randomPassword();
            // add password to session URL for QR code
            if (hash) url.hash = `${hash}&${key}=${password}`;
            else if (keyless) url.hash = password;
            else url.hash = `${key}=${password}`;
            App.sessionURL = url.href;
            // but scrub it from address bar
            if (scrub) url.hash = keyless ? '' : hash;
        }
        if (urlOptions.has("debug", "session")) console.log(`${App.libName}.App.sessionUrl: ${App.sessionURL}`);
        // change url bar if needed
        if (window.location.href !== url.href) try {
            window.history.replaceState({}, "", url.href);
        } catch (ex) {
            App.showMessage(`Setting address bar to ${url.href}`, { only: "once" });
            App.showMessage(`Failed to change address bar: ${ex.message}`, { level: "warning", only: "once" });
        }
        // decode % entities if possible
        if (password) try { password = decodeURIComponent(password); } catch (ex) { /* ignore */ }
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

    randomSession(length=10) { return secureRandomString(length); },
    randomPassword(length=16) { return secureRandomString(length); },
};
