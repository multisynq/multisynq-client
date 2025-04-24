Copyright © 2025 Croquet Labs

Multisynq makes no assumptions about how you implement the view. It operates like a normal JS application. You can directly access the DOM and instantiate whatever sub-objects or data types that you need, use any libraries etc.

The contents of the view are not replicated across machines. Because of this, you generally use the view only for handling input and output. If the user taps a button or clicks somewhere on screen, the view turns this action into an event that it publishes for the model to receive. And whenever the model changes, the view updates the visual representation that it displays on the screen. But in general, all of the actual calculation of the application should be done inside the model.

In order to update output quickly, the view has a reference to the model and can _read_ from it directly. However …

## **The view must NEVER write directly to the model!**

This is the **most important** rule of creating a stable Multisynq application. The view is given direct access to the model for efficiency, but in order for the local copy of the model to stay in synch with the remote copies of other users, _all changes to the model that originate in the view must be done through **events**_. That way they will be mirrored by the synchronizer to every user in the session.

### Other good practices for writing views:

**Create sub-views inside your main view.** You can derive other classes from the {@link View} base class and instantiate them during execution. Sub-views have access to all the same services as your main view, so they can schedule their own tick operations and publish and subscribe to events.

**Access the model through your main view.** Your main view receives a permanent reference to the main model when it is created. This reference can be stored and used to read directly from the model.

**Use the `future()` operator to create ticks.** If you want something to happen regularly in the view, use the future operator to schedule a looping tick. This is just for readability, you're free to use `setTimeout` or `setInterval` etc. in view code.

**Don't reply to the model.** Avoid having the model send an event to the view that requires the view to send a "reply" event back. This will result in large cascades of events that will choke off normal execution.

**Anticipate the model for immediate feedback.** Latency in Multisynq is low, but it's not zero. If you want your application to feel extremely responsive (for example, if the player is controlling a first-person avatar) drive the output directly from the input, then correct the output when you get the official simulation state from the updated model.
