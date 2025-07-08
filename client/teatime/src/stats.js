const StartDate = Date.now();
if (typeof performance === "undefined") window.performance = { now: () => Date.now() - StartDate };

const order = [
    "simulate",
    "update",
    "render",
    "snapshot",
];

const colors = {
    total: "black",
    update: "blue",
    render: "magenta",
    simulate: "yellow",
    snapshot: "green",
    backlog: "red",
    network: "lightgray",
};

let statsDiv = null;
let canvas = null;
let ctx = null;
let drawX = 0;
export const PLOT_BACKLOG = false; // currently the true case is not well supported

let fps = null;
let fCtx = null;

let horizCanvas;
let hCtx;

let backlogCanvas;
let bCtx;

export function makeStats(div) {
    statsDiv = div;

    while (div.firstChild) div.removeChild(div.firstChild);

    div.style.background = '#faf0dc';

    fps = document.createElement('canvas');
    fCtx = fps.getContext("2d");

    fps.id = 'text_stats';
    fps.width = Math.min(140, window.innerWidth);
    fps.height = 36;
    fps.style.width = fps.width;
    fps.style.height = fps.height;
    fCtx.font = '9.5pt sans-serif';
    div.appendChild(fps);

    // ael: used to be on canvas - but that now has "pointer-events: none"
    div.title = Object.entries(colors).map(([k, c]) => `${c}: ${k}`).join('\n');

    canvas = document.createElement('canvas');
    canvas.width = Math.min(125, window.innerWidth);
    canvas.height = (PLOT_BACKLOG ? 360 : 125);
    canvas.style.width = "100%";

    const innerDiv = document.createElement("div");
    innerDiv.id = "innerDiv";

    div.appendChild(innerDiv);
    innerDiv.appendChild(canvas);
    ctx = canvas.getContext("2d");
}

const frames = [];
let maxBacklog = 0;
let connected = false;
let currentFrame = newFrame(0);

const oneFrame = 1000 / 60;
function map(v) {
    return (1 - v / oneFrame) * 20 + 60;
    // zero is at y=80; a full frame's time (at 60Hz) subtracts 20
}

function makeOverlayCanvas(baseCanvas) {
    const c = document.createElement('canvas');
    c.width = baseCanvas.width;
    c.height = baseCanvas.height;
    c.style.width = "100%";
    c.style.position = "absolute";
    c.style.left = "0px";

    const innerDiv = statsDiv.querySelector("#innerDiv");
    innerDiv.appendChild(c);
    return c;
}

function makeHorizCanvas(baseCanvas) {
    horizCanvas = makeOverlayCanvas(baseCanvas);
    hCtx = horizCanvas.getContext("2d");

    hCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    for (let y = 0; y < 60; y += oneFrame) {
        const m = map(y);
        hCtx.moveTo(0, m);
        hCtx.lineTo(horizCanvas.width, m);
        hCtx.stroke();
    }
}

function makeBacklogCanvas(baseCanvas) {
    backlogCanvas = makeOverlayCanvas(baseCanvas);
    bCtx = backlogCanvas.getContext("2d");
}

function cleanupOverlayCanvases() {
    if (horizCanvas) {
        horizCanvas.remove();
        hCtx = null;
    }
    if (backlogCanvas) {
        backlogCanvas.remove();
        bCtx = null;
    }
}

function drawTextStats(avgMS, maxMS) {
    fCtx.globalCompositeOperation = "copy";
    fCtx.fillStyle = "rgb(255, 255, 255, 0)";
    fCtx.fillRect(0, 0, fps.width, fps.height);

    fCtx.fillStyle = "rgb(0, 0, 0, 1)";
    fCtx.globalCompositeOperation = "source-over";
    let line = `${currentFrame.users} users, ${Math.round(1000/avgMS)} fps`;
    if (maxMS > 70) line += ` ${Math.ceil(maxMS).toLocaleString()}ms`;
    fCtx.fillText(line, 2, 15);

    line = (currentFrame.backlog < 100 && currentFrame.activity < 1000
            ? `latency: ${currentFrame.latency} ms`
            : `backlog: ${currentFrame.backlog < 100 ? '0.0' : (currentFrame.backlog/1000).toFixed(1)} s`);
    fCtx.fillText(line, 2, 33);
}

