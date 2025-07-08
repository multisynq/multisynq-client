// There are three kinds of messages:
// 1. An app to the container.
// 2. The container to a single app
// 3. The container to all apps

// The TeaTime framework creates a singleton instance of M and install it to Croquet.Messenger
// To use the Messenger object, the client needs to set the receiver object for invoking the handler for an incoming message:
//  Croquet.Messenger.setReceiver(this);

// where "this" is a view side object that handles incoming messages.

// To listen on an incoming message, the receiver calls:
//    Croquet.Messenger.on(event<string>, callback<function or method name<string>>);

// To send a message:
//    Croquet.Messenger.send(event<string>, data<serializable object>, receipent<window or null>);

// An app can send a message only to the container so the recipient argument will be ignored.
// The container can send a message to a specific Window by supplying the third argument.

// When a message is received, the function or the method specified by the method name is invoked with the object provided for the Messenger constructor as "this".

// The object follows the "structured clone algorithm, but let us say that it should be
// JSONable

// An example on the container side looks like this (the view class or the expander, is an instance of PasteUpView in this example):

//    init() {
//      Croquet.Messenger.setReceiver(this);
//      Croquet.Messenger.onC"requestUserInfo", "sendUserInfo");
//    }
//
//    and aPasteUpView.sendUsernfo looks like:
//    sendUserInfo(data, source) {
//       const userInfo = this.model._get("userInfo")[this.viewId];
//       Croquet.Messenger.send("userInfo", userInfo, source);
//       // where the last argument specifies that this is a directed message
//    }

// The container needs to be careful what information it sends to an app.

// On the container side, there is a method called setIframeEnumerator, where Croquet, of a future container app, specifies a way to enumerate all relevant iframes.

// For a cursor movement, an app may do:
// Croquet.Messenger.send("pointerPosition", {x, y});

// The container side PasteUpView would have a subscriber:

//    handlePointerMove(data, source) {
//        let iframe = this.apps[source]; // this.apps would be a WeakMap
//        let translatedPostion = f(iframe.style.transformation... data.x, ... data.y);
//        this.pointerMoved(transatedPosition);
//    }

class M {
    constructor() {
        this.ready = false;
        this.isInIframe =  window.top !== window;
        this.subscriptions = {};
        this.enumerator = null;
    }

    setReceiver(receiver) {
        this.receiver = receiver;
        this.ready = true;
    }

    setIframeEnumerator(func) {
        this.enumerator = func;
    }

    on(event, method) {
        if (!this.receiver) {throw Error("setReceiver() has not been called");}
        if (typeof method === "string") {
            method = this.receiver[method];
        }

        if (!method) {throw Error("Messenger.on: the second argument must be a method name or a function");}

        if (!this.subscriptions[event]) {
            this.subscriptions[event] = [];
        } else if (this.findIndex(this.subscriptions[event], method) >= 0) {
            throw Error(`${method} is already subscribed`);
        }
        this.subscriptions[event].push(method);

        if (!this.listener) {
            this.listener = msg => this.receive(msg);
            window.addEventListener("message", this.listener);
        }
    }

    detach() {
        if (this.listener) {
            window.removeEventListener("message", this.listener);
            this.listener = null;
        }

        this.stopPublishingPointerMove();

        this.receiver = null;
        this.subscriptions = {};
        this.enumerator = null;
        this.ready = false;
    }

    removeSubscription(event, method) {
        if (typeof method === "string") {
            method = this.receiver[method];
        }

        const handlers = this.subscriptions[event];
        if (handlers) {
            const indexToRemove = this.findIndex(handlers, method);
            handlers.splice(indexToRemove, 1);
            if (handlers.length === 0) delete this.subscriptions[event];
        }
    }

    removeAllSubscriptions() {
        this.subscriptions = {};
    }

    receive(msg) {
        const {event, data} = msg.data;
        const source = msg.source;

        this.handleEvent(event, data, source);
    }

    handleEvent(event, data, source) {
        const handlers = this.subscriptions[event];
        if (!handlers) {return;}
        handlers.forEach(handler => {
            handler.call(this.receiver, data, source);
        });
    }

    send(event, data, directWindow) {
        if (this.isInIframe) {
            window.top.postMessage({event, data}, "*");
            return;
        }

        if (directWindow) {
            directWindow.postMessage({event, data}, "*");
            return;
        }

        if (!this.enumerator) {return;}

        const iframes = this.enumerator();
        iframes.forEach(iframe => {
            iframe.contentWindow.postMessage({event, data}, "*");
            // or we still pass a strong created from iframe as target origin
        });
    }

    findIndex(array, method) {
        const mName = method.name;
        return array.findIndex(entry => {
            const eName = entry.name;
            if (!mName && !eName) {
                // when they are not proxied, a === comparison
                // for the case of both being anonymous
                return method === entry;
            }
            // otherwise, compare their names.
            // it is okay as the receiver is the same,
            // and the client should call removeSubscription if it wants to update the handler
            return mName === eName;
        });
    }

    startPublishingPointerMove() {
        if (this._moveHandler) {return;}
        this._moveHandler = evt => this.send("pointerPosition", {x: evt.clientX, y: evt.clientY, type: evt.type});
        window.document.addEventListener("pointermove", this._moveHandler, true);
    }

    stopPublishingPointerMove() {
        if (this._moveHandler) {
            window.document.removeEventListener("pointermove", this._moveHandler, true);
            this._moveHandler = null;
        }
    }

}

export const Messenger = new M();
