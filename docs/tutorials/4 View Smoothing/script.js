// Multisynq Tutorial 4
// View Smoothing
// Croquet Labs (C) 2025

// -- Constants --
const Q = Multisynq.Constants;
Q.TICK_MS = 500;    // milliseconds per actor tick
Q.SPEED = 0.15;     // dot movment speed in pixels per millisecond
Q.CLOSE = 0.1;      // minimum distance in pixels to a new destination
Q.SMOOTH = 0.05;    // weighting between extrapolated and current positions. 0 > SMOOTH >= 1

// -- Vector Functions --
//
// Because these functions don't save any state, they can be safely used by both the model and the view.

function add(a,b) {
    return { x: (a.x + b.x), y: (a.y + b.y) };
}

function subtract(a,b) {
    return { x: (a.x - b.x), y: (a.y - b.y) };
}

function scale(v,s) {
    return {x: v.x * s, y: v.y * s};
}

function dotProduct(a, b) {
    return a.x * b.x + a.y * b.y;
}

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v) {
    const m = magnitude(v);
    return {
        x: v.x/m,
        y: v.y/m
    };
}

function lerp(a, b, f = 0.5) {
    return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
    };
}

// -- RootModel --
//
// The root model handles join and exit events. All the real work occurs in the individual actors.

class RootModel extends Multisynq.Model {
    init() {
        this.actors = new Map();
        this.actorColors = new Map();
        this.subscribe(this.sessionId, "view-join", this.viewJoin);
        this.subscribe(this.sessionId, "view-exit", this.viewDrop);
        this.hue = 0;
    }

    viewJoin(viewId) {
        let actorColor = this.actorColors.get(viewId);
        if (!actorColor) {
            actorColor = `hsl(${this.hue += 137.5}, 100%, 50%)`;
            this.actorColors.set(viewId, actorColor);
        }
        const actor = Actor.create(viewId);
        actor.color = actorColor;
        this.actors.set(viewId, actor);
        this.publish("actor", "join", actor);
    }

    viewDrop(viewId) {
        const actor = this.actors.get(viewId);
        this.actors.delete(viewId);
        actor.destroy();
        this.publish("actor", "exit", actor);
    }
}
RootModel.register("RootModel");

// -- Actor --
//
// Each ball is represented by an actor in the model. Every tick the actor moves toward its goal. If
// if receives a 'goto' message from the view, it will change its destination.

class Actor extends Multisynq.Model {
    init(viewId) {
        this.viewId = viewId;
        this.position = this.randomPosition();
        this.goal = {...this.position};
        this.velocity = {x: 0, y: 0};
        this.future(Q.TICK_MS).tick();
        this.subscribe(viewId, "goto", this.goto);
    }

    randomPosition() {
        return { x: this.random() * 500, y: this.random() * 500 };
    }

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

    arrived() {
        const delta = subtract(this.goal, this.position);
        return (dotProduct(this.velocity, delta) <= 0);
    }

    tick() {
        this.position = add(this.position, scale(this.velocity,Q.TICK_MS));
        if (this.arrived()) this.goto(this.randomPosition());
        this.publish(this.id, "moved", this.now());
        this.future(Q.TICK_MS).tick();
    }

}
Actor.register("Actor");

// -- View Globals --

const canvas = document.querySelector("#canvas");
const cc = canvas.getContext('2d');
let viewTime = 0;  // The last time the view was updated is saved globally so pawns can use it.

// -- RootView --
//
// The root view handles clicks and join and exit events. Every update it tells all the pawns
// to draw themselves.

class RootView extends Multisynq.View {

    constructor(model) {
        super(model);
        this.pawns = new Map();
        model.actors.forEach(actor => this.addPawn(actor));

        this.subscribe("actor", "join", this.addPawn);
        this.subscribe("actor", "exit", this.removePawn);

        canvas.onclick = e => this.onClick(e);
    }

    onClick(e) {
        const r = canvas.getBoundingClientRect();
        const scale = canvas.width / Math.min(r.width, r.height);
        const x = (e.clientX - r.left) * scale;
        const y = (e.clientY - r.top) * scale;
        this.publish(this.viewId, "goto", {x,y});
    }

    addPawn(actor) {
        const pawn = new Pawn(actor);
        this.pawns.set(actor, pawn);
    }

    removePawn(actor) {
        const pawn = this.pawns.get(actor);
        if (!pawn) return;
        pawn.detach();
        this.pawns.delete(actor);
    }

    update(time) {
        // if this is the first update in a while, jump all pawns' times
        // so they don't generate huge movement deltas
        if (time - viewTime > 1000) {
            for (const pawn of this.pawns.values()) pawn.lastMoved = time;
        }
        // make frame time accessible in event handlers
        viewTime = time;
        cc.strokeStyle = "black";
        cc.clearRect(0, 0, canvas.width, canvas.height);
        cc.strokeRect(0, 0, canvas.width, canvas.height);
        for (const pawn of this.pawns.values()) pawn.update();
    }

}

// -- Pawn --
//
// Each actor in the model has corresponding pawn in the view. Pawns update their positions smoothly
// each frame, even if their actor is updating itself much more infrequently.

class Pawn extends Multisynq.View {

    constructor(actor) {
        super(actor);
        this.actor = actor;
        this.position = {...actor.position};
        this.actorMoved();
        this.subscribe(actor.id, {event: "moved", handling: "oncePerFrame"}, this.actorMoved);
    }

    actorMoved() {
        // Save when model was last updated
        this.lastMoved = viewTime;
    }

    update() {
        // If this is our pawn, draw our goal and our unsmoothed position from the model.

        if (this.actor.viewId === this.viewId) {
            this.draw(this.actor.goal, null, this.actor.color);
            this.draw(this.actor.position, "lightgrey");
        }

        // Draw the smoothed positions of all the pawns, including our own.
        // First we extrapolate from the last position we received from the model.
        // Then we average our extrapolation with our current position.

        const delta = scale(this.actor.velocity, viewTime - this.lastMoved);
        const extrapolation = add(this.actor.position, delta);
        this.position = lerp(this.position, extrapolation, Q.SMOOTH);
        this.draw(this.position, this.actor.color);
    }

    draw({x, y}, color, border) {
        cc.strokeStyle = border;
        cc.fillStyle = color;
        cc.beginPath();
        cc.arc(x, y, 10, 0, 2 * Math.PI);
        if (color) cc.fill();
        if (border) cc.stroke();
    }
}

Multisynq.Session.join({
  appId: "io.codepen.multisynq.smooth",
  apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
  name: "public",
  password: "none",
  model: RootModel,
  view: RootView,
  tps: 1000/Q.TICK_MS,
});