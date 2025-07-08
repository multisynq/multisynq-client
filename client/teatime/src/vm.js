import stableStringify from "fast-json-stable-stringify";
import SeedRandom from "../thirdparty-patched/seedrandom/seedrandom";
import "@croquet/math"; // creates globalThis.CroquetMath
import PriorityQueue from "./priorityQueue";
import { Stats } from "./_STATS_MODULE_"; // eslint-disable-line import/no-unresolved
import { App, displayWarning, displayAppError } from "./_HTML_MODULE_"; // eslint-disable-line import/no-unresolved
import urlOptions from "./_URLOPTIONS_MODULE_"; // eslint-disable-line import/no-unresolved
import Model from "./model";
import { inModelRealm, inViewRealm } from "./realms";
import { viewDomain } from "./domain";
import Data, { DataHandleSpec } from "./data";

/** @typedef { import("./controller").default } Controller */

/** @type {VirtualMachine} */
let CurrentVM = null;

let DEBUG = null;
function initDEBUG() {
    // TODO: turn this into a reasonable API
    DEBUG = {
        snapshot: urlOptions.has("debug", "snapshot", false),               // snapshotting, uploading etc
        session: urlOptions.has("debug", "session", false),                 // session logging
        write: urlOptions.has("debug", "write", false),                     // check writes into model by proxying
    };
}

const DEBUG_WRITE_TARGET = Symbol("DEBUG_WRITE_TARGET");
let DEBUG_WRITE_PROXIES = null;

export function propertyAccessor(object, property) {
    return Array.isArray(object) || typeof property !== "string" ? `[${property}]` :
        property.match(/^[a-z_$][a-z0-9_$]*$/i) ? `.${property}` : `["${property}"]`;
}

/** this shows up as "CroquetWarning" in the console */
class CroquetWarning extends Error {}
Object.defineProperty(CroquetWarning.prototype, "name", { value: `${App.libName}Warning` });

/** patch Math and Date */
function patchBrowser() {
    // patch Math.random, and the transcendentals as defined in "@croquet/math"
    if (!globalThis.CroquetViewMath) {
        // make random use CurrentVM
        globalThis.CroquetMath.random = () => CurrentVM.random();
        // save all original Math properties
        globalThis.CroquetViewMath = {};
        for (const [funcName, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(Math))) {
            globalThis.CroquetViewMath[funcName] = descriptor.value;
        }
        // we keep the original Math object but replace the methods found in CroquetMath
        // with a dispatch based on being executed in model or view code
        for (const [funcName, modelFunc] of Object.entries(globalThis.CroquetMath)) {
            const viewFunc = Math[funcName];
            Math[funcName] = modelFunc.length === 1
                ? arg => CurrentVM ? modelFunc(arg) : viewFunc(arg)
                : (arg1, arg2) => CurrentVM ? modelFunc(arg1, arg2) : viewFunc(arg1, arg2);
        }
    }
    // patch Date.now to return VirtualMachine time if called from Model code
    if (!globalThis.CroquetViewDate) {
        // replace the original Date constructor function but return actual Date instances
        const SystemDate = globalThis.Date; // capture in closure
        // warn only once
        let warned = false;
        function modelDateWarning(expr, value) {
            if (!warned) {
                warned = true;
                // log CroquetWarning object to give developers a stack trace
                console.warn(new CroquetWarning(`${expr} used in Model code`));
            }
            return value;
        }
        // Date replacement
        function CroquetDate(a, b, c, d, e, f, g) {
            // written this way so CroquetDate.length === 7 per spec
            const calledWithNew = this instanceof CroquetDate; // slightly more efficient than new.target after Babel
            const args = [a, b, c, d, e, f, g];
            args.length = arguments.length;
            if (CurrentVM) {
                // Alwys warn. Even when providing arguments, instances still use local timezone
                // TODO: write complete replacement? Don't think so.
                modelDateWarning(calledWithNew ? "new Date()" : "Date()");
                switch (arguments.length) {
                    case 0: args.push(CurrentVM.time); break;
                    case 1: break;
                    default:
                        args[0] = SystemDate.UTC(...args);
                        args.length = 1;
                }
            }
            const instance = new SystemDate(...args);
            return calledWithNew ? instance : "" + instance;
        }
        // implement static properties
        CroquetDate.prototype = SystemDate.prototype;
        CroquetDate.UTC = SystemDate.UTC;
        CroquetDate.now =  () => CurrentVM ? modelDateWarning("Date.now()", CurrentVM.time) : SystemDate.now();
        CroquetDate.parse = (...args) => CurrentVM ? modelDateWarning("Date.parse()", 0) : SystemDate.parse(...args);
        // make original accessible
        globalThis.CroquetViewDate = SystemDate;
        // switch
        globalThis.Date = CroquetDate;
    }
}

/*
 * QFuncs are serializable functions.
 * They have an explicit "this" value and an environment that gets serialized
 * along with the source. The environment is a map of variable names to values.
 * If one of the variables references the function itself, its name is recorded in selfRef.
 * When resuming a snapshot, the function is compiled from source in its environment.
 * The environment is frozen to prevent modifications that would not be reflected in the closure.
 * All environment variables are made available as constants in the compiled function.
 */

const QFUNC = Symbol("QFUNC");

export function createQFunc(thisVal, env, fnOrSource, selfRef) {
    const qFunc = new QFunc(thisVal, env, fnOrSource, selfRef);
    const fn = qFunc.compile();
    fn[QFUNC] = qFunc;
    return fn;
}