function newFrame(now) {
    return {
        start: now,
        total: 0,
        items: {},
        users: 0,
        backlog: 0,
        network: 0,
        latency: 0,
        activity: 1000,
        connected
    };
}

function endCurrentFrame(timestamp) {
    // add current frame to end
    currentFrame.total = timestamp - currentFrame.start;
    const limit = Math.min(120, window.innerWidth);
    // drop at least one to make room
    if (frames.length >= limit) {frames.splice(0, frames.length - limit + 1);}
    frames.push(currentFrame);

    if  (frames.length <= 1) return;

    if (!statsDiv) return;
    if (statsDiv.offsetHeight === 0) return;

    // get base framerate as minimum of all frames
    const realFrames = frames.slice(1).filter(f => f.total);
    const avgMS = realFrames.map(f => f.total).reduce((a, b) => a + b, 0) / realFrames.length;
    const maxMS = Math.max(...realFrames.map(f => f.total));
    const newMax = Math.max(...realFrames.map(f => Math.max(f.backlog, f.network)));
    maxBacklog = PLOT_BACKLOG ? Math.max(newMax, maxBacklog * 0.98) : 1000; // reduce scale slowly

    drawTextStats(avgMS, maxMS);

    if (!horizCanvas) {makeHorizCanvas(canvas);}
    if (PLOT_BACKLOG && !backlogCanvas) {makeBacklogCanvas(canvas);}

    if (drawX === canvas.width) {
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(canvas, 1, 0, canvas.width - 1, canvas.height, 0, 0, canvas.width - 1, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "transparent";
        ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
    } else {
        drawX++;
    }
    // for backlog, zero maps to y=85
    // max with flexible backlog is what -200ms would look like at frame scale (80 + 12frames * 20 + 5) => 325
    // max with fixed backlog (so we're only plotting network delay) makes 1s of delay plot as 2 frames' height.
    const mapBacklog = v => map(PLOT_BACKLOG ? (v / Math.max(3000, maxBacklog) * -200) : (v / maxBacklog * -2 * oneFrame)) + 5;

    {
        const frame = frames[frames.length - 1];
        const x = drawX - 0.5; // it is already incremented so go half pixel left to draw
        let y = map(0);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, map(frame.total));
        ctx.strokeStyle = colors[frame.connected ? "total" : "network"];
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        y = map(frame.total);
        let ms = 0;
        for (const item of order) {
            if (!frame.items[item]) continue;
            ms += frame.items[item];
            y = map(ms);
            ctx.lineTo(x, y);
            ctx.strokeStyle = colors[item];
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        if (frame.network) {
            ctx.beginPath();
            ctx.moveTo(x, mapBacklog(0));
            ctx.lineTo(x, mapBacklog(frame.network));
            ctx.strokeStyle = colors["network"];
            ctx.stroke();
        }
        if (PLOT_BACKLOG && frame.backlog) {
            ctx.beginPath();
            ctx.moveTo(x, mapBacklog(0));
            ctx.lineTo(x, mapBacklog(frame.backlog));
            ctx.strokeStyle = colors["backlog"];
            ctx.stroke();
        }
    }

    if (PLOT_BACKLOG && maxBacklog > 500) {
        // draw lines with labels for backlog
        // use log10 to draw lines every 1s, or 10s, or 100s etc.
        const unit = 10 ** Math.floor(Math.log10(Math.max(3000, maxBacklog)));
        bCtx.clearRect(0, 0, backlogCanvas.width, backlogCanvas.height);
        bCtx.font = '10pt sans-serif';
        bCtx.fillStyle = 'rgba(255, 255, 0, 1)';
        for (let i = 1; i < 11; i++) {
            const value = i * unit;
            const y = mapBacklog(value);
            bCtx.moveTo(0, y);
            bCtx.lineTo(120, y);
            bCtx.stroke();
            bCtx.fillText(`${value / 1000}s`, 0, y - 5);
            if (value > maxBacklog) break;
        }
    }

    if (PLOT_BACKLOG) statsDiv.style.bottom = mapBacklog(Math.max(1000, maxBacklog)) - 350;
}

const stack = []; // stack of current timing items (begin/end pairs)

const networkTraffic = {}; // network stats accumulators
let currentSecond = {}; // message bundling stats logged per second

export const Stats = {
    frames, // only to expose it for testing

    animationFrame(timestamp, stats={}) {
        endCurrentFrame(timestamp);
        currentFrame = newFrame(timestamp);
        // controller.stepSession invokes this with a stats object with entries
        // { backlog, starvation, latency, activity, users }.  below are methods
        // for each key, recording the supplied values in currentFrame.
        for (const [key, value] of Object.entries(stats)) this[key](value);
    },
    begin(item) {
        // start inner measurement
        const now = performance.now();
        currentFrame.items[item] = (currentFrame.items[item] || 0) - now;
        // stop outer measurement
        const outer = stack[stack.length - 1];
        if (outer) currentFrame.items[outer] += now;
        stack.push(item);
        return now;
    },
    end(item) {
        // stop inner measurement
        const now = performance.now();
        currentFrame.items[item] += now;
        // start outer measurement
        const expected = stack.pop();
        if (expected !== item) throw Error(`Unmatched stats calls: expected end("${expected}"), got end("${item}")`);
        const outer = stack[stack.length - 1];
        if (outer) currentFrame.items[outer] -= now;
        return now;
    },
    backlog(ms) {
        currentFrame.backlog = Math.max(ms, currentFrame.backlog);
    },
    starvation(ms) {
        currentFrame.network = ms;
    },
    latency(ms) {
        currentFrame.latency = ms;
    },
    activity(ms) {
        currentFrame.activity = ms;
    },
    users(users) {
        currentFrame.users = users;
    },
    connected(bool) {
        const wasConnected = connected;
        currentFrame.connected = connected = bool;
        if (wasConnected && !connected) {
            cleanupOverlayCanvases();
        }
    },

    // accumulate network traffic
    networkTraffic,
    addNetworkTraffic(key, bytes, storeForAudit=false) {
        networkTraffic[key] = (networkTraffic[key] || 0) + bytes;
        if (storeForAudit) networkTraffic[`audit_${key}`] = (networkTraffic[`audit_${key}`] || 0) + bytes;
    },
    resetAuditStats() {
        for (const key in networkTraffic) {
            if (key.startsWith('audit_')) networkTraffic[key] = 0;
        }
    },

    // the stats gathered here (iff window.logMessageStats is truthy) are reported by
    // Stats.stepSession (below), which is invoked by controller.stepSession on every step.
    perSecondTally(stats = {}) {
        if (!window.logMessageStats) return;

        for (const [key, value] of Object.entries(stats)) currentSecond[key] = (currentSecond[key] || 0) + value;
    },
    stepSession(_timestamp, report=false) {
        const second = Math.floor(Date.now() / 1000);

        if (!window.logMessageStats) {
            // no reporting needed.  keep updating the per-second record, ready for logging
            // to start.
            currentSecond = { second };
            return null;
        }

        let result = null;
        if (second !== currentSecond.second) {
            // don't report if no messages have been requested or sent
            if (currentSecond.second && report && (currentSecond.requestedMessages || currentSecond.sentMessagesTotal)) {
                result = { ...currentSecond };
                // if multiple seconds have passed, add a sampleSeconds property
                const sampleSeconds = second - currentSecond.second;
                if (sampleSeconds !== 1) result.sampleSeconds = sampleSeconds;
                // average the size of bundles, and the delays in sending messages via a bundle
                if (result.sentBundles) {
                    result.averageDelay = Math.round(10 * result.sendDelay / result.sentMessagesTotal) / 10;
                    result.averageBundlePayload = Math.round(result.sentBundlePayload / result.sentBundles);
                }
                // clean up
                delete result.second;
                delete result.sendDelay;
                delete result.sentBundlePayload;
            }
            currentSecond = { second };
        }
        return result;
    }
};

globalThis.CROQUETSTATS = Stats;
