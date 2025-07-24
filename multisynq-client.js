import {
    Model,
    View,
    Session,
    Data,
    Constants,
    App,
    VERSION,
} from "./client/teatime";

console.log(`Multisynq ${VERSION}`);

export {
    Model,
    View,
    Session,
    Data,
    Constants,
    App,
    VERSION,
}

const Multisynq = {
    Model,
    View,
    Session,
    Data,
    Constants,
    App,
    VERSION,
};

Model.Multisynq = Multisynq;
View.Multisynq = Multisynq;

// hook for future browser devtools
if (typeof __MULTISYNQ_DEVTOOLS__ !== 'undefined') {
    __MULTISYNQ_DEVTOOLS__.dispatchEvent(new CustomEvent('load', {
        detail: {
            version: VERSION,
            lib: Multisynq,
        }
    }));
}

if (typeof globalThis !== 'undefined') {
    if (globalThis.__MULTISYNQ__) {
        console.warn( 'WARNING: Multiple instances of Multisynq being imported.' );
    } else {
        globalThis.__MULTISYNQ__ = VERSION;
    }
}