function compileQFunc(source, thisVal, env, selfRef) {
    // pass env into compiler func as envVar
    const compilerParams = [];
    const compilerArgs = [];
    let thisVar, envVar, envKeys, envValues;
    if (env) {
        // normally thisVal is the model, but env.this overrides that
        if ("this" in env) {
            thisVal = env.this;
            // rename env.this to an unused variant of "this"
            // because "this" is a reserved word
            thisVar = "_this";
            while (thisVar in env) thisVar = '_' + thisVar;
            env = { ...env, [thisVar]: thisVal };
            delete env.this;
        }
        // sort env keys to ensure consistent order
        envKeys = [...Object.keys(env).sort()];
        envValues = [...envKeys.map(key => env[key])];
        // set envVar to an unused variant of "env"
        if (envKeys.length) {
            envVar = "env";
            while (envVar in env || envVar === selfRef) envVar = '_' + envVar;
            compilerParams.push(envVar);
            compilerArgs.push(envValues);
        }
    }
    // Make Croquet available if the word "Croquet" is found in the source
    if (source.match(/\bCroquet\b/) && !envKeys?.includes("Croquet")) {
        compilerParams.push("Croquet");
        compilerArgs.push(Model.Croquet);
    }
    // Same for Multisynq
    if (source.match(/\bMultisynq\b/) && !envKeys?.includes("Multisynq")) {
        compilerParams.push("Multisynq");
        compilerArgs.push(Model.Croquet);
    }
    // use selfRef or an unused variant of "qFunc" as fnVar
    let fnVar = selfRef || "qFunc";
    while (envKeys?.includes(fnVar)) fnVar = '_' + fnVar;
    // now build source for compiler function
    let compilerSrc = '"use strict"\n\n';
    compilerSrc += '// Croquet QFunc Compiler by Codefrau\n\n';
    compilerSrc += '//////////////// Start Compiler /////////////////\n';
    compilerSrc += 'try { const '; // error on undeclared variables
    // destructure env as constants to prevent accidental writes
    if (envKeys?.length) {
        compilerSrc += `[${envKeys.join(', ')}] = ${envVar}, `;
    }
    // remove indent from all lines
    // unless there is an odd number of backticks in any line
    // this helps when debugging and also makes the source smaller
    let lines = source.split('\n');
    const allButFirstLine = lines.slice(1);
    const minIndent = Math.min(...allButFirstLine.map(line => line.match(/^\s*/)[0].length));
    if (minIndent > 0) {
        const hasOddBackticks = lines.some(line => (line.match(/`/g) || []).length % 2 === 1);
        if (!hasOddBackticks) {
            lines = [lines[0], ...allButFirstLine.map(line => line.slice(minIndent))];
            source = lines.join('\n');
        }
    }
    // if last line is still indented, indent the first line to match
    const lastLine = lines[lines.length - 1];
    const lastIndent = lastLine.match(/^\s*/)[0];
    if (lastIndent) source = lastIndent + source;
    // compile source and store in fnVar
    compilerSrc += `${fnVar} =\n`;
    compilerSrc += '//////////////// Start User Code ////////////////\n\n';
    compilerSrc += source;
    compilerSrc += '\n\n///////////////// End User Code /////////////////\n';
    // return compiled function
    compilerSrc += `return ${fnVar}`;
    // ... possibly bound to env.this (does not work on fat-arrow functions, see below)
    if (thisVar) compilerSrc += `.bind(${thisVar})`;
    compilerSrc += ' } catch (compileError) { return compileError; }\n';
    compilerSrc += '///////////////// End Compiler //////////////////';
    try {
        // NOTE: the compiler call below establishes thisVal for fat-arrow functions
        // eslint-disable-next-line no-new-func
        const compiler = new Function(...compilerParams, compilerSrc);
        // we just compiled the compiler, now run it to get our function
        const fn = compiler.call(thisVal, ...compilerArgs);
        if (fn instanceof Error) {
            console.warn("rethrowing error", fn);
            throw fn;
        }
        // done
        return fn;
    } catch (error) {
        console.warn(`createQFunc compiling:\n\n${source}`);
        throw Error(`createQFunc(): ${error.message}`);
    }
}

class QFunc {
    // public API is new QFunc(this, env, fnOrSource, undefined)
    // snapshot API is new QFunc(this, env, source, selfRef)
    constructor(thisVal, env, fnOrSrc, fnSelfRef) {
        this.thisVal = thisVal;         // the this reference for the function (usually the model)
        this.env = env;                 // the environment for the function
        this.selfRef = fnSelfRef;       // env name referencing the function itself (for recursive calls)
        this.source = fnOrSrc;
        // new QFunc, not from snapshot
        if (fnSelfRef === undefined) {
            this.selfRef = "";
            if (typeof fnOrSrc === "function") this.source = fnOrSrc.toString();
            // if fn itself is in env, remove it and use it as selfRef instead
            const keys = Object.keys(env);
            for (const key of keys) {
                if (fnOrSrc === env[key]) {
                    if (this.selfRef) throw Error(`createQFunc: env.${this.selfRef} and env.${key} cannot both reference the function`);
                    this.selfRef = key;
                }
            }
            if (this.selfRef) {
                this.env = { ...env };
                delete this.env[this.selfRef];
            }
        }
        // freeze env to prevent modifications which would not be reflected in the closure
        Object.freeze(this.env);
    }

    compile() {
        return compileQFunc(this.source, this.thisVal, this.env, this.selfRef);
    }
}

const QFuncSpec = {
    cls: QFUNC, // not a class, special-cased when writing a Function
    write: ({[QFUNC]: {thisVal, env, source, selfRef}}) => [thisVal, source, selfRef, ...Object.entries(env).flat()],
    read: ([thisVal, source, selfRef, ...flattenedEntries]) => {
        const env = {};
        for (let i = 0; i < flattenedEntries.length; i += 2) {
            env[flattenedEntries[i]] = flattenedEntries[i + 1];
        }
        return createQFunc(thisVal, env, source, selfRef);
    }
    // we flatten the env object because the constructor freezes it so the deserializer can't add to it
    // that's a deserializer bug
};

// used to construct method prefix and for error messages ("${X} is not a method of ..."")
const FUTURE_MESSAGE_HANDLER = "future message";
const CANCEL_FUTURE = "message in cancelFuture";
const SUBSCRIPTION_HANDLER = "subscription handler";
const UNSUBSCRIBE_ARGUMENT = "unsubscribe argument";

function asQFuncMethodPrefix(handler) {
    return `qFunc~${handler.split(" ")[0]}~`;
}

const QFUNC_FUTURE_PREFIX = asQFuncMethodPrefix(FUTURE_MESSAGE_HANDLER);
const QFUNC_SUBSCRIPTION_PREFIX = asQFuncMethodPrefix(SUBSCRIPTION_HANDLER);

function shouldRegisterQFuncMethod(handler) {
    return handler === FUTURE_MESSAGE_HANDLER || handler === SUBSCRIPTION_HANDLER;
}

function isQFuncFuture(methodName) {
    return methodName.startsWith(QFUNC_FUTURE_PREFIX);
}

function handlesFuture(handler) {
    return handler === FUTURE_MESSAGE_HANDLER || handler === CANCEL_FUTURE;
}

function asQFuncSubscription(topic) {
    return `${QFUNC_SUBSCRIPTION_PREFIX}${topic}`;
}

function isRegisteredQFuncSubscription(methodName, topic) {
    if (!methodName.startsWith(QFUNC_SUBSCRIPTION_PREFIX)) return false;
    return methodName.slice(QFUNC_SUBSCRIPTION_PREFIX.length) === topic;
}

// this is the only place allowed to set CurrentVM
function execInVM(vm, fn) {
    if (CurrentVM) throw Error("VirtualMachine confusion");
    if (!(vm instanceof VirtualMachine)) throw Error("not a VM: " + vm);
    const previousVM = CurrentVM;
    try {
        CurrentVM = vm;
        globalThis.CROQUETVM = vm;
        fn();
    } finally {
        CurrentVM = previousVM;
    }
}

function execOutsideVM(fn) {
    if (!CurrentVM) throw Error("VirtualMachine confusion");
    const previousVM = CurrentVM;
    try {
        CurrentVM = null;
        fn();
    } finally {
        CurrentVM = previousVM;
    }
}

const INITIAL_SEQ = 0xFFFFFFF0; // initial sequence number, must match reflector.js
const VOTE_SUFFIX = "#__vote"; // internal, for "vote" handling; never seen by apps
const REFLECTED_SUFFIX = "#reflected";
const DIVERGENCE_SUFFIX = "#divergence";

// messages invoked via reflector (encoded as single digit, not full string)
const ENCODED_MESSAGES = [
    "handleModelEventInModel",   // 0: the common case (triggers handlers in models and views)
    "handleBundledEvents",       // 1: the case if bundled, will verify each unbundled message

    // below are encoded for consistency but not directly sent to reflector
    "publishFromModelOnly",      // 2: triggers handlers in models only (specifically, join/exit)
    "handlePollForSnapshot",     // 3: snapshot polling
    "handleTuttiResult",         // 4: processing of TUTTI
    "handleTuttiDivergence",     // 5: processing of TUTTI
    "handleSnapshotVote",        // 6: snapshot voting
    "handlePersistVote",         // 7: persist voting
    "handleModelEventInView",    // 8: view subscription for TUTTI votes (unofficial API)
    "noop",                      // 9: unused (was used in convertReflectorMessage)
    "handleAuditRequest",        // A: (we're counting in Base36) respond to a DePIN audit
    //                           // B: ...
    // must not have more than 36 to keep it single-digit (or update encode/decode)
];

// map of message names to index for encoding
const ENCODE_MESSAGE = {};
for (let i = 0; i < ENCODED_MESSAGES.length; i++) {
    ENCODE_MESSAGE[ENCODED_MESSAGES[i]] = i;
}

// minimum ms (vm time) between successive snapshot polls
const SNAPSHOT_MIN_POLL_GAP = 5000;
// minimum ms (vm time) between successive persistence polls
const PERSIST_MIN_POLL_GAP = 25000; // bearing in mind max tick interval of 30s

const persistenceDetails = new WeakMap(); // map from vm to a persistence-details object
function setPersistenceCache(vm, details) { persistenceDetails.set(vm, details); }
function getPersistenceCache(vm) { return persistenceDetails.get(vm); }
function clearPersistenceCache(vm) { persistenceDetails.set(vm, null); }

/** A fake VM is used to run bit-identical code outside of the model, e.g. for Constant init */
class FakeVM {
    random() {
        throw Error("Math.random() cannot be used in Model.evaluate()");
    }
}

/** A VM holds the models which are synchronized by teatime,
 * a queue of messages, plus additional bookkeeping to make
 * uniform pub/sub between models and views possible.*/
export default class VirtualMachine {
    static current() {
        if (!CurrentVM) console.warn(`VirtualMachine.current() called from outside the vm!`);
        return CurrentVM;
    }

    static hasCurrent() {
        return !!CurrentVM;
    }

    /** exposed as Model.evaluate() */
    static evaluate(fn) {
        if (CurrentVM) return fn();
        patchBrowser(); // trivial if already installed
        const previousVM = CurrentVM;
        try {
            CurrentVM = new FakeVM();
            return fn();
        } finally {
            CurrentVM = previousVM;
        }
    }

    constructor(snapshot, debugEvents, initFn, compat) {
        patchBrowser(); // trivial if already installed
        initDEBUG();
        clearPersistenceCache(this);

        execInVM(this, () => {
            inModelRealm(this, () => {
                /** all the models in this vm by id */
                this.models = {};
                /** named models (initially only 'modelRoot') */
                this.namedModels = {};
                /** future/pending external messages, sorted by time and sequence number */
                this.messages = new PriorityQueue((a, b) => a.before(b));
                /** @type {{"scope:event": Array<String>}} model subscriptions, maps topic to handlers */
                this.subscriptions = {};
                /** @type {Map<String, Set<String>>} maps models to subscribed topics. Excluded from snapshot */
                this.subscribers = new Map();
                /** @type {Array<{topic,handler}>} generic subscriptions, i.e. subscribe('*', ...) */
                this.genericSubscriptions = [];
                /** @type {string} meta data for currently executing subscription handler */
                this.currentEvent = "";
                /** @type {boolean} true if the currentEvent was published by a model */
                this.currentEventFromModel = false;
                /** @type {boolean} true if event logging is enabled */
                this.debugEvents = debugEvents;
                /** @type {{[id:string]: {extraConnections?: Number, data?: object, loc?: object}}} active reflector connections */
                this.views = {};
                /** @type {SeedRandom} our synced pseudo random stream */
                this._random = () => { throw Error("You must not use random when applying state!"); };
                /** @type {String} session ID */
                this.id = snapshot.id; // the controller always provides an ID
                /** @type {Number} how far simulation has progressed */
                this.time = 0;
                /** @type {Number} sequence number of last executed external message */
                this.seq = INITIAL_SEQ;       // 0xFFFFFFF0 provokes 32 bit rollover soon
                /** @type {Number} timestamp of last scheduled external message */
                this.externalTime = 0;
                /** @type {Number} sequence number of last scheduled external message */
                this.externalSeq = this.seq;
                /** @type {Number} sequence number for disambiguating future messages with same timestamp */
                this.futureSeq = 0;
                /** @type {Number} simulation time when last snapshot poll was taken */
                this.lastSnapshotPoll = 0;
                /** @type {Number} simulation time when last persistence poll was requested */
                this.lastPersistencePoll = 0;
                /** @type {Boolean} true when a future persistence poll has been scheduled */
                this.inPersistenceCoolOff = false;
                /** @type {String} hash of last persistent data upload */
                this.persisted = "";
                /** @type {Number} number for giving ids to model */
                this.modelsId = 0;
                /** @type {Map<String, Array<String>} if session diverged, maps timestamps to snapshot urls */
                this.diverged = null;
                /** @type {Controller} our controller, for sending messages. Excluded from snapshot */
                this.controller = null;
                if (snapshot.models) {
                    // read vm from snapshot
                    const reader = VMReader.newOrRecycled(this);
                    const vmData = reader.readVM(snapshot, "VM", compat);
                    let staticInitializers = [];
                    let messages = [];
                    // only read keys declared above
                    for (const key of Object.keys(vmData)) {
                        if (key === "meta") continue;
                        else if (key === "staticInitializers") staticInitializers = vmData[key];
                        else if (!(key in this)) console.warn(`Ignoring property snapshot.${key}`);
                        else if (key === "_random") this[key] = new SeedRandom(null, { state: vmData[key] });
                        else if (key === "messages") messages = vmData.messages;
                        else this[key] = vmData[key];
                    }
                    // execute initializers of static class properties
                    for (const staticInitializer of staticInitializers) staticInitializer();
                    // add messages array to priority queue
                    for (const msg of messages) this.messages.add(msg);
                    // recreate subscribers from subscriptions
                    for (const [topic, handlers] of Object.entries(this.subscriptions)) {
                        for (const handler of handlers) {
                            const [modelId] = handler.split('.');
                            let topics = this.subscribers.get(modelId);
                            if (!topics) this.subscribers.set(modelId, topics = new Set());
                            topics.add(topic);
                        }
                    }
                } else {
                    // seed with session id so different sessions get different random streams
                    this._random = new SeedRandom(snapshot.id, { state: true });
                    this.addSubscription(this, "__VM__", "__peers__", this.generateJoinExit);
                    this.addSubscription(this, "__VM__", "__diverged__", this.handleSessionDiverged);
                    // creates root model and makes it well-known as 'modelRoot'
                    initFn(this);
                }
            });
        });
    }

    registerModel(model, id) {
        if (CurrentVM !== this) throw Error("You can only create models from model code!");
        if (!id) id = "M" + ++this.modelsId;
        this.models[id] = model;
        // not assigning the id here catches missing super calls in init() and load()
        return id;
    }

    deregisterModel(id) {
        if (CurrentVM !== this) throw Error("You can only destroy models from model code!");
        const model = this.models;
        delete this.models[id];
        for (const [name, value] of Object.entries(this.namedModels)) {
            if (model === value) delete this.namedModels[name];
        }
        this.messages.removeMany(msg => msg.hasReceiver(id));
    }

    lookUpModel(id) {
        if (id === "_") return this;
        let model = this.models[id];
        if (model) return model;
        const [_, modelID, partId] = id.match(/^([^#]+)#(.*)$/) || [];
        model = this.models[modelID];
        return model && model.lookUp(partId);
    }

    get(modelName) {
        const model = this.namedModels[modelName];
        if (CurrentVM !== this && DEBUG.write && model) return this.debugWriteProxy(this, model, model.id);
        return model;
    }

    set(modelName, model) {
        if (CurrentVM !== this) throw Error("You can only make a model well-known from model code!");
        this.namedModels[modelName] = model;
    }

    debugWriteProxy(vm, object, path) {
        if (typeof object !== "object" || object === null || object[DEBUG_WRITE_TARGET]) return object;
        if (object instanceof Model) path = object.id;
        if (!this.$debugWriteProxyHandler) {
            if (!DEBUG_WRITE_PROXIES) DEBUG_WRITE_PROXIES = new WeakMap();
            function writeError(what, obj, prop) {
                if (prop) what += ` ${prop} of`;
                const objPath = DEBUG_WRITE_PROXIES.get(obj).path;
                console.warn(`write-debug: non-model code is ${what} ${objPath}:`, obj);
                if (prop && prop[0] !== "$") throw Error(`write-debug: Attempt to modify ${App.libName} model state from outside!`);
            }
            this.$debugWriteProxyHandler = {
                set(target, property, value) {
                    if (CurrentVM !== vm) writeError("assigning", target, property);
                    else { console.warn(`${App.libName} debug write protection inside model - this should not happen!`); }
                    target[property] = value;
                },
                deleteProperty(target, property) {
                    if (CurrentVM !== vm) writeError("deleting", target, property);
                    else { console.warn(`${App.libName} debug write protection inside model - this should not happen!`); }
                    delete target[property];
                },
                get(target, property) {
                    if (property === DEBUG_WRITE_TARGET) return target;
                    const value = target[property];
                    if (value && value[DEBUG_WRITE_TARGET]) return value;
                    if (CurrentVM !== vm) {
                        if (typeof value === "object" && value !== null) {
                            const targetPath = DEBUG_WRITE_PROXIES.get(target).path;
                            if (value instanceof Map) {
                                const map = new Map([...value.entries()].map(([key, val], i) => {
                                    return [
                                        vm.debugWriteProxy(vm, key, `${targetPath}.key#${i}`),
                                        vm.debugWriteProxy(vm, val, `${targetPath}.value#${i}`)
                                    ];
                                }));
                                map[DEBUG_WRITE_TARGET] = value;
                                map.set = () => writeError("setting an item in", value);
                                map.delete = () => writeError("deleting from", value);
                                map.clear = () => writeError("clearing", value);
                                DEBUG_WRITE_PROXIES.set(value, { proxy: map, path: targetPath + propertyAccessor(value, property) });
                                return map;
                            }
                            if (value instanceof Set) {
                                const set = new Set([...value.values()].map((val, i) => vm.debugWriteProxy(vm, val, `${targetPath}.item#${i}`)));
                                set[DEBUG_WRITE_TARGET] = value;
                                set.add = () => writeError("adding to", value);
                                set.delete = () => writeError("deleting from", value);
                                set.clear = () => writeError("clearing", value);
                                DEBUG_WRITE_PROXIES.set(value, { proxy: set, path: targetPath + propertyAccessor(value, property) });
                                return set;
                            }
                            // TODO: Proxies for TypedArrays, DataView, ArrayBuffer, etc
                            // (Array appears to work, it internally calls proxy.get() for e.g. slice())
                            return vm.debugWriteProxy(vm, value, targetPath + propertyAccessor(value, property));
                        }
                    } else { console.warn(`${App.libName} debug write protection inside model - this should not happen!`); }
                    return value;
                }
            };
        }
        let proxy = DEBUG_WRITE_PROXIES.get(object);
        if (!proxy) {
            proxy = {
                proxy: new Proxy(object, this.$debugWriteProxyHandler),
                path
            };
            DEBUG_WRITE_PROXIES.set(object, proxy);
        }
        return proxy.proxy;
    }

    // used in Controller.convertReflectorMessage()
    noop() {}

    // generate perfectly paired view-join and view-exit events
    // from imperfectly paired reflector messages
    // e.g. nobody is there to receive an exit event for the last view
    // leaving a session so we generate those when the first view resumes a session
    // keeping track of views in the currently not exposed this.views property
    generateJoinExit({entered, exited, count, total}) {
        // for DePIN accounting, we want to track the moments when the synchronizer's
        // 'user' messages convey a change in the number of users.
        this.controller.handleUserTotalForAccounting(total);

        // if the app passed viewData to Session.join() then the controller
        // sent { id, data } as user instead of a plain viewId string. If location was
        // also requested then the reflector may have added the location as
        // { id, data, location: {region, city: {name, lat, lng}} }
        // if location was enabled (but no viewData) then controller.join() sent
        // a [viewId] array as user instead of a plain viewId string, so the reflector
        // may have added the location as [viewId, {region, city: {name, lat, lng}}],
        // see JOIN() in reflector.js

        const newViews = {};
        for (const user of entered) {
            if (typeof user === "string") continue; // only viewId
            let viewId, loc, data;
            if (Array.isArray(user)) [ viewId, loc ] = user;
            else { viewId = user.id; data = user.data; loc = user.location; }
            newViews[viewId] = {};
            if (data) newViews[viewId].data = data;
            if (loc) {
                if (loc.region) {
                    loc.country = loc.region.slice(0, 2);
                    loc.region = loc.region.slice(2);
                }
                newViews[viewId].loc = loc;
            }
        }
        entered = entered.map(user => typeof user === "string" ? user : Array.isArray(user) ? user[0] : user.id);
        exited = exited.map(user => typeof user === "string" ? user : Array.isArray(user) ? user[0] : user.id);
        // if entered length == count then the reflector just resumed the session
        // synthesize exit events for old views stored in snapshot
        if (entered.length === count) {
            exited = Object.keys(this.views);
            // all connections gone
            for (const id of exited) this.views[id].extraConnections = 0;
        }
        // reflector may send join+exit for same view in one event
        // in which case we remove it from both lists to avoid
        // generating an exit immediately followed by a join
        if (entered.length > 0 && exited.length > 0 && entered.some(id => exited.includes(id))) {
            // it's possible that either array contains the same view twice
            // so we remove them in pairs to keep the count correct
            for (let enterIndex = 0; enterIndex < entered.length; enterIndex++) {
                const id = entered[enterIndex];
                const exitIndex = exited.indexOf(id);
                if (exitIndex >= 0) {
                    entered.splice(enterIndex, 1);
                    exited.splice(exitIndex, 1);
                    enterIndex--; // we removed this id, check the same index again
                }
            }
            // if there are no events left then there's nothing to do
            if (entered.length + exited.length === 0) return;
        }
        // join/exit event payload is either "viewId" or { viewId, viewData }
        // depending on whether the session was joined with a viewData
        const viewInfo = id => {
            const { data, loc } = this.views[id];
            if (!data) return id;
            const info = { viewId: id, viewData: data };
            if (loc) info.location = loc; // location only if requested
            return info;
        };
        // process exits first
        for (const id of exited) {
            if (this.views[id]) {
                // ignore exit for multiple connections (see below)
                if (this.views[id].extraConnections) {
                    this.views[id].extraConnections--;
                    if (DEBUG.session) console.log(this.id, `@${this.time}#${this.seq} view ${id} closed extra connection`);
                    continue;
                }
                // otherwise this is a real exit
                const payload = viewInfo(id);
                delete this.views[id];
                this.publishFromModelOnly(this.id, "view-exit", payload);
            } else {
                // there is no way this could ever happen. If it does, something is seriously broken.
                const { time, seq } = this;
                console.error(`${this.id} @${time}#${seq} view ${id} exited without being present - this should not happen`);
                Promise.resolve().then(() => {
                    this.controller.sendLog(`view-exit-mismatch @${time}#${seq} ${id} left without being present`);
                });
            }
        }
        // then joins
        for (const id of entered) {
            if (this.views[id]) {
                // this happens if a client rejoins but the reflector is still holding
                // onto the old connection
                if (DEBUG.session) console.log(this.id, `@${this.time}#${this.seq} view ${id} opened another connection`);
                this.views[id].extraConnections = (this.views[id].extraConnections||0) + 1;
            } else {
                // otherwise this is a real join
                this.views[id] = newViews[id] || {};
                const payload = viewInfo(id);
                this.publishFromModelOnly(this.id, "view-join", payload);
            }
        }
        // sanity check: the active number of connections on the reflector should match our count
        const connections = Object.values(this.views).reduce((n, view) => n + 1 + (view.extraConnections || 0), 0);
        if (count !== connections) {
            const { time, seq } = this;
            console.error(`@${time}#${seq} view count mismatch (model: ${connections}, reflector: ${count}) - this should not happen`);
            Promise.resolve().then(() => {
                this.controller.sendLog(`view-exit-mismatch @${time}#${seq} connections model: ${connections} reflector: ${count}`);
            });
        }
    }

    /** decode msgData and sort it into future queue
     * @param {MessageData} msgData - encoded message
     * @return {Message} decoded message
     */
    scheduleExternalMessage(msgData) {
        const message = Message.fromState(msgData, this);
        if (message.time < this.time) throw Error("past message from reflector " + msgData);
        const nextSeq = (this.externalSeq + 1) >>> 0;
        if (message.seq !== nextSeq) throw Error(`External message error. Expected message #${nextSeq} got #${message.seq}`);
        this.externalTime = message.time; // we have all external messages up to this time
        this.externalSeq = message.seq; // we have all external messages up to this sequence number
        message.seq = message.seq * 2 + 1;  // make odd sequence for external messages
        this.verifyExternal(message); // may throw
        this.messages.add(message);
        return message;
    }

    /** limit the methods that can be triggered directly via reflector */
    verifyExternal(msg) {
        if (msg.receiver !== "_") throw Error(`invalid receiver in external message: ${msg}`);
        if (!(msg.selector in ENCODE_MESSAGE)) throw Error(`unexpected external message: ${msg.selector}`);
    }

    futureSend(tOffset, receiverID, selector, args) {
        if (tOffset.every) return this.futureRepeat(tOffset.every, receiverID, selector, args);
        if (tOffset < 0) throw Error("attempt to send future message into the past");
        // Wrapping below is fine because the message comparison function deals with it.
        // To have a defined ordering between future messages generated on vm
        // and messages from the reflector, we create even sequence numbers here and
        // the reflector's sequence numbers are made odd on arrival
        this.futureSeq = (this.futureSeq + 1) >>> 0;
        const message = new Message(this.time + tOffset, 2 * this.futureSeq, receiverID, selector, args);
        this.messages.add(message);
        return { time: message.time, seq: message.seq }; // for cancelFuture
    }

    cancelFuture(model, methodOrMessage) {
        const messages = this.messages;
        let removed;
        if (typeof methodOrMessage.time === "number") {
            const { time, seq } = methodOrMessage;
            removed = messages.removeOne(msg => msg.time === time && msg.seq === seq);
        } else if (methodOrMessage === "*") {
            removed = messages.removeMany(msg => msg.receiver === model.id);
            return removed.length > 0;
        } else {
            const methodName = this.asMethodName(model, methodOrMessage, CANCEL_FUTURE);
            const receiverID = model.id;
            removed = messages.removeOne(msg => msg.receiver === receiverID && msg.selector === methodName
                || msg.receiver === "_" && msg.selector === "futureExecAndRepeat" && msg.args[1] === receiverID && msg.args[2] === methodName);
            if (isQFuncFuture(methodName)) {
                delete model[methodName];
            }
        }
        return removed !== undefined;
    }

    futureRepeat(tOffset, receiverID, selector, args) {
        // "_ " is a special receiver that means "this VM"
        this.futureSend(tOffset, "_", "futureExecAndRepeat", [tOffset, receiverID, selector, args]);
    }

    futureExecAndRepeat(tOffset, receiverID, selector, args) {
        const model = this.lookUpModel(receiverID);
        if (!model) return; // model was destroyed
        if (typeof model[selector] === "function") {
            try {
                model[selector](...args);
            } catch (error) {
                displayAppError(`future message ${model}.${selector}`, error);
            }
        } else {
            const fn = this.compileFuncString(selector, model);
            try {
                fn(...args);
            } catch (error) {
                displayAppError(`future message ${model} ${fn}`, error);
            }
        }
        this.futureRepeat(tOffset, receiverID, selector, args);
    }


    // Convert model.future(tOffset).property(...args)
    // or model.future(tOffset, "property",...args)
    // into this.futureSend(tOffset, model.id, "property", args)
    future(model, tOffset, methodNameOrCallback, methodArgs) {
        if (!this.lookUpModel(model.id)) throw Error(`future send to unregistered model ${model}`);
        if (methodNameOrCallback === undefined) {
            const vm = this;
            return new Proxy(model, {
                get(_target, property) { return (...args) => vm.future(model, tOffset, property, args); }
            });
        }
        const methodName = this.asMethodName(model, methodNameOrCallback, FUTURE_MESSAGE_HANDLER);
        if (typeof methodName !== "string") throw Error(`future message to ${model} ${methodName} is not a string`);
        if (typeof model[methodName] !== "function" && methodName.indexOf('.') < 0 && methodName[0] !== '{') throw Error(`future send to ${model} with unknown method ${methodName}()`);
        return this.futureSend(tOffset, model.id, methodName, methodArgs);
    }

    /**
     * Process pending messages for this vm and advance simulation time.
     * Must only be sent by controller!
     * @param {Number} newTime - simulate at most up to this time
     * @param {Number} deadline - CPU time deadline for interrupting simulation
     * @returns {Boolean} true if finished simulation before deadline
     */
    advanceTo(newTime, deadline) {
        if (CurrentVM) throw Error("cannot advance time from model code");
        let message;
        // process each message in queue up to newTime
        while ((message = this.messages.peek()) && message.time <= newTime) {
            const { time, seq } = message;
            if (time < this.time) throw Error("past message encountered: " + message);
            // if external message, check seq so we don't miss any
            if (seq & 1) {
                this.seq = (this.seq + 1) >>> 0;  // uint32 rollover
                // use seq/2 instead of seq >>> 1 because message.seq has 33 bits
                if ((seq/2) >>> 0 !== this.seq) throw Error(`Sequence error: expected ${this.seq} got ${(seq/2) >>> 0} in ${message}`);
            }
            // drop first message in message queue
            this.messages.poll();
            // advance time
            this.time = message.time;
            // execute future or external message
            message.executeOn(this);
            // if we're out of time, bail out
            if (globalThis.CroquetViewDate.now() >= deadline) return false;
        }
        // we processed all messages up to newTime
        this.time = newTime;
        return true;
    }

    // Pub-sub

    // Subscriptions and future messages are stored as strings
    // and interpreted as method names.
    // Typically we recommend passing "this.method" as the handler
    // which stores the method name in the model and returns it.
    // It's also acceptable to pass the method name as a string.
    // If a QFunc is passed, it is registered as a method in the model
    // temporarily under a special name, and that special name is returned.
    // The QFunc method is removed automatically:
    // - if it's a future message, right before executing the message
    // - if it's a subscription handler, when unsubscribing
    asMethodName(model, func, what, topic=null) {
        // if a string was passed in, assume it's a method name
        if (typeof func === "string") return func;
        // if a function was passed in, it should be a method or QFunc
        if (typeof func === "function") {
            // if passing this.method we can just return the name
            if (model[func.name] === func) return func.name;
            // if passing a QFunc, we can check if it's a subscription handler for the topic
            if (func[QFUNC] && topic) {
                const subscription = asQFuncSubscription(topic);
                if (model[subscription] === func) return subscription;
            }
            // if passing this.foo = this.method
            let obj = model;
            while (obj !== null) {
                // if it's a method or future-message QFunc, return the name
                for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(obj))) {
                    if (desc.value === func) {
                        if (func[QFUNC] && !(handlesFuture(what) && isQFuncFuture(name))) continue;
                        return name;
                    }
                }
                // if it's a QFunc handler, register it in the model
                // (if it was registered before, it would have been found above)
                if (obj === model && func[QFUNC]) {
                    if (!shouldRegisterQFuncMethod(what)) {
                        displayWarning(`${what} is not a registered QFunc: ${func}`, { only: "once" });
                        return null;
                    }
                    let name;
                    if (topic) name = asQFuncSubscription(topic); // implies a subscription
                    else {
                        const prefix = QFUNC_FUTURE_PREFIX;
                        let i = 0;
                        do { name = `${prefix}${i++}`; } while (model[name]);
                    }
                    model[name] = func;
                    return name;
                    // this registration is cleaned up after executing a future QFunc
                    // or when unsubscribing the QFunc
                }
                // no QFunc, check the prototype chain
                obj = Object.getPrototypeOf(obj);
            }
            // otherwise, assume it's an inline function
            displayWarning(`${what} is not a method of ${model} and not a QFunc: ${func}\n`, { only: "once" });
            // if passing (foo) => this.bar(baz)
            // match:                (   foo             )   =>  this .  bar              (    baz               )
            const HANDLER_REGEX = /^\(?([a-z][a-z0-9]*)?\)? *=> *this\.([a-z][a-z0-9]*) *\( *([a-z][a-z0-9]*)? *\) *$/i;
            // captures:               [      1       ]                [       2      ]      [      3       ]
            const source = func.toString();
            const match = source.match(HANDLER_REGEX);
            // it matches, and the parameter name is the same as the argument name
            if (match && (!match[3] || match[3] === match[1])) return match[2];
            // otherwise, convert the function to a func string
            return this.asFuncString(func);
        }
        return null;
    }

    /*
    * asFuncString and compileFuncString are used to serialize simple inline
    * event handler functions. They can be used directly as handlers in model
    * code (subcriptions and future messages) but are not fully supported.
    * A warning is displayed if they are used.
    * TODO: make full QFuncs usable in these places
    */

    asFuncString(fn) {
        const source = fn.toString();
        return `{${btoa(JSON.stringify(source))}}`;
        // methodName[0] === "{" is used to identify this as a funcString
    }

    compileFuncString(str, model) {
        // funcs are bound to model instances, only cache them per VM
        if (!this.$compiledFuncs) this.$compiledFuncs = {};
        const cacheKey = model.id + ':' + str;
        let fn = this.$compiledFuncs[cacheKey];
        if (!fn) {
            const source = JSON.parse(atob(str.slice(1, -1)));
            fn = compileQFunc(source, model);
            if (source.startsWith("function")) fn = fn.bind(model);
            this.$compiledFuncs[cacheKey] = fn;
        }
        return fn;
    }


    addSubscription(model, scope, event, methodNameOrCallback) {
        if (CurrentVM !== this) throw Error("Cannot add a model subscription from outside model code");
        if (scope.includes(':')) throw Error(`Invalid subscription scope "${scope}" (must not contain ':')`);
        const topic = scope + ':' + event;
        const methodName = this.asMethodName(model, methodNameOrCallback, SUBSCRIPTION_HANDLER, topic);
        if (typeof methodName !== "string") {
            throw Error(`Subscription handler for "${event}" must be a method name`);
        }
        if (methodName.indexOf('.') < 0 && typeof model[methodName] !== "function") {
            if (methodName[0] !== '{') throw Error(`Subscriber method for "${event}" not found: ${model}.${methodName}()`);
        }
        const id = model === this ? "_" : model.id;
        const handler = id + '.' + methodName;
        // check for generic subscriptions first
        if (scope === "*" || event === "*") {
            this.addGenericSubscription(topic, handler);
            return;
        }
        // model subscriptions need to be ordered, so we're using an array
        if (!this.subscriptions[topic]) this.subscriptions[topic] = [];
        else if (this.subscriptions[topic].indexOf(handler) !== -1) {
            throw Error(`${model}.${methodName} already subscribed to ${event}`);
        }
        this.subscriptions[topic].push(handler);
        let topics = this.subscribers.get(id);
        if (!topics) this.subscribers.set(id, topics = new Set());
        topics.add(topic);
    }

    removeSubscription(model, scope, event, methodName="*") {
        if (CurrentVM !== this) throw Error("Cannot remove a model subscription from outside model code");
        if (scope === "*" || event === "*") {
            this.removeGenericSubscription(model, scope, event, methodName);
            return;
        }
        const topic = scope + ':' + event;
        const handlers = this.subscriptions[topic];
        if (handlers) {
            const handlerPrefix = model.id + '.';
            if (methodName === "*") {
                // modify the array in place so the loop in handleModelEventInModel()
                // will not execute removed handlers
                for (let i = handlers.length - 1; i >= 0; i--) {
                    if (handlers[i].startsWith(handlerPrefix)) {
                        const nameString = handlers[i].slice(handlerPrefix.length);
                        if (isRegisteredQFuncSubscription(nameString, topic)) delete model[nameString];
                        handlers.splice(i, 1);
                    }
                }
                if (handlers.length === 0) delete this.subscriptions[topic];
            } else {
                const nameString = this.asMethodName(model, methodName, UNSUBSCRIBE_ARGUMENT, topic);
                if (typeof nameString !== "string") {
                    throw Error(`Invalid unsubscribe args for "${event}" in ${model}: ${methodName}`);
                }
                const handler = handlerPrefix + nameString;
                const indexToRemove = handlers.indexOf(handler);
                if (indexToRemove !== -1) {
                    handlers.splice(indexToRemove, 1);
                    if (handlers.length === 0) delete this.subscriptions[topic];
                    if (isRegisteredQFuncSubscription(nameString, topic)) delete model[nameString];
                }
                // if there are remaining handlers, do not remove the topic for this model
                if (handlers.find(h => h.startsWith(handlerPrefix))) {
                    return;
                }
            }
            // all handlers of this model for the topic are gone, remove the topic
            const topics = this.subscribers.get(model.id);
            topics.delete(topic);
            if (topics.size === 0) this.subscribers.delete(model.id);
        }
    }

    addGenericSubscription(topic, handler) {
        this.genericSubscriptions.push({ topic, handler });
    }

    removeGenericSubscription(model, scope, event, methodName = "*") {
        const topic = scope + ':' + event;
        const handlerPrefix = model.id + '.';
        for (let i = this.genericSubscriptions.length - 1; i >= 0; i--) {
            const subscription = this.genericSubscriptions[i];
            if (subscription.topic === topic && subscription.handler.startsWith(handlerPrefix)) {
                if (methodName === "*" || subscription.handler === handlerPrefix + methodName) {
                    this.genericSubscriptions.splice(i, 1);
                    if (isRegisteredQFuncSubscription(methodName, topic)) delete model[methodName];
                }
            }
        }
    }

    removeAllSubscriptionsFor(model) {
        const topics = this.subscribers.get(model.id);
        if (topics) {
            const handlerPrefix = model.id + '.';
            for (const topic of topics) {
                const handlers = this.subscriptions[topic];
                // modify the array in place so the loop in handleModelEventInModel()
                // will not execute removed handlers
                for (let i = handlers.length - 1; i >= 0; i--) {
                    if (handlers[i].startsWith(handlerPrefix)) {
                        const nameString = handlers[i].slice(handlerPrefix.length);
                        if (isRegisteredQFuncSubscription(nameString, topic)) delete model[nameString];
                        handlers.splice(i, 1);
                    }
                }
                if (handlers.length === 0) delete this.subscriptions[topic];
            }
            this.subscribers.delete(model.id);
        }
    }

    publishFromModel(scope, event, data) {
        if (CurrentVM !== this) throw Error("Cannot publish a model event from outside model code");
        if (scope.includes(':')) throw Error(`Invalid publish scope "${scope}" (must not contain ':')`);
        // @@ hack for forcing reflection of model-to-model messages
        const reflected = event.endsWith(REFLECTED_SUFFIX);
        if (reflected) event = event.slice(0, event.length - REFLECTED_SUFFIX.length);

        const fromModel = this.currentEventFromModel;
        this.currentEventFromModel = true;

        const topic = scope + ':' + event;
        this.handleModelEventInModel(topic, data, reflected);
        this.handleModelEventInView(topic, data);

        this.currentEventFromModel = fromModel;
    }

    publishFromModelOnly(scope, event, data) {
        if (CurrentVM !== this) throw Error("Cannot publish a model event from outside model code");
        // we don't set currentEventFromModel because this method
        // is only used to translate reflector messages into model events
        const topic = scope + ':' + event;
        this.handleModelEventInModel(topic, data);
    }

    publishFromView(scope, event, data) {
        if (CurrentVM) throw Error("Cannot publish a view event from model code");
        if (scope.includes(':')) throw Error(`Invalid publish scope "${scope}" (must not contain ':')`);
        const topic = scope + ':' + event;
        this.handleViewEventInModel(topic, data);
        this.handleViewEventInView(topic, data);
    }

    handleBundledEvents(events) {
        for (const msgState of events) {
            const message = Message.fromState(msgState, this);
            this.verifyExternal(message); // may throw
            message.executeOn(this, true); // nested invocation
        }
    }

    handleModelEventInModel(topic, data, reflect=false) {
        // model=>model events are handled synchronously unless reflected
        // because making them async would mean having to use future messages
        if (CurrentVM !== this) throw Error("handleModelEventInModel called from outside model code");
        if (reflect) {
            if (this.controller.synced !== true) return;

            const voteTopic = topic + VOTE_SUFFIX;
            const divergenceTopic = topic + DIVERGENCE_SUFFIX;
            const wantsVote = !!viewDomain.subscriptions[voteTopic], wantsFirst = !!this.subscriptions[topic], wantsDiverge = !!this.subscriptions[divergenceTopic];
            if (wantsVote && wantsDiverge) console.log(`divergence subscription for ${topic} overridden by vote subscription`);
            // iff there are subscribers to a first message, build a candidate for the message that should be broadcast
            const firstMessage = wantsFirst ? new Message(this.time, 0, "_", "handleModelEventInModel", [topic, data]) : null;
            // provide the receiver, selector and topic for any eventual tally response from the reflector.
            // if there are subscriptions to a vote, it'll be a handleModelEventInView with
            // the vote-augmented topic.  if not, default to our handleTuttiDivergence.
            let tallyTarget;
            if (wantsVote) tallyTarget = ["handleModelEventInView", voteTopic];
            else tallyTarget = ["handleTuttiDivergence", divergenceTopic];
            Promise.resolve().then(() => this.controller.sendTutti({
                time: this.time,
                topic,
                data,
                firstMessage,
                wantsVote,
                tallyTarget
                })); // break out of model code
        } else {
            // try to keep this as quick as possible if there is no subscription

            // generic handlers (typically none)
            // these are first so e.g. a logger logs before other handlers
            // that were triggered by an external event
            if (this.genericSubscriptions.length > 0) {
                this.invokeGenericHandlers(topic, data);
            }

            // regular handlers
            if (this.subscriptions[topic]) {
                this.invokeHandlers(this.subscriptions[topic], topic, data);
            }
        }
    }

    invokeHandlers(liveHandlers, topic, data) {
        // live handlers may be added or removed during the loop
        // we skip both removed and added handlers for this event cycle
        const handlers = liveHandlers.slice(); // O(n)
        for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i];
            // the includes() in this loop makes it O(n^2), but we only do it
            // when a handler is removed while iterating, which is rare.
            // Devs can avoid this by using future(0) to unsubscribe/destroy
            if (handler !== liveHandlers[i] && !liveHandlers.includes(handler)) {
                continue; // handler was removed
            }
            this.invokeHandler(handler, topic, data);
        }
    }

    invokeGenericHandlers(topic, data) {
        const [scope, event] = topic.split(':');
        if ((scope.startsWith("__") && scope.endsWith("__"))
            || (event.startsWith("__") && event.endsWith("__"))) return; // ignore internal events
        for (const subscription of this.genericSubscriptions) {
            const [subScope, subEvent] = subscription.topic.split(':');
            if (subScope === "*" && subEvent === event
                || subScope === scope && subEvent === "*"
                || subScope === "*" && subEvent === "*")
            {
                this.invokeHandler(subscription.handler, topic, data);
            }
        }
    }

    invokeHandler(handler, topic, data) {
        const prevEvent = this.currentEvent;
        this.currentEvent = topic;
        try {
            const [id, ...rest] = handler.split('.');
            const methodName = rest.join('.');
            const model = this.lookUpModel(id);

            if (!model) {
                displayWarning(`event ${topic} .${methodName}(): subscriber not found`);
                return;
            }
            if (methodName[0] === '{') {
                const fn = this.compileFuncString(methodName, model);
                try {
                    fn(data);
                } catch (error) {
                    displayAppError(`event ${topic} ${model} ${fn}`, error);
                }
                return;
            }
            if (methodName.indexOf('.') >= 0) {
                const dot = methodName.indexOf('.');
                const head = methodName.slice(0, dot);
                const tail = methodName.slice(dot + 1);
                try {
                    model.call(head, tail, data);
                } catch (error) {
                    displayAppError(`event ${topic} ${model}.call(${JSON.stringify(head)}, ${JSON.stringify(tail)})`, error);
                }
                return;
            }
            if (typeof model[methodName] !== "function") {
                displayAppError(`event ${topic} ${model}.${methodName}(): method not found`);
                return;
            }
            try {
                model[methodName](data);
            } catch (error) {
                displayAppError(`event ${topic} ${model}.${methodName}()`, error);
            }
        } finally {
            this.currentEvent = prevEvent;
        }
    }

    handleViewEventInModel(topic, data) {
        // view=>model events are converted to model=>model events via reflector
        if (this.subscriptions[topic]) {
            const args = [topic];
            if (data !== undefined) args.push(data); // avoid {"$class":"Undefined"}
            const message = new Message(this.time, 0, "_", "handleModelEventInModel", args);
            this.controller.sendMessage(message);
        }
    }

    handleModelEventInView(topic, data) {
        if (DEBUG.write) data = this.debugWriteProxy(this, data, `event ${topic} arg`);
        viewDomain.handleEvent(topic, data, fn => execOutsideVM(() => inViewRealm(this, fn, true)));
    }

    handleViewEventInView(topic, data) {
        viewDomain.handleEvent(topic, data);
    }

    handleTuttiDivergence(divergenceTopic, data) {
        // for a reflected model message foo#reflected, by default divergence triggers any model
        // subscriptions for foo#divergence.
        if (this.subscriptions[divergenceTopic]) this.handleModelEventInModel(divergenceTopic, data);
        else {
            const event = divergenceTopic.split(':').slice(-1)[0];
            console.warn(`uncaptured divergence in ${event}:`, data);
        }
    }

    handleSessionDiverged(data) {
        const { key, url } = data;
        if (!this.diverged) this.diverged = new Map();
        let urls = this.diverged.get(key);
        if (!urls) this.diverged.set(key, urls = []);
        urls.push(url);
        if (urls.length === 2 && this.controller && !this.controller.fastForwardHandler) this.debugDiverged(key);
    }

    debugDiverged(key) {
        if (!key) key = this.diverged.keys().next().value;
        const urls = this.diverged.get(key);
        if (!urls || urls.length < 2) throw Error(`no diverged urls for snapshot ${key}`);
        Promise.resolve().then(() => this.controller.diffDivergedSnapshots(urls));
    }

    processModelViewEvents(isInAnimationStep) {
        if (CurrentVM) throw Error("cannot process view events in model code");
        return inViewRealm(this, () => viewDomain.processFrameEvents(isInAnimationStep, !!this.controller.synced));
    }

    handlePollForSnapshot() {
        // make sure there isn't a clash between clients simultaneously deciding
        // that it's time for someone to take a snapshot.
        const now = this.time;
        const sinceLast = now - this.lastSnapshotPoll;
        if (sinceLast < SNAPSHOT_MIN_POLL_GAP) { // arbitrary - needs to be long enough to ensure this isn't part of the same batch
            console.log(`rejecting snapshot poll ${sinceLast}ms after previous`);
            return;
        }

        this.lastSnapshotPoll = now;
        this.controller.handlePollForSnapshot(now);
    }

    handleTuttiResult(data) {
        this.controller.handleTuttiResult(data);
    }

    handleSnapshotVote(data) {
        this.controller.handleSnapshotVote(data);
    }

    handlePersistVote(data) {
        this.controller.handlePersistVote(data);
    }

    handleAuditRequest(data) {
        this.controller.handleAuditRequest(data);
    }

    snapshot() {
        const writer = VMWriter.newOrRecycled(this);
        return writer.snapshot(this, "VM");
    }

    // return the stringification of an object describing the vm - currently { oC, mC, nanC, infC, zC, nC, nH, sC, sL, fC } - for checking agreement between instances
    getSummaryHash() {
        return stableStringify(new VMHasher().getHash(this));
    }

    debug(options) {
        // only for debugging: options is either { [option]: value } or a 'opt1,opt2,noopt3,...' string
        return this.controller.setDebug(options);
    }

    forceSnapshot() {
        // only for debugging
        this.controller.requestDebugSnapshot();
    }

    persist(model, persistentDataFunc) {
        if (this.controller && this.controller.sessionSpec.appId === 'no.appId') console.warn(`${App.libName}: appId should be provided in Session.join() to not overwrite another apps's persistent data`);
        const start = Stats.begin("snapshot");
        const persistentData = typeof persistentDataFunc === "function" ? persistentDataFunc.call(model) : persistentDataFunc;
        if (typeof persistentData !== "object") throw Error(`${App.libName}: persistSession() can only persist objects (got ${typeof persistentData})`);
        const persistentString = stableStringify(persistentData);
        const persistentHash = Data.hash(persistentString);
        const ms = Stats.end("snapshot") - start;
        const unchanged = this.persisted === persistentHash;
        const persistTime = this.time;
        if (DEBUG.snapshot) console.log(this.id, `persistent data @${persistTime} collected, stringified and hashed in ${Math.ceil(ms)}ms${unchanged ? " (unchanged, ignoring)" : ""}`);
        if (urlOptions.forcePersist) {
            queueMicrotask(() => this.controller.forcePersist(persistTime, persistentString, persistentHash));
        }
        if (unchanged) return;

        // we rely on a local, view-specific cache of persistence data that deserves
        // to be uploaded, perhaps after a suitable cooloff period since the previous.
        // newly joining clients will each populate that local cache if they simulate
        // their way through the steps that cause the persistence call... but if there
        // has been a snapshot since that call, a new client will not populate the cache.
        // therefore we update the model with the new persistentHash as soon as it is
        // generated, even though there is no guarantee that any client will survive
        // long enough with the cached persistentString to upload it.  in the worst
        // case, that iteration of the persistence will be lost.
        setPersistenceCache(this, { persistTime, persistentString, persistentHash, ms });
        this.persisted = persistentHash; // update the model, whatever happens

        // figure out whether it's ok to go ahead immediately with a poll
        if (this.inPersistenceCoolOff) {
            if (DEBUG.snapshot) console.log(this.id, `persistence poll postponed by cooloff`);
        } else {
            const timeUntilReady = this.lastPersistencePoll ? this.lastPersistencePoll + PERSIST_MIN_POLL_GAP - this.time : 0;
            if (timeUntilReady > 0) {
                if (DEBUG.snapshot) console.log(this.id, `postponing persistence poll by ${timeUntilReady}ms`);
                this.futureSend(timeUntilReady, "_", "triggerPersistencePoll", []);
                this.inPersistenceCoolOff = true;
            } else {
                // go right ahead
                this.triggerPersistencePoll();
            }
        }
    }

    triggerPersistencePoll() {
        this.inPersistenceCoolOff = false;
        this.lastPersistencePoll = this.controller ? this.time : 0; // ignore during init()

        const details = getPersistenceCache(this);
        if (!details) return; // this client, at least, has nothing ready to upload

        const { persistTime, persistentString, persistentHash, ms } = details;
        clearPersistenceCache(this);

        // controller is unset only during init()
        // this lets us init the hash, but we won't upload the initial state
        if (!this.controller) return;

        if (this.controller.synced) {
            if (DEBUG.snapshot) console.log(this.id, `asking controller to poll for persistence @${persistTime}`);

            // run everything else outside of VM
            const vmTime = this.time;
            Promise.resolve().then(() => this.controller.pollForPersist(vmTime, persistTime, persistentString, persistentHash, ms));
        }
    }

    random() {
        if (CurrentVM !== this) throw Error("synchronized random accessed from outside the model");
        return this._random();
    }

    randomID() {
        if (CurrentVM !== this) throw Error("synchronized random accessed from outside the model");
        let id = "";
        for (let i = 0; i < 4; i++) {
            id += (this._random.int32() >>> 0).toString(16).padStart(8, '0');
        }
        return id;
    }

    toString() { return `VirtualMachine[${this.id}]`; }

    [Symbol.toPrimitive]() { return this.toString(); }
}


