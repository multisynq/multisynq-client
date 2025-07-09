// Multisynq uses Croquet to run the client-side code

import {
    Model,
    View,
    Session,
    Data,
    Constants,
    App,
} from "./client/croquet";

const VERSION = _MULTISYNQ_VERSION_ || "0.0.0"; // replaced by esbuild
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

// mimic how Croquet does it
Model.Multisynq = Multisynq;
View.Multisynq = Multisynq;


if (typeof globalThis !== 'undefined') {
    if (globalThis.__MULTISYNQ__) {
        console.warn( 'WARNING: Multiple instances of Multisynq being imported.' );
    } else {
        globalThis.__MULTISYNQ__ = VERSION;
    }
}
