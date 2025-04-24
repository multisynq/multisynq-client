_Copyright © 2025 Croquet Labs_

This tutorial will guide you through building a complete multiplayer game:

![Screencapture](images/multiblaster.gif)

[🕹️ CLICK HERE TO PLAY 🕹️](https://multisynq.github.io/multiblaster-tutorial/step9.html) – _then scan the QR code or share the generated session URL to invite other players._

Each HTML file in [this repository](https://github.com/multisynq/multiblaster-tutorial/)
contains an increasingly complete multiplayer game built using [Multisynq](https://multisynq.io).

It's a 2D game, and its visuals are intentionally kept simple so that the code is more understandable.

The game has asteroids and ships floating in space.
If an objects goes beyond the screen edge, it comes back in on the other side.
Players steer their ships by firing thrusters (left, right and forward).
They can also shoot blasts which cause asteroids to break up and vanish.
Successful blasts increase the player's score, while colliding with an asteroid
causes a ship to be destroyed and lose all points.

**📖 Please use our [Documentation](https://multisynq.io/docs/client/) alongside this tutorial, and join our [Discord](https://multisynq.io/discord) for questions 🤔**

## Step 0: Asteroids floating without Multisynq 🪨≠🪨

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step0.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step0.html))

This is a non-Multisynq app. It shows a few asteroids floating through space.
If you run this in two windows, the asteroids will float differently.

Each asteroid has an `x` and `y` position as well as an `a` angle.
Additionally, it has `dx`, `dy` and `da` properties which represent the
amount to change the position and angle in every time step to
animate the object in its `move()` method:

```js
move() {
    this.x = (this.x + this.dx + 1000) % 1000;
    this.y = (this.y + this.dy + 1000) % 1000;
    this.a = (this.a + this.da + Math.PI) % Math.PI;
    setTimeout(() => this.move(), 50);
}
```
The movement is restricted to the playfield's size (0 to 1000) using remainder math (the `%` operator).
This causes the asteroid to come back in on the other side when it floats out.

The playfield is a 1000⨉1000 canvas scaled to fit in the window.
Asteroids are drawn using plain white strokes in the `update()` function:

```js
for (const asteroid of asteroids) {
    const {x, y, a} = asteroid;
    context.save();
    context.translate(x, y);
    context.rotate(a);
    context.beginPath();
    context.moveTo(+40,  0);
    context.lineTo( 0, +40);
    context.lineTo(-40,  0);
    context.lineTo( 0, -40);
    context.closePath();
    context.stroke();
    context.restore();
}
```

This file has about 80 lines of code total.

## Step 1: Asteroids synchronized with Multisynq 🪨≡🪨

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step1.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step1.html))

This is the same app, but using a Multisynq Model for the asteroids.

A session name and password is automatically appended to the URL.
If you open that session URL in another window or on another device,
the asteroids will float exactly the same in both.

The app is devided into two parts: The "model" is the part that is synchronized
by Multisynq for all users. It is like a shared computer that all users directly
interact with. The other part is the "view", which displays the model to the user
by drawing the asteroids on a canvas. These parts are subclassed from
`Multisynq.Model` and `Multisynq.View`, respectively.

The last few lines instruct Multisynq to join a session for a particular model and view class
via `Multisynq.Session.join()`. The name and password for this session are taken from
the current URL, or generated automatically using `autoSession()` and `autoPassword`.
It also needs an API key. You should fetch your own key from [multisynq.io/coder](https://multisynq.io/coder/).

This version has only 20 lines more than the non-Multisynq one from step 0.

Notice that the computation looks exactly the same.
_No special data structures need to be used._
All models are synchronized between machines without any special markup.

```js
class Asteroid extends Multisynq.Model {

    ...

    move() {
        this.x = (this.x + this.dx + 1000) % 1000;
        this.y = (this.y + this.dy + 1000) % 1000;
        this.a = (this.a + this.da + Math.PI) % Math.PI;
        this.future(50).move();
    }

    ...

}
```

The only new construct is the line
```js
this.future(50).move();
```
inside of the `move()` method. This causes `move()` to be called again 50 ms in the future,
similarly to the `timeout()` call in step 0.
_Future messages are how you define an object's behavior over time in Multisynq._

Drawing happens exactly the same as in the non-Multisynq case:

```js
class Display extends Multisynq.View {

    ...

    update() {
        ...
        for (const asteroid of this.model.asteroids) {
            const { x, y, a, size } = asteroid;
            this.context.save();
            this.context.translate(x, y);
            this.context.rotate(a);
            this.context.beginPath();
            this.context.moveTo(+size,  0);
            this.context.lineTo( 0, +size);
            this.context.lineTo(-size,  0);
            this.context.lineTo( 0, -size);
            this.context.closePath();
            this.context.stroke();
            this.context.restore();
        }
    }
}
```

Notice that the view's `update()` method can read the asteroid positions directly from the model for drawing.
_Unlike in server-client computing, these positions do not need to be transmitted via the network._ They are already available locally.

However, you must take care to not accidentally modify any model properties directly,
because that would break the synchronization. See the next step for how to interact with the model.

## Step 2: Spaceships controlled by players 🕹️➡🚀

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step2.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step2.html))