function encode(receiver, selector, args) {
    let encoded;
    if (receiver === "_") {
        const index = ENCODE_MESSAGE[selector];
        if (typeof index === "number") encoded = index.toString(36); // Base36
    }
    if (encoded === undefined) encoded = `${receiver}>${selector}`;
    if (args.length > 0) {
        const encoder = MessageArgumentEncoder.newOrRecycled();
        encoded += JSON.stringify(encoder.encode(args));
    }
    return encoded;
}

function decode(payload, vm) {
    let receiver, selector, argString;
    if (payload.length === 1 || payload[1] === '[') {
        const index = parseInt(payload[0], 36); // Base36
        receiver = "_";
        selector = ENCODED_MESSAGES[index];
        argString = payload.slice(1);
    } else {
        const selPos = payload.indexOf('>');
        let argPos = payload.indexOf('[');
        if (argPos === -1) argPos = payload.length;
        receiver = payload.slice(0, selPos);
        selector = payload.slice(selPos + 1, argPos);
        argString = payload.slice(argPos);
    }
    let args = [];
    if (argString) {
        const decoder = MessageArgumentDecoder.newOrRecycled(vm);
        args = decoder.decode(JSON.parse(argString));
    }
    return {receiver, selector, args};
}

/** Answer true if seqA comes before seqB:
 * - sequence numbers are 32 bit unsigned ints with overflow
 * - seqA comes before seqB if it takes fewer increments to
 *    go from seqA to seqB (zero increments counts) than
 *    going from seqB to seqA
 * @typedef {Number} Uint32
 * @argument {Uint32} seqA
 * @argument {Uint32} seqB
 */
