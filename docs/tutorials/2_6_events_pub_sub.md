Copyright © 2025 Croquet Labs

Models and Views communicate using events. They use the same syntax for sending and receiving events. These functions are only available to classes that are derived from {@link Model} or {@link View}, so exposing them is one reason to define sub-models and sub-views.

- `publish(scope, event, data)`
- `subscribe(scope, event, this.handler)`
- `unsubscribe(scope, event)`
- `unsubscribeAll()`

**Publish** sends an event to all models and views that have subscribed to it.

- _Scope_ is a namespace so you can use the same event in different contexts (String).
- _Event_ is the name of the event itself (String).
- _Data_ is an optional argument containing additional information (any serializable type).

**Subscribe** registers a model or a view to receive the specified events.

- _handler_ is a function that accepts the event data structure as its argument.
- in a view, the handler can be any function
- in a model, the handler *must* use the form `this.someMethodName`.<br>
  That's because functions cannot be serialized so actually only `"someMethodName"` is extracted from the function and stored.

**Unsubscribe** unregisters the model or view so it will no longer receive the event.

**UnsubscribeAll** unregisters all current subscriptions. Called automatically when you `destroy` a model or a view.

## Scopes

_TODO: ... mention `model.id`, global scopes (`sessionId`, `viewId`) ..._

## Event Handling

Depending on where the event originates and which objects are subscribed to it, the events are routed differently:

- _Model-to-Model_ - The event handler is executed immediately, before the publish call returns.

- _Model-to-View_ - By default, the event is queued and will be handled by the local view when the current model simulation has finished.

- _View-to-View_ - By default, the event is queued and will be handled in the same update cycle.

- _View-to-Model_ - The event is transmitted to the reflector and mirrored to all users. It will be handled during the next model simulation.

Note that multiple models and views can subscribe to the same event. Multisynq will take care of routing the event to each subscriber using the appropriate route, meaning that a view subscriber and a model subscriber will receive the event at slightly different times.

## Best practices

Publish and subscribe can be used to establish a direct communications channel between different parts of the model and the view. For example, suppose you have several hundred AI agents that are running independently in the model, and each one has a graphical representation in the view. If you call publish and subscribe using the agent's id as the scope, an event from a particular actor will only be delivered to its corresponding representation and vice versa.

Avoid creating chains of events that run from the model to the view then back to the model. View events can be triggered by the user, or by a timer, or by some other external source, but they should never be triggered by the model. Doing so can trigger a large cascade of events that will choke the system.
