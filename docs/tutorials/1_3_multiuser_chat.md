Copyright © 2025 Croquet Labs

This is an example of how to keep track of different users within the same session. It's a simple chat application that maintains a list of all currently connected users. New users are assigned a random nickname.

<p class="codepen" data-height="512" data-theme-id="37190" data-default-tab="result" data-user="multisynq" data-slug-hash="gbbmdem" data-editable="true" style="height: 512px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;" data-pen-title="Chat">
  <span>See the Pen <a href="https://codepen.io/multisynq/pen/gbbmdem/">
  Chat</a> by Multisynq (<a href="https://codepen.io/multisynq">@multisynq</a>)
  on <a href="https://codepen.io">CodePen</a>.</span>
</p>
<script async src="https://static.codepen.io/assets/embed/ei.js"></script>

## **Try it out!**
The first thing to do is click or scan the QR code above. This will launch a new Codepen instance of this session. Typing a message in either window will post the text to the shared chat screen under a randomly assigned nickname. Other people who are reading this documentation right now can also post messages to the same conversation, so you might find yourself talking to another Multisynq developer!

There are five things we will learn here:

1. How to use `"view-join"` and `"view-exit"` events to track connections.
2. How to use the `viewId` to store view-specific information inside the model.
3. How to directly read from the model without breaking synchronization.
4. How to use `future()` messages and `model.now()` to schedule actions based on timeouts.
5. How to use `modelOnly()` to prevent accidentally writing to the model.


## Simple Chat Model

  Our Multisynq application uses a single Model subclass named `ChatModel`. The model can be thought of as doing four things: it maintains a mapping between the active views and their nicknames; it maintains the history of chat entries; it listens for chat-post or chat-reset events coming from views; and it unilaterally clears the chat after a period of inactivity.

  A `"newPost"` event is sent by a view when its user enters a chat message. The event is reflected to the model of all users in the session. Each user's model adds the post to its chat history, and informs its local view to update its display.

  A `"reset"` event is sent by a view when its user types the special string "/reset", or when a newly joining view finds that it's alone, and with a chat history that it played no part in.

  `"view-join"` and `"view-exit"` are system-generated events. They don't originate inside your application, but come from the Teatime system itself. When a new user joins a session, a `"view-join"` event is sent to the model of everyone in the session (including the user who just joined). Similarly, whenever a user leaves, a `"view-exit"` event is sent - though in this case the user who just left will not get the event, because they are already gone!