export function inSequence(seqA, seqB) {
    return ((seqB - seqA) | 0) >= 0;     // signed difference works with overflow
}

export class Message {
    constructor(time, seq, receiverId, selector, args) {
        /** @type {Number} floating point seconds since beginning of session */
        this.time = time;
        /** @type {Number} a 32 bit unsigned integer (wraps around) */
        this.seq = seq;
        /** @type {String} id of receiver */
        this.receiver = receiverId;
        /** @type {String} method name */
        this.selector = selector;
        /** @type {Array} method arguments */
        this.args = args;
    }

    // Messages are generally sorted by time
    // For the same time stamp, we sort reflected messages after future messages
    // because otherwise it would depend on timing where the external message is put
    // (e.g when there are many future messages for the same time, we simulate a few,
    // and then insert an external message)
    before(other) {
        // sort by time
        if (this.time !== other.time) return this.time < other.time;
        // internal before external
        if (this.isExternal() !== other.isExternal()) return other.isExternal();
        return this.isExternal()
            ? inSequence(this.externalSeq, other.externalSeq)
            : inSequence(this.internalSeq, other.internalSeq);
    }

    hasReceiver(id) { return this.receiver === id; }

    isExternal() { return this.seq & 1; }
    get externalSeq() { return (this.seq / 2) >>> 0; }
    set externalSeq(seq) { this.seq = seq * 2 + 1; }
    get internalSeq() { return (this.seq / 2) >>> 0; }
    set internalSeq(seq) { this.seq = seq * 2; }

