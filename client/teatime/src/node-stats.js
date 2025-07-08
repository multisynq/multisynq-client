const frames = [];
let connected = false;
let currentFrame = newFrame(0);
let currentSecond = {};

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
    frames.push(currentFrame);
    while (frames.length > 120) frames.shift();
}

const stack = [];
const networkTraffic = {}; // network stats accumulators

export const Stats = {
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
        currentFrame.connected = connected = bool;
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
    // the stats gathered here (iff globalThis.logMessageStats is truthy) are reported by
    // Stats.stepSession (below), which is invoked by controller.stepSession on every step.
    perSecondTally(stats = {}) {
        if (!globalThis.logMessageStats) return;

        for (const [key, value] of Object.entries(stats)) currentSecond[key] = (currentSecond[key] || 0) + value;
    },
    stepSession(_timestamp, report=false) {
        const second = Math.floor(Date.now() / 1000);

        if (!globalThis.logMessageStats) {
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
