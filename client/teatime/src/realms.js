import urlOptions from "./_URLOPTIONS_MODULE_"; // eslint-disable-line import/no-unresolved
import { viewDomain } from "./domain";


let DEBUG = {
    get subscribe() {
        // replace with static value on first call
        DEBUG = { subscribe: urlOptions.has("debug", "subscribe", false) };
        return DEBUG.subscribe;
    }
};


class ModelRealm {
    constructor(vm) {
        /** @type import('./vm').default */
        this.vm = vm;
    }
    register(model) {
        return this.vm.registerModel(model);
    }
    deregister(model) {
        this.vm.deregisterModel(model.id);
    }
    publish(event, data, scope) {
        this.vm.publishFromModel(scope, event, data);
    }
    subscribe(model, scope, event, methodName) {
        if (DEBUG.subscribe) console.log(`Model.subscribe("${scope}:${event}", ${model} ${(""+methodName).replace(/\([\s\S]*/, '')})`);
        return this.vm.addSubscription(model, scope, event, methodName);
    }
    unsubscribe(model, scope, event, methodName='*') {
        if (DEBUG.subscribe) console.log(`Model.unsubscribe(${scope}:${event}", ${model} ${(""+methodName).replace(/\([\s\S]*/, '')})`);
        this.vm.removeSubscription(model, scope, event, methodName);
    }
    unsubscribeAll(model) {
        if (DEBUG.subscribe) console.log(`Model.unsubscribeAll(${model} ${model.id})`);
        this.vm.removeAllSubscriptionsFor(model);
    }

    future(model, tOffset, methodName, methodArgs) {
        if (__currentRealm && __currentRealm.equal(this)) {
            return this.vm.future(model, tOffset, methodName, methodArgs);
        }
        throw Error(`Model.future() called from outside: ${model}`);
    }

    cancelFuture(model, methodOrMessage) {
        if (__currentRealm && __currentRealm.equal(this)) {
            return this.vm.cancelFuture(model, methodOrMessage);
        }
        throw Error(`Model.cancelFuture() called from outside: ${model}`);
    }

    random() {
        return this.vm.random();
    }

    now() {
        return this.vm.time;
    }

    equal(otherRealm) {
        return otherRealm instanceof ModelRealm && otherRealm.vm === this.vm;
    }

    isViewRealm() { return false; }
}

class ViewRealm {
    constructor(vm) {
        /** @type import('./vm').default */
        this.vd = viewDomain;
        this.vm = vm;                    // if vm !== controller.vm, this view is invalid
        this.controller = vm.controller; // controller stays the same even across reconnects
    }

    valid() {
        return this.vm === this.controller.vm;
    }

    register(view) {
        return viewDomain.register(view);
    }

    deregister(view) {
        viewDomain.deregister(view);
    }

    publish(event, data, scope) {
        this.vm.publishFromView(scope, event, data);
    }
    subscribe(event, subscriberId, callback, scope, handling="queued") {
        if (DEBUG.subscribe) console.log(`View[${subscriberId}].subscribe("${scope}:${event}" ${callback ? callback.name || (""+callback).replace(/\([\s\S]*/, '') : ""+callback} [${handling}])`);
        viewDomain.addSubscription(scope, event, subscriberId, callback, handling);
    }
    unsubscribe(event, subscriberId, callback=null, scope) {
        if (DEBUG.subscribe) console.log(`View[${subscriberId}].unsubscribe("${scope}:${event}" ${callback ? callback.name || (""+callback).replace(/\([\s\S]*/, '') : "*"})`);
        viewDomain.removeSubscription(scope, event, subscriberId, callback);
    }
    unsubscribeAll(subscriberId) {
        if (DEBUG.subscribe) console.log(`View[${subscriberId}].unsubscribeAll()`);
        viewDomain.removeAllSubscriptionsFor(subscriberId);
    }

    future(view, tOffset) {
        const vm = this.vm;
        return new Proxy(view, {
            get(_target, property) {
                if (typeof view[property] === "function") {
                    const methodProxy = new Proxy(view[property], {
                        apply(_method, _this, args) {
                            setTimeout(() => { if (view.id) inViewRealm(vm, () => view[property](...args), true); }, tOffset);
                        }
                    });
                    return methodProxy;
                }
                throw Error("Tried to call " + property + "() on future of " + Object.getPrototypeOf(view).constructor.name + " which is not a function");
            }
        });
    }

    random() {
        return Math.random();
    }

    now() {
        return this.vm.time;
    }

    externalNow() {
        return this.controller.reflectorTime;
    }

    extrapolatedNow() {
        return this.controller.extrapolatedTime;
    }

    isSynced() {
        return !!this.controller.synced;
    }

    equal(otherRealm) {
        return otherRealm instanceof ViewRealm && otherRealm.vm === this.vm;
    }

    isViewRealm() { return true; }
}

let __currentRealm = null;

/** @returns {ModelRealm | ViewRealm} */
export function currentRealm(errorIfNoRealm="Tried to execute code that requires realm outside of realm.") {
    if (!__currentRealm && errorIfNoRealm) {
        throw Error(errorIfNoRealm);
    }
    return __currentRealm;
}

export function inModelRealm(vm, callback) {
    if (__currentRealm !== null) {
        throw Error("Can't switch realms from inside realm");
    }
    try {
        __currentRealm = new ModelRealm(vm);
        return callback();
    } finally {
        __currentRealm = null;
    }
}

export function inViewRealm(vm, callback, force=false) {
    if (__currentRealm !== null && !force) {
        throw Error("Can't switch realms from inside realm");
    }
    const prevRealm = __currentRealm;
    try {
        __currentRealm = new ViewRealm(vm);
        return callback();
    } finally {
        __currentRealm = prevRealm;
    }
}