    asState() {
        // controller relies on this being a 3-element array,
        // the first two elements being numbers
        // and the third being a string which will be encrypted
        return [this.time, this.seq, encode(this.receiver, this.selector, this.args)];
    }

    static fromState(state, vm) {
        const [time, seq, payload] = state;
        const { receiver, selector, args } = decode(payload, vm);
        return new Message(time, seq, receiver, selector, args);
    }

    executeOn(vm, nested=false) {
        vm.currentEventFromModel = !this.isExternal();
        const executor = nested
            ? fn => fn()
            : fn => execInVM(vm, () => inModelRealm(vm, fn));
        const { receiver, selector, args } = this;
        const model = vm.lookUpModel(receiver); // could be VM itself, if receiver === "_"
        if (!model) displayWarning(`${this.shortString()} ${selector}(): receiver not found`);
        else if (selector[0] === '{') {
            const fn = vm.compileFuncString(selector, model);
            executor(() => {
                try {
                    fn(...args);
                } catch (error) {
                    displayAppError(`${this.shortString()} ${fn}`, error);
                }
                });
        } else if (selector.indexOf('.') >= 0) {
            executor(() => {
                const i = selector.indexOf('.');
                const head = selector.slice(0, i);
                const tail = selector.slice(i + 1);
                try {
                    model.call(head, tail, ...args);
                } catch (error) {
                    displayAppError(`${this.shortString()} ${model}.call(${JSON.stringify(head)}, ${JSON.stringify(tail)})`, error);
                }
                });
        } else if (typeof model[selector] !== "function") {
            displayWarning(`${this.shortString()} ${model}.${selector}(): method not found`);
        } else executor(() => {
            try {
                if (isQFuncFuture(selector)) {
                    const qFunc = model[selector];
                    delete model[selector]; // delete before calling, might be redefined in call
                    qFunc(...args);
                } else {
                    model[selector](...args);
                }
            } catch (error) {
                displayAppError(`${this.shortString()} ${model}.${selector}()`, error);
            }
            });
    }

