// Multisynq Tutorial 2
// Simple Animation
// Croquet Labs (C) 2025

//------------ Models--------------
// Models must NEVER use global variables.
// Instead use the Multisynq.Constants object.

const Q = Multisynq.Constants;
Q.BALL_NUM = 25;              // how many balls do we want?
Q.STEP_MS = 1000 / 30;        // bouncing ball tick interval in ms
Q.SPEED = 10;                 // max speed on a dimension, in units/s

class RootModel extends Multisynq.Model {

    init(options) {
        super.init(options);
        this.children = [];
        for (let i = 0; i < Q.BALL_NUM; i++)
          this.add(BallModel.create());
        this.add(BallModel.create({type:'roundRect', pos: [500, 500], color: "white", ignoreTouch: true}));
    }

    add(child) {
        this.children.push(child);
        this.publish(this.id, 'child-added', child);
   }
}

RootModel.register("RootModel");

class BallModel extends Multisynq.Model {

    init(options={}) {
        super.init();
        const r = max => Math.floor(max * this.random()); // return a random integer below max
        this.allowTouch = !options.ignoreTouch;
        this.type = options.type || 'circle';
        this.color = options.color || `hsla(${r(360)},${r(50)+50}%,50%,0.5)`;
        this.pos = options.pos || [r(1000), r(1000)];
        this.speed = this.randomSpeed();
        this.subscribe(this.id, 'touch-me', this.startStop);
        this.alive = options.ignoreTouch || r(100) > 20; // arrange for roughly 1 in 5 balls to start as stationary.
        this.future(Q.STEP_MS).step();
    }

    moveTo(pos) {
        const [x, y] = pos;
        this.pos[0] = Math.max(0, Math.min(1000, x));
        this.pos[1] = Math.max(0, Math.min(1000, y));
        this.publish(this.id, 'pos-changed', this.pos);
    }

     randomSpeed() {
        const xs = this.random() * 2 - 1;
        const ys = this.random() * 2 - 1;
        const speedScale = Q.SPEED / (Math.sqrt(xs*xs + ys*ys));
        return [xs * speedScale, ys * speedScale];
    }

     moveBounce() {
        const [x, y] = this.pos;
        if (x<=0 || x>=1000 || y<=0 || y>=1000)
           this.speed=this.randomSpeed();
        this.moveTo([x + this.speed[0], y + this.speed[1]]);
     }

    startStop(){ if (this.allowTouch) this.alive = !this.alive }

    step() {
        if (this.alive) this.moveBounce();
        this.future(Q.STEP_MS).step();
    }
}

BallModel.register("Ball");

//------------ View--------------
let SCALE = 1;                  // model uses a virtual 1000x1000 space
let OFFSETX = 50;               // top-left corner of view, plus half shape width
let OFFSETY = 50;               // top-left corner of view, plus half shape height
const TOUCH ='ontouchstart' in document.documentElement;

class RootView extends Multisynq.View{

    constructor(model) {
        super(model);

        this.element = document.getElementById('animation');
        if (TOUCH) this.element.ontouchstart = e => e.preventDefault();
        this.resize();
        window.onresize = () => this.resize();
        model.children.forEach(child => this.attachChild(child));
    }

    attachChild(child) {
        this.element.appendChild(new BallView(child).element);
    }

    resize() {
        const size = Math.max(50, Math.min(window.innerWidth, window.innerHeight));
        SCALE = size / 1100;
        OFFSETX = (window.innerWidth - size) / 2;
        OFFSETY = 0;
        this.element.style.transform = `translate(${OFFSETX}px,${OFFSETY}px) scale(${SCALE})`;
        this.element.style.transformOrigin = "0 0";
        OFFSETX += 50 * SCALE;
        OFFSETY += 50 * SCALE;
    }

    detach() {
        super.detach();
        let child;
        while (child = this.element.firstChild) this.element.removeChild(child);
    }
}

class BallView extends Multisynq.View {

    constructor(model) {
        super(model);
        const el = this.element = document.createElement("div");
        el.view = this;
        el.className = model.type;
        el.id = model.id;
        el.style.backgroundColor = model.color;
        this.move(model.pos);
        this.subscribe(model.id, { event: 'pos-changed', handling: "oncePerFrame" }, this.move);
        this.enableTouch();
    }

    move(pos) {
        this.element.style.left = pos[0] + "px";
        this.element.style.top = pos[1] + "px";
    }

    enableTouch() {
        const el = this.element;
        if (TOUCH) el.ontouchstart = start => {
          start.preventDefault();
          this.publish(el.id, 'touch-me');
          };
        else el.onmousedown = start => {
          start.preventDefault();
          this.publish(el.id, 'touch-me');
          };
    }
}

Multisynq.Session.join({
    appId: "io.codepen.multisynq.simpleanim",
    apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
    name: "public",
    password: "none",
    model: RootModel,
    view: RootView
});