This step adds interactive space ships.

For each player joining, another spaceship is created by subscribing to the session's
`view-join` and `view-exit` events:

```js
class Game extends Multisynq.Model {

    init() {
        ...
        this.ships = new Map();
        this.subscribe(this.sessionId, "view-join", this.viewJoined);
        this.subscribe(this.sessionId, "view-exit", this.viewExited);
    }

    viewJoined(viewId) {
        const ship = Ship.create({ viewId });
        this.ships.set(viewId, ship);
    }

    viewExited(viewId) {
        const ship = this.ships.get(viewId);
        this.ships.delete(viewId);
        ship.destroy();
    }

    ...
```
Each ship subscribes to that player's input only, using the player's `viewId` as an event scope.
This is how the shared model can distinguish events sent from different user's views:

```js
class Ship extends Multisynq.Model {

    init({ viewId }) {
        ...
        this.left = false;
        this.right = false;
        this.forward = false;
        this.subscribe(viewId, "left-thruster", this.leftThruster);
        this.subscribe(viewId, "right-thruster", this.rightThruster);
        this.subscribe(viewId, "forward-thruster", this.forwardThruster);
        this.move();
    }

    leftThruster(active) {
        this.left = active;
    }

    rightThruster(active) {
        this.right = active;
    }

    forwardThruster(active) {
        this.forward = active;
    }

    ...
```

The ship's `move()` method uses the stored thruster values to accelerate or rotate the ship:

```js
move() {
    if (this.forward) this.accelerate(0.5);
    if (this.left) this.a -= 0.2;
    if (this.right) this.a += 0.2;
    this.x = ...
    this.y = ...
```

Again, the ship's new rotation `a` and position `x,y` _do not need to be published to other players._ This computation happens synchronized on each player's machine, based on the `left`, `right`, and `forward` properties that were set via the following thruster events.

In the local view, key up and down events of the arrow keys publish the events to enable and disable the thrusters:

```js
document.onkeydown = (e) => {
    if (e.repeat) return;
    switch (e.key) {
        case "ArrowLeft":  this.publish(this.viewId, "left-thruster", true); break;
        case "ArrowRight": this.publish(this.viewId, "right-thruster", true); break;
        case "ArrowUp":    this.publish(this.viewId, "forward-thruster", true); break;
    }
};
document.onkeyup = (e) => {
    if (e.repeat) return;
    switch (e.key) {
        case "ArrowLeft":  this.publish(this.viewId, "left-thruster", false); break;
        case "ArrowRight": this.publish(this.viewId, "right-thruster", false); break;
        case "ArrowUp":    this.publish(this.viewId, "forward-thruster", false); break;
    }
};
```

In Multisynq, publish and subscribe are used mainly to communicate events from the user's view to the shared model,
typically derived from user input. Unlike in other pub/sub systems you may be familiar with,
Multisynq's pub/sub is not used to synchronize changed values or to communicate between different devices.
All communication is only between the local view and the shared model.

Before joining the session, `makeWidgetDock()` enables a QR code widget in the lower left corner.
This allows you to join the same session not only by copying the session URL but also by scanning
this code with a mobile device.

## Step 3: Firing a blaster 🕹️➡•••

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step3.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step3.html))

When pressing the space bar, a `"fire-blaster"` event is published.
The ship subscribes to that event and creates a new blast that
moves in the direction of the ship:

