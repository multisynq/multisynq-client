# Multisynq Client

*Multisynq lets you build real-time multiuser apps without writing server-side code. Unlike traditional client/server architectures, the multiplayer code is executed on each client in a synchronized virtual machine, rather than on a server. Multisynq is available as a JavaScript library that synchronizes apps using Multisynq's global DePIN network.*

* can be hosted as a **static website**
* **no server-side** code needed
* **no networking** code needed
* independent of UI framework

## Getting Started

Get a free API key from [multisynq.io](https://multisynq.io/coder).

### Install

    npm i @multisynq/client

You can also use the Multisynq pre-bundled files, e.g. via a script tag

    <script src="https://cdn.jsdelivr.net/npm/@multisynq/client@1.1.0/bundled/multisynq-client.min.js"></script>

or via direct import as a module

    import * as Multisynq from "https://cdn.jsdelivr.net/npm/@multisynq/client@1.1.0/bundled/multisynq-client.esm.js";

### Code

Structure your app into a synchronized part (subclassed from [Multisynq.Model](https://multisynq.github.io/multisynq-client/Model.html)) and a local part interacting with it via events (subclassed from [Multisynq.View](https://multisynq.github.io/multisynq-client/View.html)). Use [Multisynq.Session.join()](https://multisynq.github.io/multisynq-client/Session.html#.join) with your API key to join a session.

### Deploy

Upload your app to a web server. That's it. No deployment of anything except your HTML+JS.

## Docs and Tutorials

Follow the docs and tutorials in this repo (deployed at https://multisynq.github.io/multisynq-client/) as well as the documentation at [docs.multisynq.io](https://docs.multisynq.io) and the example apps in the [Multisynq GitHub repos](http://github.com/multisynq).

### The Prime Directive

*Your Multisynq Model must be completely self-contained.*

The model must only interact with the outside world via subscriptions to user input events that are published by a view. Everything else needs to be 100% deterministic. The model must not read any state from global variables, and the view must not modify model state directly, only via publishing events (although the view is allowed to read from the model).

Besides being deterministic, the model must be serializable – it needs to store state in an object-oriented style. That means in particular that the model cannot store functions, which JavaScript does not allow to be introspected for serialization. That also means you cannot use async code in the model. On the view side outside the model you're free to use any style of programming you want.

## Servers and Networking

Multisynq runs on the [Multisynq DePIN network](https://multisynq.io) which automatically selects a server close to the first connecting user in a session.

All application code and data is only processed on the clients. All network communication and external data storage is end-to-end encrypted by the random session password – since the server does not process application data there is no need for it to be decrypted on the server. This makes Multisynq one of the most private real-time multiplayer solutions available.

## Open Source

The Multisynq Client is licensed under Apache 2.0.

## Change Log

### [1.1] - 2025-07-24

Moved client source code from dependency into this repo; new build system; minor fixes.

### [1.0] - 2025-04-23

Public release