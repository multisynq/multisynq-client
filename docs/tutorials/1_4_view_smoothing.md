Copyright © 2025 Croquet Labs

This is an example of how to smooth the view so that objects move continually even if the model only updates intermittently. It's also is a good technique to use if you want your application to cleanly handle hitches in connectivity over a poor internet connection.

<p class="codepen" data-height="512" data-theme-id="37190" data-default-tab="result" data-user="multisynq" data-slug-hash="gbbmdqR" data-editable="true" style="height: 512px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;" data-pen-title="Chat">
  <span>See the Pen <a href="https://codepen.io/multisynq/pen/gbbmdqR">
  Chat</a> by Multisynq (<a href="https://codepen.io/multisynq">@multisynq</a>)
  on <a href="https://codepen.io">CodePen</a>.</span>
</p>
<script async src="https://static.codepen.io/assets/embed/ei.js"></script>

## **Try it out!**
The first thing to do is click or scan the QR code above. This will launch a new CodePen instance of this session. You'll see several moving colored dots. There is one dot for each device currently connected to the session. Some dots may even belong to other Multisynq developers who are also reading this documentation right now.

You can tell your dot where to go by clicking or tapping the screen.

<b>The unsmoothed position of your dot is shown in gray.</b> Note how it jumps forward every time the model performs an update. The view uses this information to calculate each dot's smoothed position. (For clarity, we're only showing the unsmoothed position of <i>your</i> dot. All other dots are drawn at their smoothed positions.)

In this example, the model is only updating <b>twice per second.</b> Nevertheless the dots move smoothly at 60 frames per second because the view is interpolating their position between model updates.

There are five things we will learn here:

1. How to define global constants.
2. How to safely share code between model and view.
3. Using `"oncePerFrame"` to limit view updates.
4. How to handle infrequent model updates.
5. How to set the rate of heartbeat ticks coming from the reflector.

## Global Constants

Sometimes it's useful to declare a global constant that you can use throughout your code. However, any constants used by the model should also be included in the [code hash]{@link Session.join}, to make sure the model stays synchronized. If they are included in the hash, changing the constants will create a new session. If the constants are not included in the hash, you might end up in the same session with older code and different constant values, which would lead to desynchronization.

```
const Q = Multisynq.Constants;
Q.TICK_MS = 500;    // milliseconds per actor tick
Q.SPEED = 0.15;     // dot movment speed in pixels per millisecond
Q.CLOSE = 0.1;      // minimum distance in pixels to a new destination
Q.SMOOTH = 0.05;    // weighting between old and new positions. 0 > SMOOTH >= 1
```

<b>Multisynq provides a data object called [Multisynq.Constants]{@link Constants} that can be used to store constants.</b> The value of this object will contribute to the hash used to generate a session ID. To make your code easier to read, we recommend defining a short alias—in this case `Q`—to refer to `Multisynq.Constants`.

## Pure Functions

Sometimes it's useful to have a common set of utility functions that you can call from both the model and the view. For example, in this tutorial we have a common set of 2-D vector operations. These functions do things like adding two vectors together, or multiplying a vector by scale factor, or finding a vector's magnitude.

```
...

function add(a,b) {
    return { x: (a.x + b.x), y: (a.y + b.y) };
}

function subtract(a,b) {
    return { x: (a.x - b.x), y: (a.y - b.y) };
}

...
```
 <b>As long as a function is <i>purely functional</i> you're free to call it from both the model and the view.</b> A pure function doesn't read any parameters other than the ones passed to it, doesn't modify these parameters in any way, and doesn't save any state outside the scope of its own execution.

 Note that the code of these functions is not included in the session ID hash—Multisynq doesn't know about them. That's not a problem typically if you don't change them frequently. Just be aware that two versions of your code that don't differ in the model classes but differ in the functions used by the model will end up in the same session. If those functions produce different results, the old and new session instances will likely not synchronize correctly.

## RootModel & RootView

The root classes for model and view are fairly simple, and their functionality has largely been  covered in earlier tutorials. When a new user joins a session, `RootModel` spawns an `Actor` to control the movement of their dot. The new `Actor` sends an event to `RootView` telling it to spawn a corresponding `Pawn`.

The same process happens in reverse when a user exits. `RootModel` removes that user's `Actor`, and the `Actor` sends an event to `RootView` telling it to remove the corresponding `Pawn`.

Note, however, this line in the constructor for `RootView`:

```
model.actors.forEach(actor => this.addPawn(actor));
```
When the view starts up, it checks to see if there are already any active actors in the model, and if there are, it spawns pawns for them. We need to do this because the view may be joining a session that's already in progress, or restoring from a saved snapshot. <b>During initialization, the view should never make any assumptions about the current state of the model.</b> It should always read the state of the model and build itself accordingly.


 ## Actor.goto(goal)

Whenever the user generates an `onclick` event, `RootView` sends the position clicked to the actor as its new destintion.

 ```
goto(goal) {
    this.goal = goal;
    const delta = subtract(goal, this.position);
    if (magnitude(delta) < Q.CLOSE) {
        this.goto(randomPosition());
    } else {
        const unit = normalize(delta);
        this.velocity = scale(unit, Q.SPEED);
    }
}
```
`goto` calculates a vector that points from the actor's current position to its new goal. If the length of this vector is shorter than the constant `Q.CLOSE` it means that we're already at the goal, and we randomly pick a new one.

If the goal isn't too close, then we calculate the velocity vector that will move us from our current position to our destination.

 ## Actor.arrived()

