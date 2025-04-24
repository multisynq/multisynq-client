// Multisynq Tutorial 1
// Hello World
// Croquet Labs (C) 2025

class MyModel extends Multisynq.Model {

    init() {
        this.count = 0;
        this.subscribe("counter", "reset", this.resetCounter);
        this.future(100).tick();
    }

    resetCounter() {
        this.count = 0;
    }

    tick() {
        this.count += 0.1;
        this.future(100).tick();
    }

}

MyModel.register("MyModel");

class MyView extends Multisynq.View {

    constructor(model) {
        super(model);
        this.model = model;
        countDisplay.onclick = event => this.counterReset();
        this.update();
    }

    counterReset() {
        this.publish("counter", "reset");
    }

    update() {
        countDisplay.textContent = this.model.count;
    }

}

Multisynq.Session.join({
  appId: "io.codepen.multisynq.hello",
  apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
  name: "public",
  password: "none",
  model: MyModel,
  view: MyView});