## ChatModel.init()

  ```
  this.views = new Map();
  ```

  `views` holds a list of nicknames indexed by the users' unique view IDs.

  It would be possible to store the views in a standard JavaScript object (```{view1: "nick1"; view2: "nick2", ...}```), but a Map has the additional property that when serialized and deserialized it is guaranteed to maintain the order of its items. This particular app never needs to iterate over this list, but **to ensure that key-value collections held in models behave identically across users - whenever each user happened to join the session - we recommend using Maps instead of plain objects**. (For views, use whatever you like.  Views aren't obliged to behave identically.)

  ```
  this.participants = 0;
  ```

  `participants` is the number of currently active views.

  ```
  this.history = [];
  ```

  `history` is an array of items each holding a chat-post HTML string and the view ID of the user who posted it.

   ```
  this.subscribe(this.sessionId, "view-join", this.viewJoin);
  this.subscribe(this.sessionId, "view-exit", this.viewExit);
  ```

  These subscriptions handle users entering or leaving. In both cases the scope is set to `this.sessionId`, which is the default scope for all system-generated events. The data passed to both events is the joining or exiting view's unique `viewId`.

  If a user's view leaves due to becoming inactive, then later re-enters (for example, if it is running on a phone that is put to sleep, then re-awakened), the `viewId` on re-entry will be the same as before.  On the other hand, if a user joins the session from multiple browser tabs even on the same device, the `viewId` for each tab will be different.

  **Inside your application you can use `viewID` as a unique identifier for each participant in a session.** You can store data about individual participants using `viewID` as the key. Or you can use `viewID` as the scope of an event to specify who sent it, or limit who receives it.

  ```
  this.subscribe("input", "newPost", this.newPost);
  ```

  This subscription handles new chat posts. It's given the scope "input" as a way to remind us where the event is coming from. (It also means we could use `"newPost"` as a different event somewhere else in our application without the two events being confused with each other.)


## ChatModel.viewJoin(viewId)
```
  viewJoin(viewId) {
    const existing = this.views.get(viewId);
    if (!existing) {
      const nickname = this.randomName();
      this.views.set(viewId, nickname);
    }
    this.participants++;
    this.publish("viewInfo", "refresh");
  }
  ```
  When a user joins the session, the model checks whether this `viewId` has already been seen.  If not, it generates a new random nickname and stores it in the view list using the `viewID` as the access key. It then increments the `participants` count and publishes an event that will trigger the view to refresh its display. (In this case we're using `"viewInfo"` as the scope; even a generic event name like `"refresh"` is safe to use, as long as the app assigns different scopes for any other uses of "refresh".)

## ChatModel.viewExit(viewId)
  ```
    viewExit(viewId) {
      this.participants--;
      this.views.delete(viewId);
      this.publish("viewInfo", "refresh");
    }
  ```
  When a user leaves the session, the model decrements the `participants` count, removes the user's entry in the view list, and publishes the same refresh event.

## ChatModel.newPost(post)
```
  newPost(post) {
    const postingView = post.viewId;
    const nickname = this.views.get(postingView);
    const chatLine = `<b>${nickname}:</b> ${this.escape(post.text)}`;
    this.addToHistory({ viewId: postingView, html: chatLine });
    this.lastPostTime = this.now();
    this.future(this.inactivity_timeout_ms).resetIfInactive();
  }

  addToHistory(item){
    this.history.push(item);
    if (this.history.length > 100) this.history.shift();
    this.publish("history", "refresh");
  }
```

  The data supplied with a `"newPost"` event includes the sender's `viewId`. When the model receives a new post, it uses this ID to look up the user's nickname. It then builds an HTML chat line that includes the nickname and the message, and invokes `addToHistory()` to append the line to the chat history along with the view ID, for later lookup.

  `addToHistory` publishes an event to the view informing it that the history has changed (noting, as explained above, that the `"refresh"` event here uses the `"history"` scope, so there is no conflict with `"viewInfo"` events).  If there are more than 100 entries in the history, it discards the oldest entry to prevent the array from growing too large.

  `newPost` then records `this.now()` in the model's `lastPostTime` property. This is the simulation time (which runs independently of wall-clock time; see the tutorial on [Simulation Time and Future Sends](./tutorial-2_5_sim_time_and_future.html)) at which this chat post arrived. It then schedules a "future send" to itself, the model object: specifically, at a simulation time that is exactly `this.inactivity_timeout_ms` milliseconds after the current simulation time, the method `this.resetIfInactive()` will be invoked.

  `this.inactivity_timeout_ms` was set in `init()`, to a value corresponding to 20 minutes.

## ChatModel.resetIfInactive()
```
  resetIfInactive() {
    if (this.lastPostTime !== this.now() - this.inactivity_timeout_ms) return;

    this.resetHistory("due to inactivity");
  }

```

The aim of this method is to reset the chat when no-one has posted for a long time. It will be invoked, through the "future send" mechanism, a set interval - `this.inactivity_timeout_ms` simulation milliseconds - after each post. To go ahead with the reset, it must confirm that the whole interval since the post that triggered it has indeed passed without any later post arriving. To check that, we look at the current simulation time (`this.now()`) and see if it is exactly `inactivity_timeout_ms` after the value currently in `lastPostTime`. If it is, clearly no later posts did arrive, so the reset should go ahead.

Instead of the original post time, or a more recent one, `lastPostTime` can also be `null` indicating that the history has been reset (see below).  In that case, too, there is no need to do anything here.

Note that the handling of future sends, like that of messages from views, is guaranteed to be identical for every user's model instance. Every instance will make the same decision about whether to reset or not.

## ChatModel.resetHistory(reason)
```
  resetHistory(reason) {
    this.history = [{ html: `<i>chat reset ${reason}</i>` }];
    this.lastPostTime = null;
    this.publish("history", "refresh");
  }
```

This is called in three circumstances:
1. If `ChatModel.resetIfInactive()` is invoked and finds that `inactivity_timeout_ms` simulation milliseconds have passed since the last post.
2. If a user types the text `/reset` as a chat line.
3. If a user's `ChatView` constructor (see below) detects that they are the only user in the session, and that the existing chat contains no items that they posted.

For the latter two cases, the invocation is the result of the model's subscription to the  `"reset"` event, that the affected view will have published:

```
  this.subscribe("input", "reset", this.resetHistory);
```

The view methods that publish this event are described below.

After replacing the contents of the `history` array with a single entry displaying the reason for the reset, this method resets `lastPostTime` to null. This ensures that any outstanding future-send invocations of `resetIfInactive()` will see that they have nothing to do.

## ChatModel.randomName()

  ```
  randomName() {
    const names = ["Acorn" ..."Zucchini"];
    return names[Math.floor(Math.random() * names.length)];
  }
  ```

When a new user joins, their nickname is picked at a random from an array. Note that even though a separate instance of this code is running locally for each user, each of the instances will "randomly" pick the same name. This is because - as also seen in the [Simple Animation](./tutorial-1_2_simple_animation.html) tutorial - **calls to `Math.random()` from inside the model are deterministic**. They will generate exactly the same sequence of random numbers in every instance of the model, ensuring they all stay in synch.

## ChatView.constructor(model)

```
  this.model = model;
```

We store a reference to the model so that we can use it later to pull data directly.

(Note: This reference is only to the root model that was created during `Multisynq.Session.join`. If your root model contains sub-models that you need to read from, you should store references to them inside the root model.)

```
  sendButton.onclick = () => this.send();
```
This is the event handler for the HTML "Send" button. It is called when the user clicks the button (or, thanks to our HTML setup, when the user presses Enter in the input field).

```
  this.subscribe("history", "refresh", this.refreshHistory);
  this.subscribe("viewInfo", "refresh", this.refreshViewInfo);
```
We subscribe to two different refresh events from the model. One is sent when the model has updated the chat history (either adding a message or performing a reset), and the other is sent when someone joins or exits the session.

```
  this.refreshHistory();
  this.refreshViewInfo();
```

When the view starts we pull the current history from the model and post it to the screen. We do this because when a user joins an existing chat session, there may already be a history of previous chat messages to be shown; it makes no sense to wait until someone adds a new post.

We do the same for refreshing the view info. **Multisynq guarantees that the model will have processed this view's own view-join event before the view is constructed.** This means that a ChatView will never see a `viewInfo` event generated in response to its own joining, but it can assume during its own initialization that the ChatModel already has an entry for it.

This is a general rule in Multisynq development: **a newly constructed view should set itself up completely from the model state at the time of construction.**  After that, it should rely on its subscriptions to hear about updates in the model and to respond appropriately.

```
  if (model.participants === 1 &&
    !model.history.find(item => item.viewId === this.viewId)) {
    this.publish("input", "reset", "for new participants");
  }
```

The final task for the constructor is to check for the condition of the view being alone in the session, with no messages contributed by itself in the chat history. In that case, it sends an event to reset the history.

The necessary information is held by the model, and **the view is allowed to directly read from the model at any time.** Here it checks the number of participants, and iterates through the history in search of any items provided by itself.

**The view must NEVER directly write to the model!** Because Multisynq exposes the model to the view for read access, it is *possible* to author a Multisynq application where the view directly writes to the model. However, doing so will break synchronization and prevent the application from functioning properly.

If your view needs to change some information that is held by the model, it **must** do so by publishing an event that the model subscribes to. This will ensure that the change is mirrored by the synchronizer and executed identically by all instances of the model.

## ChatView.send()
  ```
  send() {
    const text = textIn.value;
    textIn.value = "";
    if (text === "/reset") {
      this.publish("input", "reset", "at user request");
    } else {
      this.publish("input", "newPost", {viewId: this.viewId, text});
    }
  }
  ```

When the user presses the send button, we examine the text contents of the input field. If it's the special value "/reset", we send a `"reset"` event to the model; for any other string (including an empty one) we send a `"newPost"` event. Only the latter event needs to include the `viewId` of the sending view, so that the model can tag the post with the appropriate user nickname.

**Any class that inherits from `View` has `this.viewId` as a member.** It contains the unique `viewId` that was assigned to this user when they joined the session. We can use `this.viewId` whenever we want to tell the model that a particular user has done something.

## ChatView.refreshViewInfo()
```
  refreshViewInfo() {
    nickname.innerHTML = "<b>Nickname:</b> " + this.model.views.get(this.viewId);
    viewCount.innerHTML = "<b>Total Views:</b> " + this.model.participants;
  }
```

Again the view reaches directly into the model, in this case to get its own nickname and the total number of views currently connected. In the view's constructor we stored a pointer to the model just for this purpose.

## ChatView.refreshHistory()
```
  refreshHistory() {
    textOut.innerHTML = "<b>Welcome to Multisynq Chat!</b><br><br>" +
      this.model.history.map(item => item.html).join("<br>");
    textOut.scrollTop = Math.max(10000, textOut.scrollHeight);
  }
```
`refreshHistory()` is similar to `refreshViewInfo()` in that it reads the chat history directly from the model and posts it to the screen. It also makes sure that the chat window scrolls to the bottom when a new message arrives.

`this.model.history.map(item => item.html)` is a JavaScript array operation that extracts all the HTML strings from the history. The `join("<br>")` then concatenates them into a single output string, inserting a line break between each.

## Model Get/Set Routines & `modelOnly()`

One way to guard against accidentally writing to the model is to create explicit `Get` and `Set` methods for reading and writing. For example:

```
class MyModel extends Multisynq.Model {

  init() {
    this.data;
  }

  getData() {
    return this.data;
  }

  setData(newData) {
    this.modelOnly();
    this.data = newData;
  }

}
MyModel.register("MyModel");

```

`Model.modelOnly()` is a utility function that throws an error if called outside normal model execution. You can use it inside a model `Set` method to make sure it doesn't accidentally get called by the view.
