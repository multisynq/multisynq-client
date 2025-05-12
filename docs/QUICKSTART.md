*Multisynq lets you build real-time multiuser apps without writing server-side code. Unlike traditional client/server architectures, the multiplayer code is executed on each client in a synchronized virtual machine, rather than on a server. Multisynq is available as a JavaScript library that synchronizes apps using Multisynq's global DePIN network.*

Please join the Multisynq [**Developer Discord**](https://multisynq.io/discord/) for any questions.

* [Quickstart](#quickstart)
* [What is Multisynq?](#what-is-multisynq%3F)
* [Main Concepts](#main-concepts)
* [Creating a Multisynq App](#creating-a-multisynq-app)
* [Models](#models)
* [Views](#views)
* [Events](#events)
* [Time](#time)
* [Snapshots](#snapshots)
* [Random](#random)

# Quickstart

**_First, get a free Multisynq API key from [multisynq.io/coder](https://multisynq.io/coder/)_**
_(you can also run your own server but you won't get the benefit of automatic global scaling)_

Multisynq runs fine without a bundler. Just put it in a script tag in your HTML:
```HTML
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/@multisynq/client@@CLIENT_VERSION@/bundled/multisynq-client.min.js"></script>
```
This makes `Multisynq` globally available. The `charset="utf-8"` declaration is necessary to get identical code hashing across browsers.

You can also import it directly as a module in your JS file:

```JS
import * as Multisynq from "https://cdn.jsdelivr.net/npm/@multisynq/client@@CLIENT_VERSION@/bundled/multisynq-client.esm.js";
```

That same module URL works fine in HTML in an import map.

**_Alternatively, use the package with a bundler:_**

```SH
npm install @multisynq/client
```

Then import it in your JS file:
```JS
import * as Multisynq from "@multisynq/client"
```

Again, make sure to specify the `charset` for your HTML or your script tags.

## Main Concepts

Every Multisynq application must consist of two largely independent parts:

* The **models** handle all calculation and simulation. This is where the actual work of the application takes place. The model computation is synchronized automatically.

* The **views** handle user input and output. They process all keyboard / mouse / touch events, and determine what is displayed on the screen.

**Models are guaranteed to always be identical for all users.** However, the views are not. Different users might be running on different hardware platforms, or might display different representations of the models.

When you launch a Multisynq application, you automatically join a shared **session**. As long as you're in the session, your models will be identical to the models of every other user in the session.

To maintain this synchronization, models for all users execute in lockstep based on a shared session **time**.

The views interact with the models through **events**. When you publish an event from a view, it's mirrored to everyone else in your session, so everyone's models receive exactly the same event stream.

**_THE MAIN RULE OF MULTISYNQ IS THAT THE MODEL MUST BE COMPLETELY SELF-CONTAINED!_**

_Model code must not access any state outside the model, and the model state must never be changed from the view directly. The view can read from a model but must never write. Any externak change to the model must be via a published event that the model subscribes to._

There are no special data structures you need to use, and the whole model is synchronized automatically wothout designating which parts to synchronize. Inside the model you can use almost any JavaScript, *except* for storing functions (that precludes any async execution, too). That's because the entire state of the model needs to be snapshottable, and JavaScript code cannot access state captured in functions.

## Creating a Multisynq App

To create a new a Multisynq app, you define your own models and views. These classes inherit from the base classes {@link Model} and {@link View} in the Multisynq client library.

A simple app often only has one model and one view. In that case, the view contains all your input and output code, and the model contains all your simulation code.

```JS
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

    update(time) {
        ...
    }
}
```

You then join a session by calling [Session.join()]{@link Session.join} and passing it your model and view classes. `Session.join` automatically connects to a nearby reflector, synchronizes your model with the models of any other users already in the same session, and starts executing.

You do need to provide some session meta data, like your API key, an appId, session name, and a password. Below we use `autoSession`/`autoPassword` but you can instead use whatever makes most sense for your app. In the tutorials we even often use constants for all, but you should not do that in production because it wouldn't be end-to-end encrypted anymore if the password is known.

```JS
const apiKey = "your_api_key"; // paste from multisynq.io/coder
const appId = "com.example.myapp";
const name = Multisynq.App.autoSession();
const password = Multisynq.App.autoPassword();
Multisynq.Session.join({apiKey, appId, name, password, model: MyModel, view: MyView});
```

That's it. You don't need to worry about setting up a server, or writing special synchronization code. Multisynq handles all of that invisibly, allowing you to concentrate on what your app _does_.

# Models

Multisynq models are a little different from normal JavaScript classes. For one thing, instead of having a constructor, they have an [init()]{@link Model#init} method. `init` only executes the _very first time_ the model is instantiated within a brand new session. If you join a session that's already in progress, your model will be initialized from a snapshot instead.

```JS
class MyModel extends Multisynq.Model {
    init() {
        ...
    }
}
MyModel.register("MyModel");
```

Also, every Multisynq model class needs to have its static [register()]{@link Model.register} method called after it is defined. This registers the model class with Multisynq's internal class database so it can be properly retrieved when a snapshot is resumed.

The root model of your app (the one named in `Session.join()`) is instantiated automatically. If your application uses multiple models, you instantiate them by calling [create()]{@link Model.create} instead of `new`.

See {@link Model} for the full class documentation.

# Views

When {@link Session.join} creates the local root model and root view, it passes the view a reference to the model. This way the view can initialize itself to reflect whatever state the model may currently be in. Remember that when you join a session, your model might have been initalized by running its `init()` method, or it might have been loaded from an existing snapshot. Having direct access to the model allows the view to configure itself properly no matter how the model was initialized.

```JS
class MyView extends Multisynq.View {
    constructor(model) {
        super(model);
        ...
    }

    update(time) {
        ...
    }
}
```

This illustrates an important feature of Multisynq: **A view can read directly from a model at any time.** A view doesn't need to receive an event from a model to update itself. It can just pull whatever data it needs directly from the model whenever it wants. (Of course, a view must never _write_ directly to a model, because that would break synchronization.)

The root view's [update()]{@link View#update} method is called automatically for every animation frame (usually 60 times a second). This allows the view to continually refresh itself, which is useful for continuous animation (as opposed to updating only when an event is received). Internally this uses a callback via the browser's `requestAnimationFrame` function, and the callback timestamp is passed as `update(timestamp)`.

If your app uses hierarchical views, your root view's `update` method needs to call all other views' `update`.

See {@link View} for the full class documentation.

# Events

Even though views can read directly from models, the only way for a view to interact with a model is through events.

To send an event, call `publish()`:

    this.publish(scope, event, data)

* _Scope_ is a namespace so you can use the same event in different contexts.
* _Event_ is the name of the event itself.
* _Data_ is an optional data object containing addtional information.

And to receive an event, call `subscribe()`:

    this.subscribe(scope, event, this.handler)

* _Scope_ is a namespace so you can use the same event in different contexts.
* _Event_ is the name of the event itself.
* _Handler_ is the method that will be called when the event is published. (The handler accepts the data object as an argument.)

An event is routed automatically based on who publishes and who subscribes to it:

**_Input events_ ([published]{@link View#publish} by a view and [handled]{@link Model#subscribe} by a model) are sent to every replica of the model in your current session.**

By sending view-to-model events to each participant, Multisynq ensures that all replicas of the model stay in sync. All replicas of the model receive exactly the same stream of events in exactly the same order.

**_Output events_ ([published]{@link Model#publish} by a model and [handled]{@link View#subscribe} by a view) are generated by each replica simultaneously and do not require a network roundtrip. Typically they are queued and handled before each frame is rendered.**

This is to ensure a strict separation between model code execution and view code execution. The model code must be executed precisely the same for every user to stay in sync, no matter if there are views subscribed on that user's machine or not. All event handlers are executed before invoking `update()`.

**_Model events_ ([published]{@link Model#publish} by a model and [handled]{@link Model#subscribe} by a model) are generated and handled by each replica locally. They are not sent via the network. Event handlers are invoked synchronously during publish.**

This allows you to use pub/sub inside of your model, if that makes sense for your app. It is equivalent to calling another model's method directly.

**_View events_ ([published]{@link View#publish} by a view and [handled]{@link View#subscribe} by a view) are also generated and handled locally. They are not sent via the network. Typically they are queued and handled before each frame is rendered.**

Again, this allows you to use pub/sub inside your view. It is *not* a way to communicate between different clients, for that, both clients need to communicate with the shared model.

Both models and views can subscribe to the same event. This can be used to implement immediate user feedback: the local view can update itself by listening to the same input event it is sending via the reflector to the model, anticipating what will happen once the event comes back from the reflector. Care has to be taken to handle the case that another event arrives in the mean time.

There are also two special events that are generated by the system itself: ["view-join"]{@link event:view-join} and ["view-exit"]{@link event:view-exit}. These are broadcast whenever a user joins or leaves a session.

# Time

Models have no concept of real-world time. All they know about is **simulation time**, which is governed by the reflector.

Every event that passes through the reflector is timestamped. The simulation time in the model is advanced up to the last event it received. This allows different replicas of the model to stay in sync even if their local real-world clocks diverge.

Calling [this.now()]{@link Model#now} will return the current simulation time.

In addition to normal events, the reflector also sends out a regular stream of **heartbeat ticks**. Heartbeat ticks advance the model's simulation time even if no view is sending any events. By default the reflector sends out heartbeat ticks 20 times a second, but you can change the frequency at session start.

The method [future()]{@link Model#future} can be used to schedule an event in the future. For example, if you wanted to create an animation routine in a model that executes every 100 milliseconds of simulation time, it would look like this:

```JS
step() {
    // ... do some stuff ...
    this.future(100).step();
}
```

Note that the ticks-per-second rate of the reflector is independent of the future interval used by your models. Individual models may use different future times.

## Random

Multisynq guarantees that the same sequence of random numbers is generated in every replica of your application. If you call `Math.random()` within a model it will return the same number for all replicas.

Calls to `Math.random()` within a view will behave normally. Different instances will receive different random numbers.
