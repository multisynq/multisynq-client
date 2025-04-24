Copyright © 2025 Croquet Labs

This tutorial will teach you how to create multi-user shared animations and interactions. If you click one of the bouncing objects it will stop moving. Click again and it will start bouncing again. This tutorial isn't really that much more complex than the Hello World application. It just has a few more moving parts and really demonstrates how the model is used to compute a simulation and how the view is used to display it and interact with it.

<p class="codepen" data-height="512" data-theme-id="37190" data-default-tab="result" data-user="multisynq" data-slug-hash="qEErMbw" data-editable="true" style="height: 512px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;" data-pen-title="Simple Animation">
  <span>See the Pen <a href="https://codepen.io/multisynq/pen/qEErMbw/">
  Simple Animation</a> by Multisynq (<a href="https://codepen.io/multisynq">@multisynq</a>)
  on <a href="https://codepen.io">CodePen</a>.</span>
</p>
<script async src="https://static.codepen.io/assets/embed/ei.js"></script>


## **Try it out!**
The first thing to do is click or scan the QR code above. This will launch a new Codepen instance of this session. If you compare the two sessions, you will see that the animated simulations are identical. The balls all move and bounce exactly the same. You can stop and start any ball by clicking on it, which will start or stop it in every session. You can't stop the rounded rectangle - it is just like a regular ball but ignores user actions. Any reader of this documentation can start or stop the balls while they are animating. You may notice that this is happening. It just means there is someone else out there working with the tutorial at the same time as you.

There are three things we will learn here.

1. Creating a simulation model.
2. Creating an interactive view.
3. How to safely communicate between them.


## Simple Animation Model

Our application uses two Multisynq Model subclasses, MyModel and BallModel. Both these classes need to be registered with Multisynq.

In addition, this app makes use of [Multisynq.Constants]{@link Constants}.
Although models must not use global variables, global constants are fine.
To ensure that all users in a session use the same value of these constants, add them to the Multisynq.Constants object.
Multisynq.Constants is recursively frozen once a session has started, to avoid accidental modification.
Here we assign Multisynq.Constants into the variable Q as a shorthand.

```
const Q = Multisynq.Constants;
Q.BALL_NUM = 25;              // how many balls do we want?
Q.STEP_MS = 1000 / 30;        // bouncing ball tick interval in ms
Q.SPEED = 10;                 // max speed on a dimension, in units/s
```

MyModel is the root model, and is therefore what will be passed into [Multisynq.Session.join]{@link Session.join}.
In this app, MyModel also creates and stores the BallModel objects, holding them in the array MyModel.children.

