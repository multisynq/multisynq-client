Copyright © 2025 Croquet Labs

Multisynq guarantees that the same sequence of random numbers is generated within the model on each device.
If you call `Math.random()` within the model it will return the same number on all machines.

Calls to `Math.random()` within the view will behave normally. Different machines will receive different random numbers.
