import { Model, View, Session } from '@multisynq/client'

class Counter extends Model {

  counter = 0

  init() {
      this.counter = 0;
      this.subscribe("counter", "reset", this.resetCounter);
      this.future(1000).tick();
  }

  resetCounter() {
      this.counter = 0;
      this.publish("counter", "update");
  }

  tick() {
      this.counter++;
      this.publish("counter", "update");
      this.future(1000).tick();
  }

}
Counter.register("MyModel");


export function setupCounter(element: HTMLButtonElement) {

  class Button extends View {
    model: Counter;

    constructor(model: Counter) {
        super(model);
        this.model = model;
        this.subscribe("counter", "update", this.updateCounter);
        element.onclick = () => this.publish("counter", "reset");
        this.updateCounter();
    }

    updateCounter() {
        element.innerHTML = `${this.model.counter}`;
    }
  }

  Session.join({
    appId: "io.multisynq.hello-typescript",
    apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
    name: location.origin + location.pathname, // one session per URL
    password: "shared",
    model: Counter,
    view: Button,
  })
}