```js
fireBlaster() {
    const dx = Math.cos(this.a) * 20;
    const dy = Math.sin(this.a) * 20;
    const x = this.x + dx;
    const y = this.y + dy;
    Blast.create({ x, y, dx, dy });
}
```

The blast registers itself with the game object when created,
and removes itself when destroyed. This is accomplished by
accessing the `Game` as the well-known `modelRoot`.

```js
get game() { return this.wellKnownModel("modelRoot"); }
```

The blast destroys itself after a while
by counting its `t` property up in every move step:

```js
move() {
    this.t++;
    if (this.t > 30) {
        this.destroy();
        return;
    }
    ...
}
```

## Step 4: Break up asteroids when hit by blasts 🪨➡💥

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step4.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step4.html))

In this step we add collision detection between the blasts and the asteroids.
When hit, Asteroids split into two smaller chunks, or are destroyed completely.

To make this simpler, the individual future messages are now replaced by a single `mainLoop()`
method which calls all `move()` methods and then checks for collisions:

```js
mainLoop() {
    for (const ship of this.ships.values()) ship.move();
    for (const asteroid of this.asteroids) asteroid.move();
    for (const blast of this.blasts) blast.move();
    this.checkCollisions();
    this.future(50).mainLoop();
}

checkCollisions() {
    for (const asteroid of this.asteroids) {
        const minx = asteroid.x - asteroid.size;
        const maxx = asteroid.x + asteroid.size;
        const miny = asteroid.y - asteroid.size;
        const maxy = asteroid.y + asteroid.size;
        for (const blast of this.blasts) {
            if (blast.x > minx && blast.x < maxx && blast.y > miny && blast.y < maxy) {
                asteroid.hitBy(blast);
                break;
            }
        }
    }
}
```

When an asteroid was hit by a blast, it shrinks itself and changes direction perpendicular to the shot.
Also it creates another asteroid that goes into the opposite direction. This makes it appear as if
the asteroid broke into two pieces:

```js
hitBy(blast) {
    if (this.size > 20) {
        this.size *= 0.7;
        this.da *= 1.5;
        this.dx = -blast.dy * 10 / this.size;
        this.dy = blast.dx * 10 / this.size;
        Asteroid.create({ size: this.size, x: this.x, y: this.y, a: this.a, dx: -this.dx, dy: -this.dy, da: this.da });
    } else {
        this.destroy();
    }
    blast.destroy();
}
```

The remarkable thing about this code is how unremarkable it is.
There is nothing "fancy" required of the programmer, it reads almost the same as if it were a single-player game.
And there is no network congestion even if hundreds of blasts are moving because their positions are never sent over the network.

## Step 5: Turn ship into debris after colliding with asteroids 🚀➡💥

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step5.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step5.html))

Now we add collision between ships and asteroids, and turn both into debris which is floating for a while.

We do this by adding a `wasHit` property that normally is `0`, but gets set to `1` when hit.
It then starts counting up for each `move()` step just like the `t` property in the blast,
and after a certain number of steps destroys the asteroid and resets the ship:

```js
move() {
    if (this.wasHit) {
        // keep drifting as debris for 3 seconds
        if (++this.wasHit > 60) this.reset();
    } else {
        // process thruster controls
        if (this.forward) this.accelerate(0.5);
        if (this.left) this.a -= 0.2;
        if (this.right) this.a += 0.2;
    }
    ...
}
```

Also, while the ship's `wasHit` is non-zero, its `move()` method ignores the thruster controls,
and the blaster cannot be fired. This forces the player to wait until the ship is reset to the
center of the screen.

The drawing code in the view's `update()` takes the `wasHit` property to show an exploded
version of the asteroid or ship. Since `wasHit` is incremented in every move step,
it determines the distance of each line segment to its original location:

```js
if (!wasHit) {
    this.context.moveTo(+20,   0);
    this.context.lineTo(-20, +10);
    this.context.lineTo(-20, -10);
    this.context.closePath();
} else {
    const t = wasHit;
    this.context.moveTo(+20 + t,   0 + t);
    this.context.lineTo(-20 + t, +10 + t);
    this.context.moveTo(-20 - t * 1.4, +10);
    this.context.lineTo(-20 - t * 1.4, -10);
    this.context.moveTo(-20 + t, -10 - t);
    this.context.lineTo(+20 + t,   0 - t);
}
```

## Step 6: Score points when hitting an asteroid with a blast 💥➡🏆

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step6.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step6.html))

