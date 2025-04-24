Copyright © 2025 Croquet Labs

The model has no concept of real-world time. All it knows about is _simulation time_.

Simulation time is the time in milliseconds since a session began. Any model can get the current simulation time by calling `this.now()`.

While a session is active, the reflector will send a steady stream of heartbeat ticks to every connected user. Simulation time only advances when a heartbeat tick is received.

What this means is that if you make a rapid series of calls to `this.now()`, it will always return the same value. It will not return a different value until the next heartbeat tick was received and processed.

If you want to schedule a process to run in the future, don't poll `this.now()`, instead use _future send_. For example:
```
myTick() {
    // ... do some stuff ...
    this.future(100).myTick();
}
```
This creates a routine that will execute `myTick` every time 100 milliseconds have elapsed. If your simulation needs to update continuously, you will want to set up a tick routine in your model. Call it once at the end of the model's `init()` code, and ensure that it schedules itself to be called again each time it runs.

The delay value passed to `future` does not need to be a whole number.  For example, if you want something to run 60 times a second, you could pass it the value `1000/60`.

Note that individual sub-models can have their own tick routines, so different parts of your simulation can run at different rates. Models can even have multiple future sends active at the same time. For example, you could have a model that updates its position 60 times a second, and check for collisions 20 times a second.

Future can also be used for things besides ticks. It's a general-purpose scheduling tool. For example, if you wanted a sub-model to destroy itself half a second in the future, you could call:
```
this.future(500).destroy();
```
(Views can also use `future` but they operate on normal system time.)
