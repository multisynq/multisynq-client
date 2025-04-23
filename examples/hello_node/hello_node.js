// Hello World Node Example
//
// Croquet Labs, 2025
//
// This is an example of a simple Multisynq application. It creates a counter that counts up ten
// times per second. Pressing return resets it to zero. The model is exactly the same as the HTML
// Hello World example, so they can join the same session.

import * as Multisynq from "@multisynq/client";

//------------------------------------------------------------------------------------------
// Define our model. MyModel has a tick method that executes 10 times per second. It updates
// the value of a counter. It also listens for reset events from the view. When it receives
// one, it resets the counter to zero. Note that the model does not need to broadcast the
// change to the counter. The code is executed on all clients in the same session, so the
// counter is automatically updated on all clients.
//------------------------------------------------------------------------------------------

class MyModel extends Multisynq.Model {

    // Note that models are initialized with "init" instead of "constructor"!
    init() {
        this.counter = 0;
        this.subscribe("counter", "reset", this.resetCounter);
        this.future(100).tick();
    }

    // this method is called when the model receives a reset event from the view. It resets
    // the counter to zero. Note that this method is called on all clients in the same session
    // at the same time, so the value is automatically updated on all clients.
    resetCounter() {
        this.counter = 0;
    }

    // this method calls itself every 100ms via the future() mechanism. It is similar to
    // setTimeout() but it is deterministic. It will be executed on all clients in the same
    // session at the same time.
    tick() {
        this.counter += 0.1;
        this.future(100).tick();
    }

}

// Register our model class with the serializer so when another user joins the session,
// the model can be reconstructed from the stored snapshot
MyModel.register("MyModel");

//------------------------------------------------------------------------------------------
// Define our view. MyView listens for update events from the model. If it receives
// one, it logs the current count.
// TODO: Add a way to reset the counter via node client (maybe read console keyboard input?)
//------------------------------------------------------------------------------------------

class MyView extends Multisynq.View {

    constructor(model) { // The view gets a reference to the model when the session starts.
        super(model);
        this.model = model;
        this.update(); // Get the current count on start up.
        this.counter = 0;
    }

    reset() {
        this.publish("counter", "reset");
    }

    update() {
        if (this.model.counter !== this.counter) {
            this.counter = this.model.counter;
            process.stdout.write(`\x1b[2K\rCounter: ${this.counter.toFixed(1)}`);
        }
    }
}

// when a key is pressed, publish a reset event to the model
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", (key) => {
    if (key.toString() === "\u0003") { // Ctrl-C
        process.exit();
    } else if (session.view) {
        session.view.publish("counter", "reset");
    }
});

//------------------------------------------------------------------------------------------
// Join the Teatime session and spawn our model and view.
//------------------------------------------------------------------------------------------

if (process.argv.length < 4) {
    console.log("Usage: node hello_node.js <session-name> <session-password>");
    process.exit(1);
}

const session = await Multisynq.Session.join({
    apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
    appId: "io.multisynq.hello",
    name: process.argv[2],
    password: process.argv[3],
    model: MyModel,
    view: MyView,
    step: "manual",
});

setInterval(() => session.step(), 100);