Add scoring for ships hitting an asteroid.
When a blast is fired, we store a reference to the ship in the blast.

```js
fireBlaster() {
    ...
    Blast.create({ x, y, dx, dy, ship: this });
}
```

When the blast hits an asteroid, the ship's `scored()` method is called, which increments its `score`:

```js
hitBy(blast) {
    blast.ship.scored();
    ...
}
```

The `update()` method displays each ship's score next to the ship.
Also, to better distinguish our own ship, we draw it filled.
We find our own ship by comparing its `viewId` to the local `viewId`:

```js
update() {
    ...
    this.context.fillText(score, 30 - wasHit * 2, 0);
    ...
    if (viewId === this.viewId) this.context.fill();
    ...
}
```

## Step 7: View-side animation smoothing 🤩

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step7.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step7.html))

Now we add render smoothing for 60 fps animation.
The models move at 20 fps (because of the 50 ms future send
in the main loop) but for smooth animation you typically want to animate at a higher fps.
While we could increase the model update rate, that would make the timing depend very much
on the steadiness of ticks from the reflector.
Instead, we do automatic in-betweening in the view by decoupling the rendering position from the
model position, and updating the render position "smoothly."

The view-side objects with the current rendering position and angle are held in a weak map:
```js
this.smoothing = new WeakMap();
```

It maps from the model objects (asteroids, ships, blasts) to plain JS objects
like `{x, y, a}` that are then used for rendering. Alternatively, we could create
individual View classes for each Model class by subclassing `Multisynq.View`,
but for this simple game that seems unnecessary. With the `WeakMap` approach
we avoid having to track creation and destruction of model objects.

The initial values of the view-side objects are copied from the model objects.
In each step, the difference between the model value and view value is calculated.
If the difference is too large, it means the model object jumped to a new position
(e.g. when the ship is reset), and we snap the view object to that new position.
Otherwise, we smoothly interpolate from the previous view position to the current
model position. The "smooth" factor of `0.3` can be tweaked. It works well for a
20 fps simulation with 60 fps rendering, but works pretty well in other cases too:

```js
smoothPos(obj) {
    if (!this.smoothing.has(obj)) {
        this.smoothing.set(obj, { x: obj.x, y: obj.y, a: obj.a });
    }
    const smoothed = this.smoothing.get(obj);
    const dx = obj.x - smoothed.x;
    const dy = obj.y - smoothed.y;
    // if distance is large, don't smooth but jump to new position
    if (Math.abs(dx) < 50) smoothed.x += dx * 0.3; else smoothed.x = obj.x;
    if (Math.abs(dy) < 50) smoothed.y += dy * 0.3; else smoothed.y = obj.y;
    return smoothed;
}
```

The rendering in the `update()` method uses the smoothed `x`, `y` and `a` values
and fetches other properties directly from the model objects:

```js
    for (const asteroid of this.model.asteroids) {
        const { x, y, a } = this.smoothPosAndAngle(asteroid);
        const { size } = asteroid;
        ...
    }
```

This step uses the exact same model code as in step 7, so you can actually run
both side-by-side with the same session name and password to see the difference
in animation quality.

## Step 8: Persistent table of highscores 🥇🥈🥉

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step8.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step8.html))

Now we add a persistent highscore. Multisynq automatically snapshots the model data and
keeps that session state even when everyone leaves the session. When you resume it later by joining the session, everything will continue just as before. That means a highscore table in the model would appear to be "persistent".

However, whenever we change the model code, a new session is created, even it has the
same name (internally, Multisynq takes a hash of the registered model class source code).
The old session state becomes inaccessible, because for one we cannot know if the
new code will work with the old state, but more importantly, every client in the session
needs to execute exactly the same code to ensure determinism. Otherwise, different clients
would compute different states, and the session would diverge.

To keep important data from a previous session of the same name, we need to use Multisynq's
explicit persistence. An app can call `persistSession()` with some JSON data to store
that persistent state. When a new session is started (no snapshot exists) but there is
some persisted data from the previous session of the same name, this will be passed
into the root model's `init()` method as a second argument.

We add a text input field for players' initials (or an emoji).
Its value is both published to the model, and kept in `localStorage` for the view,
so players only have to type it once.

```js
initials.onchange = () => {
    localStorage.setItem("io.multisynq.multiblaster.initials", initials.value);
    this.publish(this.viewId, "set-initials", initials.value);
}
```