    shortString() {
        return `${this.isExternal() ? "External" : "Future"}Message`;
    }

    toString() {
        const { receiver, selector, args } = this;
        const ext = this.isExternal();
        const seq = ext ? this.externalSeq : this.internalSeq;
        return `${ext ? "External" : "Future"}Message[${this.time}${":#"[+ext]}${seq} ${receiver}.${selector}(${args.map(JSON.stringify).join(", ")})]`;
    }

    [Symbol.toPrimitive]() { return this.toString(); }
}

const sumForFloat = (() => {
    // use DataView so we can enforce little-endian interpretation of float as ints on any platform
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    return fl => {
        view.setFloat64(0, fl, true);
        return view.getInt32(0, true) + view.getInt32(4, true);
    };
    })();

// VMHasher walks the object tree gathering statistics intended to help
// identify divergence between vm instances.
class VMHasher {
    constructor() {
        this.done = new Set();
        this.todo = []; // we use breadth-first writing to limit stack depth
        this.hashers = new Map();
        this.addHasher("Teatime:Message", Message);
        this.addHasher("Teatime:Data", DataHandleSpec);
        this.addHasher("Teatime:QFunc", QFuncSpec);
        for (const [classId, ClassOrSpec] of Model.allClassTypes()) {
            this.addHasher(classId, ClassOrSpec);
        }
    }

    addHasher(classId, ClassOrSpec) {
        const { cls, write } = (Object.getPrototypeOf(ClassOrSpec) === Object.prototype) ? ClassOrSpec
            : { cls: ClassOrSpec, write: obj => ({ ...obj }) };
        if (!write) return;
        this.hashers.set(cls, obj => this.hashStructure(obj, write(obj)));
    }

    /** @param {VirtualMachine} vm */
    getHash(vm) {
        this.hashState = {
            oC: 0, // count of JS Objects
            mC: 0, // count of models
            nanC: 0, // count of NaNs
            infC: 0, // count of Infinities (+ve or -ve)
            zC: 0, // count of zeros
            nC: 0, // count of non-zero finite numbers
            nH: 0, // sum of the Int32 parts of non-zero numbers treated as Float64s
            sC: 0, // number of strings
            sL: 0,  // sum of lengths of strings
            fC: 0  // count of future messages
        };

        for (const [key, value] of Object.entries(vm)) {
            if (key === "controller") continue;
            if (key === "meta") continue;
            if (key === "_random") this.hash(value.state(), false);
            else if (key === "messages") {
                const messageArray = value.asArray(); // from PriorityQueue
                const count = this.hashState.fC = messageArray.length;
                if (count) this.hash(messageArray, false);
            } else this.hashEntry(key, value);
        }
        this.hashDeferred();
        return this.hashState;
    }

    hashDeferred() {
        let index = 0;
        while (index < this.todo.length) {
            const { key, value } = this.todo[index++];
            this.hashEntry(key, value, false);
        }
        this.todo.length = 0;
    }

    hash(value, defer = true) {
        switch (typeof value) {
            case "number":
                if (Number.isNaN(value)) this.hashState.nanC++;
                else if (!Number.isFinite(value)) this.hashState.infC++;
                else if (value === 0) this.hashState.zC++;
                else {
                    this.hashState.nC++;
                    this.hashState.nH += sumForFloat(value);
                }
                return;
            case "string":
                this.hashState.sC++;
                this.hashState.sL += value.length;
                return;
            case "boolean":
            case "undefined":
                return;
            case "bigint": {
                if (value === 0n) this.hashState.zC++;
                else {
                    this.hashState.nC++;
                    const limit = value < 0 ? -1n : 0n;
                    while (value !== limit) {
                        this.hashState.nH += Number(value & 0xFFFFFFFFn);
                        value >>= 32n;
                    }
                }
                return;
            }
            default: {
                if (this.done.has(value)) return;
                if (value === null) return; // not counted
                if (this.hashers.has(value.constructor)) { this.hashers.get(value.constructor)(value); return; }
                const type = Object.prototype.toString.call(value).slice(8, -1);
                if (this.hashers.has(type)) { this.hashers.get(type)(value); return; }
                switch (type) {
                    case "Array":
                        this.hashArray(value, defer);
                        return;
                    case "ArrayBuffer":
                        this.hashIntArray(new Uint8Array(value));
                        return;
                    case "Set":
                        this.hashStructure(value, [...value]);
                        return;
                    case "Map":
                        this.hashStructure(value, [...value], false);
                        return;
                    case "DataView":
                        this.hashIntArray(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
                        return;
                    case "Int8Array":
                    case "Uint8Array":
                    case "Uint8ClampedArray":
                    case "Int16Array":
                    case "Uint16Array":
                    case "Int32Array":
                    case "Uint32Array":
                        this.hashIntArray(value);
                        return;
                    case "Float32Array":
                    case "Float64Array":
                        this.hashArray(value, false);
                        return;
                    case "Object":
                        if (value instanceof Model) this.hashModel(value);
                        else if (value.constructor === Object) this.hashObject(value, defer);
                        // no class error here, will be caught and reported by snapshot with full path
                    // ignore other errors here (e.g. Function), will be caught and reported by snapshot with full path
                    /* no default */
                }
            }
        }
    }

    hashModel(model) {
        this.hashState.mC++;
        this.done.add(model);      // mark done before recursing
        // note: for the hash as currently taken, all tallies are additive
        // so order is not important
        for (const [key, value] of Object.entries(model)) {
            if (key === "__realm") continue;
            if (value !== undefined) this.hashEntry(key, value);
        }
    }

    hashObject(object, defer = true) {
        this.hashState.oC++;
        this.done.add(object);      // mark done before recursing
        // see comment in hashModel re order
        for (const [key, value] of Object.entries(object)) {
            if (value !== undefined) this.hashEntry(key, value, defer);
        }
    }

    hashArray(array, defer = true) {
        this.done.add(array);       // mark done before recursing
        for (let i = 0; i < array.length; i++) {
            this.hashEntry(i, array[i], defer);
        }
    }

    hashIntArray(array) {
        this.done.add(array);       // mark done before recursing
        for (let i = 0; i < array.length; i++) {
            const value = array[i];
            if (value === 0) this.hashState.zC++;
            else {
                this.hashState.nC++;
                this.hashState.nH += value;
            }
        }
    }

    hashStructure(object, value, defer = true) {
        if (value === undefined) return;
        this.done.add(object);      // mark done before recursing
        this.hash(value, defer);
    }

    hashEntry(key, value, defer = true) {
        if (key[0] === '$') return;
        if (defer && typeof value === "object") {
            this.todo.push({ key, value });
            return;
        }
        this.hash(value, defer);
    }
}


class VMWriter {
    static newOrRecycled(vm) {
        let inst = this.reusableInstance;
        if (!inst) {
            inst = this.reusableInstance = new this(vm);
        } else {
            inst.vm = vm;
            inst.nextRef = 1;
            inst.refs = new Map();
            inst.todo = [];
        }
        return inst;
    }

    static get reusableInstance() { return this[this.name + "-instance"]; }

    static set reusableInstance(val) { this[this.name + "-instance"] = val; }

    static resetInstance() { this.reusableInstance = null; }

    constructor(vm) {
        this.vm = vm;
        this.nextRef = 1;
        this.refs = new Map();
        this.todo = []; // we use breadth-first writing to limit stack depth
        this.writers = new Map();
        this.addWriter("Teatime:Message", Message);
        this.addWriter("Teatime:Data", DataHandleSpec);
        this.addWriter("Teatime:QFunc", QFuncSpec);
        for (const [classId, ClassOrSpec] of Model.allClassTypes()) {
            this.addWriter(classId, ClassOrSpec);
        }
        this.okayToIgnore = { $debugWriteProxyHandler: true };
        for (const Class of Model.allClasses()) {
            if (Object.prototype.hasOwnProperty.call(Class, "okayToIgnore")) {
                const props = Class.okayToIgnore();
                if (!Array.isArray(props)) throw new Error("okayToIgnore() must return an array");
                for (const prop of props) {
                    if (prop[0] !== '$') throw Error(`okayToIgnore: ignored prop "${prop}" must start with '$'`);
                    this.okayToIgnore[prop] = true;
                }
            }
        }
    }

