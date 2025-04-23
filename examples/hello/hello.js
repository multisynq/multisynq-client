// Hello World Example
//
// Multisynq Labs, 2025
//
// This is an example of a simple Multisynq application. It creates a counter that counts up ten
// times per second. Clicking on it resets it to zero. The counter is replicated across the network
// and will respond to clicks from any user in the same session.

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
// Define our view. MyView listens for click events on the window. If it receives one, it
// broadcasts a reset event. It also constantly updates the counter on the screen with the
// current count.
//------------------------------------------------------------------------------------------

class MyView extends Multisynq.View {

    constructor(model) { // The view gets a reference to the model when the session starts.
        super(model);
        this.model = model;
        this.clickHandler = event => this.onclick(event);
        document.addEventListener("click", this.clickHandler, false);
        this.update(); // Update the view with the initial value of the counter.
    }

    // the view must only interact with the model via events. It is allowed to directly read
    // but must never write to the model, which would break determinism.
    onclick() {
        this.publish("counter", "reset");
    }

    // update() is called constantly via requestAnimationFrame. It can direcly read from
    // the model
    update() {
        document.getElementById("counter").innerHTML = this.model.counter.toFixed(1);
    }

    // when the session is interrupted, we need to stop listening for events
    // because the view will get constructed again wiht a new model when the session
    // recovers
    detach() {
        document.removeEventListener("click", this.clickHandler);
        super.detach();
    }
}

//------------------------------------------------------------------------------------------
// Join the session and spawn our model and view.
// If there is no session name on the URL, a new random session name and password will be
// generated. If there is a session name, it will be used to join the session.
// The session name and password are stored in the URL, so you can share the link with other users
// to join the same session.
//------------------------------------------------------------------------------------------

Multisynq.Session.join({
    apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
    appId: "io.multisynq.hello",
    model: MyModel,
    view: MyView,
});