```
arrived() {
    const delta = subtract(this.goal, this.position);
    return (dotProduct(this.velocity, delta) <= 0);
}
```
Each time the actor moves, it steps forward a fixed distance. This means we'll usually overshoot our goal instead of landing right on it. So, to determine if we've arrived, we don't check to see if our position equals our goal. Instead we check to see if the vector pointing from our position toward our goal has reversed direction.

(The dot product of two vectors pointing in opposite directions is negative.)

 ## Actor.tick()

```
tick() {
    this.position = add(this.position, scale(this.velocity, Q.TICK_MS));
    if (this.arrived()) this.goto(this.randomPosition());
    this.publish(this.id, "moved", this.now());
    this.future(Q.TICK_MS).tick();
}
```
On every tick we move the actor forward by an amount equal to its velocity vector times the duration of the tick. If we've arrived, we pick a new destination. And we tell the view that this actor has moved.

## Pawn.constructor(model)
```
constructor(actor) {
    super(actor);
    this.actor = actor;
    this.position = {...actor.position};
    this.actorMoved();
    this.subscribe(actor.id, {event: "moved", handling: "oncePerFrame"}, this.actorMoved);
}
```
When `RootView` spawns a pawn, it passes a reference to the pawns's actor. The actor's ID is used as scope in a subscription make sure the pawn only receives that actor's events. The pawn copies its initial position from the actor, and calls `actorMoved` to timestamp the position information.

`"oncePerFrame"` is a special option for how this subscription handles events (see [View.subscribe]{@link View#subscribe}). By default every single event is passed through the subscription. <b>But when `"oncePerFrame"` is turned on, only the last event of this type during the previous frame is passed to the view.</b> Prior events are discarded.

This can be useful when the model is running at high speed to clear out a backlog. The model may generate a large number of `moved` events in a single frame, and since the view really only cares about the last one, there's no reason to process the others.


## Pawn.actorMoved()

```
actorMoved() {
    this.lastMoved = viewTime;
}
```
This is called when the actor sends a `"moved"` event. All it does is save the timestamp of the current frame. This way when we want to extrapolate the position of the dot, we know what in what frame the model's position was last updated.

## Pawn.update()

 ```
update() {

    if (this.actor.viewId === this.viewId) {
        this.draw(this.actor.goal, null, this.actor.color);
        this.draw(this.actor.position, "lightgrey");
    }

    const delta = scale(this.actor.velocity, viewTime - this.lastMoved);
    const extrapolation = add(this.actor.position, delta);
    this.position = lerp(this.position, extrapolation, Q.SMOOTH);
    this.draw(this.position, this.actor.color);
}
```

This is called once for each pawn during the `RootView` update.

<b>The first part is special-case code that only runs for our own pawn</b>—the pawn that was spawned when we joined the session. The pawn knows it belongs to us because its actor has a stored `viewId` that matches the pawn's `viewId`. Every other pawn will have the same `viewId` (because it's running locally in our view) but a different `actor.viewId` (because it was spawned by a different view).

The special-case code draws the actor's goal as a colored ring, and the actor's raw position as a light gray circle.

<b>The second part of this method does the actual smoothing.</b> It takes the actor's last known position and projects it forward using its last known velocity. It then performs an interpolation between the current pawn position and the newly calculated one.

The reason we interpolate here is because sometimes the actor changes state in ways that the pawn can't predict. For example, if the actor reverse direction, by the time the pawn finds out, it will have already have moved several frames in the wrong direction. If we don't interpolate, the pawn will instantly "pop" to the right position to catch up.

`Q.SMOOTH` is a value between 0 and 1 that controls this interpolation. If it's set to 1, there won't be any interpolation at all. The dot will instantly pop to its current projection of the of the pawn's position. The lower the value of `Q.SMOOTH` the more "mushy" the pawn's movement becomes. It will move more smoothly, but also won't track the model as closely. (And if you set `Q.SMOOTH` to 0, the dot won't move at all!)

The "right" value for `Q.SMOOTH` depends on many factors: how fast the actor is ticking, the actor's movement speed, the current latency to the reflector, and the level of responsiveness you need in your pawns. <b>A good rule of thumb is to tune `Q.SMOOTH` so the pawn spends about half its time behind the actor's position and half ahead.</b>

## Setting the reflector heartbeat tick

When the reflector doesn't have any normal events to send, it sends silent heartbeat ticks. This allows the model to keep running even if it's not receiving input from any users. These ticks don't consume much bandwidth, but they do consume some, so it can be useful to lower the tick rate to match the needs of your application.

The option `tps` in [`Session.join`]{@link Session.join} is used to set the tick rate (a.k.a. "ticks per second").

```
Multisynq.Session.join({
  apiKey: "your_api_key",               // paste from multisynq.io/coder
  appId: "io.codepen.multisynq.smooth",
  name: "public",
  password: "none",
  model: RootModel,
  view: RootView,
  tps: 1000/Q.TICK_MS,
});
```

In this tutorial `Q.TICK_MS` is 500, so the reflector will generate a tick when no message from any user arrived in the last 500 milliseconds. This means it will send out heartbeat ticks twice a second at most (we could have written `tps: 2` instead of `tps: 1000/Q.TICK_MS`). In general, you should set the heartbeat rate to match the internal tick rate of your model. If your model is only changing 10 times a second, there's no point in having a faster heartbeat tick than `tps: 10`.

The default setting for `tps` is 20 times per second, but the value can be set to any integer value between `1` and `60`.

<b>Note: Increasing the heartbeat tick rate will NOT make your Multisynq app more responsive.</b> User input events from the view to the model are sent as soon as they are generated, and processed as soon as they are received. If you're sending control inputs 60 times per second, your model will respond to them 60 times per second. Heartbeat ticks only affect the update frequency of the model when it's not receiving any other events.