    addWriter(classId, ClassOrSpec) {
        const isSpec = Object.getPrototypeOf(ClassOrSpec) === Object.prototype;
        const {cls, write} = isSpec ? ClassOrSpec : {cls: ClassOrSpec, write: obj => ({ ...obj })};
        // Object and Array are used by the serializer itself, can't override their serialization
        if (cls === Object) throw Error(`${App.libName} types: '${classId}' is the Object class itself, must be a user class`);
        if (cls === Array) throw Error(`${App.libName} types: '${classId}' is the Array class, must be a user class`);
        if (!write) {
            if (!ClassOrSpec.writeStatic) console.warn(`${App.libName} types: ${classId} does not implement write() or writeStatic()`);
            return;
        }
        this.writers.set(cls, (obj, path) => this.writeAs(classId, obj, write(obj), isSpec ? `${path}.write(${cls.name})` : path));
    }

    /** @param {VirtualMachine} vm */
    snapshot(vm, path) {
        const state = {
            _random: vm._random.state(), // _random is a function
            messages: this.write(vm.messages.asArray(), "FutureMessages"),
            subscribers: undefined, // do not write subscribers
            controller: undefined, // do not write controller
            $compiledFuncs: undefined, // do not write compiledFuncStrings
        };
        // write static class properties
        this.writeAllStaticInto(state);
        // write remaining properties of the vm
        for (const [key, value] of Object.entries(vm)) {
            if (key in state) continue;
            this.writeInto(state, key, value, path);
        }
        this.writeDeferred();

        delete state.controller; // remove undefined
        delete state.subscribers; // remove undefined
        delete state.$compiledFuncs; // remove undefined
        return state;
    }

    writeAllStaticInto(state) {
        // get static properties of all model classes
        for (const Class of Model.allClasses()) {
            if (Class === Model) continue;
            for (const [key, value] of Object.entries(Class)) {
                if (key[0] === '$') continue;
                const name = Model.classToID(Class);
                if (!state.staticModelProps) state.staticModelProps = {};
                if (!(name in state.staticModelProps)) state.staticModelProps[name] = {};
                this.writeInto(state.staticModelProps[name], key, value, `Model(${name}).static`);
                warnMultipleSessionsStatic("Model", name);
            }
        }
        // write static properties of registered types with a writeStatic method
        for (const [name, ClassOrSpec] of Model.allClassTypes()) {
            if (typeof ClassOrSpec === "object") {
                const { writeStatic } = ClassOrSpec;
                if (writeStatic) {
                    const props = writeStatic();
                    if (props) {
                        if (!state.staticTypeProps) state.staticTypeProps = {};
                        state.staticTypeProps[name] = this.write(props, `Type(${name}).writeStatic()`);
                        warnMultipleSessionsStatic("Type", name);
                    }
                }
            }
        }
    }

    writeDeferred() {
        let index = 0;
        while (index < this.todo.length) {
            const { state, key, value, path } = this.todo[index++];
            this.writeInto(state, key, value, path, false);
        }
        this.todo.length = 0;
    }

    write(value, path, defer=true) {
        // NOTE: finite numbers, strings, and booleans typically are handled already
        switch (typeof value) {
            case "number":
                // JSON disallows NaN and Infinity, and writes -0 as "0"
                if (Object.is(value, -0)) return {$class: "NegZero"};
                if (Number.isFinite(value)) return value;
                if (Number.isNaN(value)) return {$class: "NaN"};
                return {$class: "Infinity", $value: Math.sign(value)};
            case "string":
            case "boolean":
                return value;
            case "undefined":
                return {$class: "Undefined"};
            case "bigint":
                return {$class: "BigInt", $value: value.toString()};
            default: {
                if (this.refs.has(value)) return this.writeRef(value);
                if (value === null) return value;
                // allow override of default writers
                if (this.writers.has(value.constructor)) return this.writers.get(value.constructor)(value, path);
                const type = Object.prototype.toString.call(value).slice(8, -1);
                if (this.writers.has(type)) return this.writers.get(type)(value, path);
                // default writers
                switch (type) {
                    case "Array": return this.writeArray(value, path, defer);
                    case "ArrayBuffer": return this.writeArrayBuffer(value);
                    case "Set":
                        return this.writeAs(type, value, [...value], path);
                    case "Map":
                        return this.writeAs(type, value, [...value].flat(), path); // flatten to single array [key, value, key, value, ...]
                    case "DataView":
                    case "Int8Array":
                    case "Uint8Array":
                    case "Uint8ClampedArray":
                    case "Int16Array":
                    case "Uint16Array":
                    case "Int32Array":
                    case "Uint32Array":
                    case "Float32Array":
                    case "Float64Array":
                        return this.writeTypedArray(type, value);
                    case "Object": {
                        if (value instanceof Model) return this.writeModel(value, path);
                        if (value.constructor === Object || typeof value.constructor !== "function") return this.writeObject(value, path, defer);
                        // no writer has been registered for this class
                        console.warn(`${App.libName}: unknown class at ${path}:`, value);
                        throw Error(`${App.libName}: class not registered in Model.types(): ${value.constructor.name}`);
                    }
                    case "Function":
                        if (value[QFUNC]) return this.writers.get(QFUNC)(value, path); // uses QFuncSpec
                        console.warn(`${App.libName}: found function at ${path}:`, value);
                        throw Error(`${App.libName}: cannot serialize functions except for QFuncs`);
                    default: {
                        // no writer has been registered for this type
                        console.warn(`${App.libName}: unsupported property at ${path}:`, value);
                        throw Error(`${App.libName}: serialization of ${type}s is not supported`);
                    }
                }
            }
        }
    }

    writeModel(model, path) {
        const state = {};
        this.refs.set(model, state);      // register ref before recursing

        try {
            state.$model = Model.classToID(model.constructor);
        } catch (err) {
            console.error(`unregistered model class at ${path}:`, model);
            throw err;
        }

        /* see comment in writeObject
        const descriptors = Object.getOwnPropertyDescriptors(model);
        for (const key of Object.keys(descriptors).sort()) {
            if (key === "__realm") continue;
            const descriptor = descriptors[key];
            if (descriptor.value !== undefined) {
                this.writeInto(state, key, descriptor.value, path);
            }
        }
        */

        for (const key of Object.keys(model).sort()) {
            if (key === "__realm") continue; // not enumerable in a Model, but is set directly in a ModelPart
            const value = model[key];
            if (((typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) || typeof value === "string" || typeof value === "boolean") && key[0] !== '$') {
                state[key] = value;
            } else {
                // for display purposes, we use the model name as the root path
                this.writeInto(state, key, value, `${model}`, true);
            }
        }

        return state;
    }

    writeObject(object, path, defer=true) {
        const state = {};
        this.refs.set(object, state);      // register ref before recursing
        for (const key of Object.keys(object).sort()) {
            const value = object[key];
            if (((typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) || typeof value === "string" || typeof value === "boolean") && key[0] !== '$') {
                state[key] = value;
            } else {
                this.writeInto(state, key, value, path, defer);
            }
        }

        return state;
    }

    writeArray(array, path, defer=true) {
        const state = [];
        this.refs.set(array, state);       // register ref before recursing
        for (let i = 0; i < array.length; i++) {
            const value = array[i];
            if ((typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) || typeof value === "string" || typeof value === "boolean") {
                state[i] = value;
            } else {
                this.writeInto(state, i, value, path, defer);
            }
        }
        return state;
    }

    writeArrayBuffer(buffer) {
        const state = {
            $class: "ArrayBuffer",
            $value: arrayBufferToBase64(buffer),
        };
        this.refs.set(buffer, state);
        return state;
    }

    writeTypedArray(type, array) {
        const state = {
            $class: type,
            $value: [this.write(array.buffer), array.byteOffset, type === "DataView" ? array.byteLength : array.length],
        };
        this.refs.set(array, state);
        return state;
    }

    writeAs(classId, object, value, path) {
        const state = { $class: classId };
        this.refs.set(object, state);      // register ref before recursing
        const written = this.write(value, path, false);
        // only use $value property if necessary
        if (typeof written !== "object" || written === null || written.$class || Array.isArray(written)) state.$value = written;
        else Object.assign(state, written);
        return state;
    }

    writeRef(object) {
        const state = this.refs.get(object);
        if (typeof state !== "object") throw Error("Non-object in refs: " + object);
        if (Array.isArray(state)) {
            // usually, extra properties on arrays don't get serialized to JSON
            // so we use this hack that does a one-time replacement of toJSON
            // on this particular array (and restore it in readAsArray() below)
            state.toJSON = function () {
                return {
                    $id: this.$id,
                    $class: "Array",
                    $value: [...this]
                };
            };
        }
        const $ref = state.$id || (state.$id = this.nextRef++);
        return {$ref};
    }

    writeInto(state, key, value, path, defer=true) {
        if (key[0] === '$') {
            if (!this.okayToIgnore[key]) {
                displayWarning(`snapshot: ignoring property ${key} (declare as okayToIgnore to suppress warning)`, { only: "once" });
                this.okayToIgnore[key] = true;
            }
            return;
        }
        if (defer && typeof value === "object") {
            this.todo.push({state, key, value, path});
            return;
        }
        const written = this.write(value, path + propertyAccessor(state, key));
        state[key] = written;
    }
}

const UNRESOLVED = Symbol("croquet:unresolved");

class VMReader {
    static newOrRecycled(vm) {
        let inst = this.reusableInstance;
        if (!inst) {
            inst = this.reusableInstance = new this(vm);
        } else {
            inst.vm = vm;
            inst.refs = new Map();
            inst.todo = [];
            inst.unresolved = [];
            inst.postprocess = [];
        }
        return inst;
    }

    static get reusableInstance() { return this[this.name + "-instance"]; }

    static set reusableInstance(val) { this[this.name + "-instance"] = val; }

    static resetInstance() { this.reusableInstance = null; }

    constructor(vm) {
        this.vm = vm;
        this.refs = new Map();
        this.todo = [];        // we use breadth-first deferred reading to limit stack depth
        this.unresolved = [];  // some refs can only be resolved in 2nd pass
        this.postprocess = []; // 3rd pass fills Sets and Maps that had unresolved refs
        this.readers = new Map();
        this.addReader("Teatime:Message", Message);
        this.addReader("Teatime:Data", DataHandleSpec);
        this.addReader("Teatime:QFunc", QFuncSpec);
        this.readers.set("Undefined", () => undefined);
        this.readers.set("NaN", () => NaN);
        this.readers.set("Infinity", sign => sign * Infinity);
        this.readers.set("NegZero", () => -0);
        this.readers.set("BigInt", value => BigInt(value));
        this.readers.set("ArrayBuffer", data => base64ToArrayBuffer(data));
        this.readers.set("DataView", args => new DataView(...args));
        this.readers.set("Int8Array", args => new Int8Array(...args));
        this.readers.set("Uint8Array", args => new Uint8Array(...args));
        this.readers.set("Uint8ClampedArray", args => new Uint8ClampedArray(...args));
        this.readers.set("Int16Array", args => new Int16Array(...args));
        this.readers.set("Uint16Array", args => new Uint16Array(...args));
        this.readers.set("Int32Array", args => new Int32Array(...args));
        this.readers.set("Uint32Array", args => new Uint32Array(...args));
        this.readers.set("Float32Array", args => new Float32Array(...args));
        this.readers.set("Float64Array", args => new Float64Array(...args));
        for (const [classId, ClassOrSpec] of Model.allClassTypes()) {
            this.addReader(classId, ClassOrSpec);
        }
    }

    addReader(classId, ClassOrSpec) {
        // default to assigning all properties to a new instance of the class
        let read = state => Object.assign(Object.create(ClassOrSpec.prototype), state);
        if (typeof ClassOrSpec === "object") read = ClassOrSpec.read;
        this.readers.set(classId, read);
    }

