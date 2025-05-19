// Multisynq uses Croquet to run the client-side code

import {
    Model,
    View,
    Session,
    Data,
    Constants,
    App,
} from "@croquet/croquet";

const VERSION = process.env.MULTISYNQ_VERSION || "0.0.0";
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
(Model as any).Multisynq = Multisynq;
(View as any).Multisynq = Multisynq;


if (typeof globalThis !== 'undefined') {
    if (globalThis.__MULTISYNQ__) {
        console.warn( 'WARNING: Multiple instances of Multisynq being imported.' );
    } else {
        globalThis.__MULTISYNQ__ = VERSION;
    }
}
