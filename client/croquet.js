import {
    Model, View, Session, Data, Constants, App, Messenger, VERSION
} from "./teatime";

export {
    Model, View, Session, Data, Constants, App, Messenger, VERSION
};

const Croquet = {
    Model, View, Session, Data, Constants, App, Messenger, VERSION
};

Model.Croquet = Croquet;
View.Croquet = Croquet;

if (typeof __CROQUET_DEVTOOLS__ !== 'undefined') {
    __CROQUET_DEVTOOLS__.dispatchEvent(new CustomEvent('load', {
        detail: {
            version: VERSION,
        }
    }));
}

if (typeof globalThis !== 'undefined') {
    if (globalThis.__CROQUET__) {
        console.warn( 'WARNING: Multiple instances of Croquet being imported.' );
    } else {
        globalThis.__CROQUET__ = VERSION;
    }
}