    enableBackwardCompatibility(snapshot) {
        // the Croquet version that created the snapshot
        const version = snapshot?.meta?.sdk;
        if (!version) return;
        const [major, minor, patch, pre] = version.split(/[-.+]/).map(n => +n);
        let parsed = `${major}.${minor}`;
        if (patch) parsed += `.${patch}`;
        if (pre) parsed += `-${pre}`;
        console.warn(`${App.libName}: reading snapshot version ${parsed}`);
        // before 1.1.0-7, Maps were written as an arry of [key, value] pairs
        this.compatMaps = major < 1 || (major === 1 && (minor < 1 || (minor === 1 && patch < 7)));
    }

    readVM(snapshot, root, compat) {
        if (root !== "VM") throw Error("VirtualMachine must be root object");
        if (compat) this.enableBackwardCompatibility(snapshot);
        const vmData = this.read(snapshot, root, false); // shallow read root props
        this.readDeferred();  // 1st pass: breadth-first, use UNRESOLVED placeholder for forward refs
        this.resolveRefs();   // 2nd pass: resolve forward refs
        this.doPostprocess(); // 3rd pass: fill Sets and Maps with resolved temp content arrays
        this.readAllStatic(vmData); // create initializers for static class properties
        return vmData;
    }

    readDeferred() {
        let index = 0;
        while (index < this.todo.length) {
            const {object, key, value, path} = this.todo[index++];
            this.readInto(object, key, value, path, false);
        }
        this.todo.length = 0;
    }

    resolveRefs() {
        for (const {object, key, ref, path} of this.unresolved) {
            if (this.refs.has(ref)) {
                object[key] = this.refs.get(ref);
            } else {
                throw Error(`Unresolved ref: ${ref} at ${path}[${JSON.stringify(key)}]`);
            }
        }
        this.unresolved.length = 0;
        this.refs.clear();
    }

    doPostprocess() {
        for (const fn of this.postprocess) {
            fn();
        }
        this.postprocess.length = 0;
    }

    readAllStatic(vmState) {
        const { staticModelProps, staticTypeProps } = vmState;
        const staticInitializers = [];
        if (staticModelProps) {
            for (const [name, props] of Object.entries(staticModelProps)) {
                const modelClass = Model.classFromID(name);
                staticInitializers.push(() => Object.assign(modelClass, props));
                warnMultipleSessionsStatic("Model", name);
            }
            delete vmState.staticModelProps;
        }
        if (staticTypeProps) {
            const ClassOrSpecs = Object.fromEntries(Model.allClassTypes());
            for (const [name, props] of Object.entries(staticTypeProps)) {
                const ClassOrSpec = ClassOrSpecs[name];
                if (typeof ClassOrSpec === "object") {
                    const typeSpec = ClassOrSpec;
                    staticInitializers.push(() => typeSpec.readStatic(props));
                } else {
                    const classFromTypes = ClassOrSpec;
                    staticInitializers.push(() => Object.assign(classFromTypes, props));
                }
                warnMultipleSessionsStatic("Type", name);
            }
            delete vmState.staticTypeProps;
        }
        if (staticInitializers.length) {
            vmState.staticInitializers = staticInitializers;
        }
    }

    read(value, path, defer=true) {
        // if defer is false, this is the $value property of an object,
        // which is either a plain Array or a plain Object
        switch (typeof value) {
            case "number":
            case "string":
            case "boolean":
                return value;
            default: {
                const type = Object.prototype.toString.call(value).slice(8, -1);
                switch (type) {
                    case "Array": return this.readArray(value, path, defer);
                    case "Null": return null;
                    case "Object": {
                        const { $class, $model, $ref } = value;
                        if ($ref) throw Error("refs should have been handled in readInto()");
                        if ($model) return this.readModel(value, path);
                        if ($class) return this.readAs($class, value, path);
                        return this.readObject(Object, value, path, defer);
                    }
                    default:
                        throw Error(`Don't know how to deserialize ${type} at ${path}`);
                }
            }
        }
    }

    readModel(state, path) {
        const model = Model.instantiateClassID(state.$model, state.id);
        if (state.$id) this.refs.set(state.$id, model);
        for (const [key, value] of Object.entries(state)) {
            if (key === "id" || key[0] === '$') continue;
            this.readInto(model, key, value, path);
        }
        return model;
    }

    readObject(Class, state, path, defer=true) {
        const object = new Class();
        if (state.$id) this.refs.set(state.$id, object);
        for (const [key, value] of Object.entries(state)) {
            if (key[0] === '$') continue;
            this.readInto(object, key, value, path, defer);
        }
        return object;
    }

    readArray(array, path, defer=true) {
        const result = [];
        if (array.$id) this.refs.set(array.$id, result);
        for (let i = 0; i < array.length; i++) {
            if (array[i] !== undefined) this.readInto(result, i, array[i], path, defer); // allow for missing indices
        }
        return result;
    }

    // special case for arrays with a $id property which is not preserved by JSON
    // instead they were serialized as { $class: "Array", $value: [...], $id: ... }
    // in writeRef(), so we restore the $id property here
    readAsArray(state, path, defer=true) {
        const array = state.$value;
        if (state.$id) array.$id = state.$id;
        return this.readArray(array, path, defer);
    }

    readAsSet(state, path) {
        const set = new Set();
        if (state.$id) this.refs.set(state.$id, set);
        const before = this.unresolved.length;
        const contents = this.read(state.$value, path, false);
        const fillContents = () => {
            for (const item of contents) set.add(item);
        };
        if (this.unresolved.length === before) {
            fillContents();
        } else {
            // resolving refs only updates the contents array, so we need to defer this
            this.postprocess.push(fillContents);
        }
        return set;
    }

    readAsMap(state, path) {
        const map = new Map();
        if (state.$id) this.refs.set(state.$id, map);
        const before = this.unresolved.length;
        const contents = this.read(state.$value, path, false);
        const fillContents = this.compatMaps
            ? // before 1.1.0-7, Maps were written as an arry of [key, value] pairs
                () => {
                    // see if all entries have been resolved
                    if (contents.some(keyValue => keyValue.length !== 2)) {
                        // not yet resolved, defer
                        console.warn("Deferring map resolution at", path);
                        this.postprocess.push(fillContents);
                    } else {
                        for (const [key, value] of contents) map.set(key, value);
                    }
                }
            : // since 1.1.0-7, Maps are written as a flat array [key, value, key, value, ...]
                () => {
                    for (let i = 0; i < contents.length; i += 2) map.set(contents[i], contents[i + 1]);
                };
        if (this.unresolved.length === before) {
            fillContents();
        } else {
            // resolving refs only updates the contents array, so we need to defer this
            this.postprocess.push(fillContents);
        }
        return map;
    }

    readAsClass(classId, state, path) {
        let temp = {};
        const unresolved = new Map();
        if ("$value" in state) temp = this.read(state.$value, path, false);
        else for (const [key, value] of Object.entries(state)) {
            if (key[0] === '$') continue;
            const ref = value && value.$ref;
            if (ref) {
                if (this.refs.has(ref)) temp[key] = this.refs.get(ref);
                else {
                    temp[key] = UNRESOLVED;
                    unresolved.set(ref, key);
                }
            } else {
                this.readInto(temp, key, value, path, false);
            }
        }
        const reader = this.readers.get(classId);
        const object = reader(temp, path);
        if (!object && classId !== "Undefined" && classId !== "BigInt" && classId !== "NaN" && classId !== "NegZero") console.warn(`Reading "${classId}" returned ${object} at ${path}`);
        if (state.$id) this.refs.set(state.$id, object);
        for (const [ref, key] of unresolved.entries()) {
            this.unresolved.push({object, key, ref, path});
        }
        return object;
    }

    readAs(classId, state, path) {
        switch (classId) {
            case "Array": return this.readAsArray(state, path);
            case "Set": return this.readAsSet(state, path);
            case "Map": return this.readAsMap(state, path);
            default: return this.readAsClass(classId, state, path);
        }
    }

    readRef(object, key, value, path) {
        if (!value || !value.$ref) return false;
        const ref = value.$ref;
        if (this.refs.has(ref)) {
            object[key] = this.refs.get(ref);
        } else {
            object[key] = UNRESOLVED;
            this.unresolved.push({object, key, ref, path});
        }
        return true;
    }

    readInto(object, key, value, path, defer=true) {
        if (this.readRef(object, key, value, path)) return;
        if (defer && typeof value === "object") {
            this.todo.push({object, key, value, path});
            return;
        }
        object[key] = this.read(value, path + propertyAccessor(object, key)); // always deferred
    }
}

class MessageArgumentEncoder extends VMWriter {
    encode(args) {
        const encoded = this.writeArray(args, "args");
        this.writeDeferred();
        return encoded;
    }

    writeModel(model) {
        return { $ref: model.id };
    }
}

class MessageArgumentDecoder extends VMReader {
    decode(args) {
        const decoded = this.readArray(args, "args");
        this.readDeferred();
        this.resolveRefs();
        this.doPostprocess();
        return decoded;
    }

    resolveRefs() {
        for (const {object, key, ref, path} of this.unresolved) {
            if (this.refs.has(ref)) {
                object[key] = this.refs.get(ref);
            } else {
                const model = this.vm.lookUpModel(ref);
                if (model) object[key] = model;
                else throw Error(`Unresolved ref: ${ref} at ${path}[${JSON.stringify(key)}]`);
            }
        }
    }
}

export function resetReadersAndWriters() {
    VMReader.resetInstance();
    VMWriter.resetInstance();
    MessageArgumentEncoder.resetInstance();
    MessageArgumentDecoder.resetInstance();
}

// we handle reading/writing for all the system classes
const SYSTEM_CLASSES = [
    Object,
    Array,
    Map,
    Set,
    BigInt,
    ArrayBuffer,
    DataView,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
];

export function gatherClassTypes(object, prefix, gatheredClasses, seen) {
    // get all contained values
    const values = (Array.isArray(object) ? object
        : object.constructor === Set ? object.values()
        : object.constructor === Map ? object.entries()
        : Object.values(object));
    // filter out non-objects and already seen objects
    const newObjects = [];
    for (const val of values) {
        if (typeof val !== 'object' || val === null || seen.has(val)) continue;
        seen.add(val);
        newObjects.push(val);
    }
    // gather classes of the new objects, ignoring standard classes
    for (const obj of newObjects) {
        if (SYSTEM_CLASSES.includes(obj.constructor)) continue;

        const className = prefix + '.' + obj.constructor.name;
        if (gatheredClasses[className]) {
            if (gatheredClasses[className] !== obj.constructor) {
                throw new Error("Class with name " + className + " already gathered, but new one has different identity");
            }
        } else {
            gatheredClasses[className] = obj.constructor;
        }
    }
    // recurse into the new objects
    for (const obj of newObjects) {
        gatherClassTypes(obj, prefix, gatheredClasses, seen);
    }
}

function warnMultipleSessionsStatic(kind, className) {
    // warn about static properties if there is more than one session
    const sessions = viewDomain.controllers.size;
    if (sessions > 1) {
        displayWarning(`Static properties in shared ${kind} ${className} ` +
            `can lead to divergence because ${sessions} ` +
            `${App.libName} sessions are running simultaneaously. Consider using ` +
            `wellKnownModel() instead.`,
            { only: "once" });
    }
}

function arrayBufferToBase64(buffer) {
    const array = new Uint8Array(buffer);
    const dest = [];
    for (let i = 0; i < array.byteLength; i += 4096) {
        const chunk = array.subarray(i, i + 4096);
        dest.push(String.fromCharCode.apply(null, chunk));
    }
    return globalThis.btoa(dest.join(''));
}

function base64ToArrayBuffer(base64) {
    const string = globalThis.atob(base64);
    const n = string.length;
    const array = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        array[i] = string.charCodeAt(i);
    }
    return array.buffer;
}
