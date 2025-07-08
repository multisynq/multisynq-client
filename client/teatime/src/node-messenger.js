// generate stub class for Node.js

class M {
    constructor() {
        this.ready = false;
    }

    setReceiver(_receiver) { }

    setIframeEnumerator(_func) { }

    on(_event, _method) { }

    detach() { }

    removeSubscription(_event, _method) { }

    removeAllSubscriptions() { }

    receive(_msg) { }

    handleEvent(_event, _data, _source) { }

    send(_event, _data, _directWindow) { }

    // findIndex(_array, _method) { }

    startPublishingPointerMove() { }

    stopPublishingPointerMove() { }
}

export const Messenger = new M();