A BallModel is the model for a shaped, colored, bouncing ball. The model itself has no direct say in the HTML that will be used to display the ball. For the shape, for example, the model records just a string - either `'circle'` or `'roundRect'` - that the view will use to generate a visual element that (by the workings of the app's CSS) will be displayed as the appropriate shape. The BallModel also initializes itself with a random color, position, and speed vector.

```this.subscribe(this.id, 'touch-me', this.startStop);```

The BallModel [subscribes]{@link Model#subscribe} to the `'touch-me'` event, to which it will respond by stopping or restarting its motion. Each BallModel object individually subscribes to this event type, but only for events that are published using the BallModel's own ID as scope. Each ball's dedicated BallView object keeps a record of its model's ID, for use when publishing the `'touch-me'` events in response to user touches.

```this.future(Q.STEP_MS).step();```

Having completed its initialization, the BallModel [schedules]{@link Model#future} the first invocation of its own `step()` method. This is the same pattern as seen in the previous tutorial; `step()` will continue the stepping by re-scheduling itself each time.

Worth noting here is that the step invocation applies just to one ball, with each BallModel taking care of its own update tick. That may seem like a lot of future messages for the system to handle (25 balls ticking at 30Hz will generate 750 messages per second) - but future messages are very efficient, involving little overhead beyond the basic method invocation.

```
BallModel.step() {
    if (this.alive) this.moveBounce();
    this.future(Q.STEP_MS).step();
}
```

If the `alive` flag is set, the `step()` function will call `moveBounce()`. In any case, `step()` schedules the next step, the appropriate number of milliseconds in the future.

```
BallModel.moveBounce() {
    const [x, y] = this.pos;
    if (x<=0 || x>=1000 || y<=0 || y>=1000)
        this.speed = this.randomSpeed();
    this.moveTo([x + this.speed[0], y + this.speed[1]]);
}
```

`BallModel.moveBounce()` has the job of updating the position of a ball object, including bouncing off container walls when necessary. It embodies a simple strategy: if the ball is found to be outside the container bounds, `moveBounce()` replaces the ball's speed with a new speed vector `BallModel.randomSpeed()`. Because the new speed is random, it might turn out to take the ball a little further out of bounds - but in that case the ball will just try again, with another random speed, on the next `moveBounce`.

```
randomSpeed() {
    const xs = this.random() * 2 - 1;
    const ys = this.random() * 2 - 1;
    const speedScale = Q.SPEED / (Math.sqrt(xs*xs + ys*ys));
    return [xs * speedScale, ys * speedScale];
}
```

The generation of new speed vectors is an example of our use of a replicated random-number generator. Every instance of this session will compute exactly the same sequence of random numbers. Therefore, when a ball bounces, every instance will come up with exactly the same new speed.

## Simple Animation View

Like the Model, the View in this app comprises two classes: MyView and BallView.

### MyView

MyView.constructor(model) will be called when an app session instance starts up. It is passed the MyModel object as an argument. The constructor's job is to build the visual representation of the model for this instance of the session. The root of that representation, in this app, is a "div" element that will serve as the balls' container.

```model.children.forEach(child => this.attachChild(child));```

The MyModel has children - the BallModel objects - for which MyView must also create a visual representation. It does so by accessing the model's children collection and creating a new view object for each child.

Note that although it is fine for the view to access the model directly here to read its state - in this case, the children - the view **MUST NOT** modify the model (or its child models) in any way.

```
MyView.attachChild(child) {
    this.element.appendChild(new BallView(child).element);
}
```

For each child BallModel a new BallView object is created. The BallView creates a document element to serve as the visual representation of the bouncing ball; the MyView object adds the element for each BallView as a child of its own element, the containing div.

MyView also listens for "resize" events from the browser, and uses them to set a suitable size for the view by setting its scale (which also sets the scale for the children - i.e., the balls). When there are multiple users watching multiple instances of this app on browser windows of different sizes, the rescaling ensures that everyone still sees the same overall scene.

```
MyView.detach() {
    super.detach();
    let child;
    while (child = this.element.firstChild) this.element.removeChild(child);
}
```

When a session instance is shut down (including the reversible shutdown that happens if a tab is hidden for ten seconds or more), its root view is destroyed.  If the instance is re-started, a completely new root view will be built.  Therefore, on shutdown, the root view is sent `detach` to give it the chance to clean up its resources.  MyView handles this by destroying all the child views that it has added to the `"animation"` `div` element during this session.

### BallView

The BallView tracks the associated BallModel.

BallView constructs a document element based on the type and color properties held by the BallModel, and sets the element's initial position using the model's pos property.

```this.subscribe(model.id, { event: 'pos-changed', handling: "oncePerFrame" }, this.move);```

The BallView subscribes to the 'pos-changed' event, which the BallModel publishes each time it updates the ball position. Like the 'touch-me' event, these events are sent in the scope of the individual BallModel's ID. No other ball's model or view will pay any attention to the events, which makes their distribution highly efficient. As a further efficiency consideration, the `handling: "oncePerFrame"` flag is used to ensure that even if multiple events for a given ball arrive within the same rendering frame, only one (the latest) will be passed to the subscribed handler.

```this.enableTouch();```

```
BallView.enableTouch() {
    const el = this.element;
    if (TOUCH) el.ontouchstart = start => {
        start.preventDefault();
        this.publish(el.id, 'touch-me');
    }; else el.onmousedown = start => {
        start.preventDefault();
        this.publish(el.id, 'touch-me');
    };
}
```
BallView.enableTouch sets up the BallView element to publish a 'touch-me' event when the element is clicked on.
The BallModel subscribes to the 'touch-me' event and toggles the ball motion on and off.