On startup we check `localStorage` to automatically re-use the stored initials.

```js
if (localStorage.getItem("io.multisynq.multiblaster.initials")) {
    initials.value = localStorage.getItem("io.multisynq.multiblaster.initials");
    this.publish(this.viewId, "set-initials", initials.value);
}
```

In the model, we add a highscore table. It is initialized from previously persisted
state, or set to an empty object:

```js
init(_, persisted) {
    this.highscores = persisted?.highscores ?? {};
    ...
}
```

When a player sets their initials, we ensure that no two ships have the same
initials. Also, if a player renames themselves, we rename their table entry
(you could use different strategies here, depending on what makes most sense
for your game):

```js
setInitials(initials) {
    if (!initials) return;
    for (const ship of this.game.ships.values()) {
        if (ship.initials === initials) return;
    }
    const highscore = this.game.highscores[this.initials];
    if (highscore !== undefined) delete this.game.highscores[this.initials];
    this.initials = initials;
    this.game.setHighscore(this.initials, Math.max(this.score, highscore || 0));
}
```

When a ship scores and has initials, it will add that to the highscore:

```js
scored() {
    this.score++;
    if (this.initials) this.game.setHighscore(this.initials, this.score);
}
```

The table is only updated if the new score is above the highscore.
And if the table was modified, then we call `persistSession()` with a
JSON oject. This is the object that will be passed into `init()` of the next
session (but never the same session, because the same session starts
from a snapshot and does not call `init()` ever again):

```js
setHighscore(initials, score) {
    if (this.highscores[initials] >= score) return;
    this.highscores[initials] = score;
    this.persistSession({ highscores: this.highscores });
}
```

In a more complex application, you should design the JSON persistence
format carefully, e.g. by including a version number so that future code
versions can correctly interpret the data written by an older version.
Multisynq makes no assumptions about this, it only stores and retrieves
that data.

From this point on, even when you change the model code, the highscores
will always be there.

## Step 9: Support for mobile etc. 📱

([full source code](https://github.com/multisynq/multiblaster-tutorial/blob/main/step9.html))
([run it](https://multisynq.github.io/multiblaster-tutorial/step9.html))

This is the finished tutorial game. It has some more features, like
* support for mobile devices via touch input
* ASDW keys in addition to arrow keys
* visible thrusters
* "wrapped" drawing so that objects are half-visible on both sides when crossing the screen edge
* prevents ships getting destroyed by an asteroid in the spawn position
* etc.

We're not going to go into much detail here because all of these are independent
of Multisynq, it's more about playability and web UX.

One cute thing is the "wrapped rendering". If an object is very close to the edge
of the screen, its other "half" should be visible on the other side to maintain
illusion of a continuous space world. That means it needs to be drawn twice
(or even 4 times if it is in a corner):

```js
drawWrapped(x, y, size, draw) {
    const drawIt = (x, y) => {
        this.context.save();
        this.context.translate(x, y);
        draw();
        this.context.restore();
    }
    drawIt(x, y);
    // draw again on opposite sides if object is near edge
    if (x - size < 0) drawIt(x + 1000, y);
    if (x + size > 1000) drawIt(x - 1000, y);
    if (y - size < 0) drawIt(x, y + 1000);
    if (y + size > 1000) drawIt(x, y - 1000);
    if (x - size < 0 && y - size < 0) drawIt(x + 1000, y + 1000);
    if (x + size > 1000 && y + size > 1000) drawIt(x - 1000, y - 1000);
    if (x - size < 0 && y + size > 1000) drawIt(x + 1000, y - 1000);
    if (x + size > 1000 && y - size < 0) drawIt(x - 1000, y + 1000);
}
```

## Advanced Game 🚀💋

There's an even more polished game with some gimmicks at
[github.com/multisynq/multiblaster](https://github.com/multisynq/multiblaster/).

One of its gimmicks is that if the initials contain an emoji, it will be used for shooting. The trickiest part of that is properly parsing out the emoji, which can be composed of many code points 😉

You can play it online at [apps.multisynq.io/multiblaster](https://apps.multisynq.io/multiblaster/).

## Further Information 👀

Please use our [Documentation](https://multisynq.io/docs/client/) alongside this tutorial, and join our [Discord](https://multisynq.io/discord) for questions!
