Copyright © 2025 Croquet Labs

To create a Multisynq application, you need to define two classes that inherit from the base classes {@link Model} and {@link View} from the Multisynq client library:

```
class MyModel extends Multisynq.Model {
    init() {
        ...
    }
}
MyModel.register("MyModel");

class MyView extends Multisynq.View {
    constructor(model) {
        super(model);
        ...
    }
}
```

Your view will contain all your input and output code, and your model will contain all your simulation code.

(Note that every time you define a new model subclass, you must `register("name")` it so that Multisynq knows it exists, and under which name to find its instances in a snapshot.)

## Launching a session

You launch a session by calling {@link Session.join} from the Multisynq client library.  Its arguments are the id of your app (which needs to be unique, so using a reverse-DNS name like `"com.example.myapp"` is good), name and password of the session you're creating, the class types of your model and your view, and a set of session options (described below).

The session name exists to distinguish multiple sessions per app. You may use our `autoSession` helper which parses URL search parameters and creates a new random session name if necessary.
The session password encrypts all data sent via the internet. If your app does not use data worth protecting, you still need to provide a dummy password. You may use our `autoPassword` helper which parses the URL hash and creates a new random password if necessary, appending it to the url for sharing. (Note: both `autoSession` and `autoPassword` return promises. `Session.join` waits for all promises to resolve). In production you probably want to add some UI letting users type in the password.

```
const apiKey = "your_api_key";              // paste from multisynq.io/coder
const appId = "com.example.myapp";
const name = Multisynq.App.autoSession();
const password = Multisynq.App.autoPassword();
Multisynq.Session.join({ apiKey, appId, name, password, model: MyModel, view: MyView });
```

Starting the session will do the following things:

1. Connect to a nearby public synchronizer using the provided [API key](https://multisynq.io/coder)
2. Instantiate the model
3. a) Run the initialization code in the model's init routine -or-<br>
   b) Initialize the model from a saved snapshot
4. Instantiate the view, passing the view constructor a reference to the model
5. Create a main event loop and begin executing

The main loop runs each time the window performs an animation update — commonly, 60 times per second. On each iteration of the main loop, it will first process all pending events in the model, then process all pending events in the view, then call {@link View#render}.

**Note that the code in your model's `init()` routine only runs the first time the application launches.** If another user joins a session that's in progress, they will load the most recent snapshot of model state. The same is true if you quit a session and rejoin it later.

**TODO:** mention how session ids are derived from code hashes and url session slugs

## Advanced Topic: Creating Your Own Main Loop

If you want more control over your main loop, you can pass out the `step: "manual"` directive and write a main loop yourself. For example:

```
const session = await Multisynq.Session.join({..., step: "manual"});
window.requestAnimationFrame(frame);

function frame(now) {
    if (session.view) {
        session.view.myInputMethod();
        session.step(now);
        session.view.myOutputMethod();
    }
    window.requestAnimationFrame(frame);
}
```
