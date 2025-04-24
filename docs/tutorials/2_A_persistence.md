Copyright © 2025 Croquet Labs

Multisynq automatically snapshots and
restores all model data. When you leave a session and come back later,
everything resumes exactly where you left off. As a developer, you don't
have to implement anything special to make that happen, it's part of the design.

However, whenever you change some model code, the model
is initialized from scratch and previous application data is lost. This is
because a Multisynq session is identified by the combination of
application ID (`appId`), the session name (`name`), and the content
of the model code (as a hashed value) along with the Multisynq Library
version. This means that replicated computation will use the identical
code, but also means that even a small change in code creates a new
session, even when the same `appId` and `name` are specified in
[Session.join()]{@link Session.join}.

For many apps and games this is perfectly fine. But imagine if you are
writing a collaborative shape editor or text editor
to which you will have to fix bugs and add new features over time. You
certainly would wish to keep user-generated contents in this
scenario. In other words, you would like to *persist* the application
data.

Multisynq provides a mechanism to support this. This mechanism allows you
to specify what data to save as the essential part of the application
data from the old version of application, and load it into a new
version of application. In addition to the `sessionId`` described above,
Multisynq uses a derived ID called `persistentId`, which is a
combination of `appId` and the session `name`, to identify an
application session independent of code changes.

When a session is joined for the first time (a session with a
never-seen-before `sessionId`), the root model's [init]{@link Model#init} function is
called. If persisted data created from a previous session of the same
persistentId, the data is passed into [init]{@link Model#init} as second argument.
(Side note: the root model's init will never be called again in this session,
because future session joins will resume a snapshot, rather running init)

An application specifies when and what to be saved as persistent data
by calling the [persistSession()]{@link Model#persistSession} method with a
function that returns the data to be saved.

Most simple apps can use [persistSession()]{@link Model#persistSession} directly
in the root model like this:

~~~~ JS
class SimpleAppRootModel {
    init(options, persisted) {
        /* regular setup */
​        ...
        if (persisted) {
            /* use persisted data */
            ...
        }
    }
​
    save() {
        this.persistSession(() => {
            const data = { /* collect data to persist */ };
            return data;
        });
    }
}
~~~~

A full example of this simple scheme can be seen in the [Data API]{@tutorial 2_9_data} docs,
or in Step 8 of the
[Multiblaster tutorial]{@tutorial 1_6_multiblaster}.

It is important to know that [persistSession()]{@link Model#persistSession} uses a stable JSON
stringification implementation to store data. If you use your own
stringification and return the string from the function passed to
[persistSession()]{@link Model#persistSession}, make sure that you use an implementation that is
stable when it is run on different platforms or JS runtime. Also note that
unlike snapshotting, `Map`s and other non-JSON JavaScript types are *not* handled
by the [persistSession()]{@link Model#persistSession} directly. If you
use a `Map` in your model data structure, you need to handle them by
yourself.

For a more complex app, code below shows one way to structure your
code. Note that the only actual Multisynq APIs used here are
[persistSession()]{@link Model#persistSession},
and finding the root model via [wellKnownModel()]{@link Model#wellKnownModel}.
How the saved data is structured and interpreted is completely up to
the app/framework, and all the methods with "save" in their names are
unknown to Multisynq.

The persistent data should be as independent of the current
application structure as possible. In this example, the
persistent data uses "documents" whereas the app uses "submodels". Even
if all classes and properties were renamed in future versions, this
document structure should be simple to interpret and map to new code.

Note also that here we add a `version` property to the persisted data.
Again, this is not interpreted by Multisynq in any way, but by the app's
`fromSaveData()` method. This is a forward-thinking way to allow changing
the persistence format later.

~~~~ JS
class SubModel {
    init(options, persisted) {
        /* ... regular setup ... */
​
        if (persisted) this.fromSaveData(persisted);
    }
​
    save() { this.wellKnownModel("modelRoot").save(); }
​
    toSaveData() { return { /* ... some data ... */ };  }
​
    fromSaveData(data) { /* ... set up from data ... */ }
}
​
class ComplexAppRootModel {
    init(options, persisted) {
        if (persisted) {
            this.fromSaveData(persisted);
        } else {
            this.submodelA = SubModel.create(subopts);
            this.submodelB = SubModel.create(subopts);
        }
    }
​
    save() {
        this.persistSession(this.toSaveData);
    }
​
    toSaveData() {
        return {
            version: 1,
            documents: {
                a: this.submodelA.toSaveData(),
                b: this.submodelB.toSaveData(),
            }
        }
    }
​
    fromSaveData(persisted) {
        switch (persisted.version) {
            case 1:
                const documents = persisted.documents;
                this.submodelA = SubModel.create(subopts, documents.a);
                this.submodelB = SubModel.create(subopts, documents.b);
                break;
            default:
                /* ... */
        }
    }
}
~~~~

A rather complex but real-world example of this appears in [Microverse]{@link https://github.com/croquet/microverse/blob/644544ed0734fd62939907bb9ddea0746667bc58/src/microverse.js#L542}
using its [WorldSaver]{https://github.com/croquet/microverse/blob/644544ed0734fd62939907bb9ddea0746667bc58/src/worldSaver.js#L12} class.

# Best Practices

Below are some best practices we learned from our experiences. You can find code examples in various apps provided by Multisynq.

## When to think about adding the persistence to your app?
If your application does not need to save long-lasting data (for example, a simple realtime multi-player game), then there is no need to persist any data. But once, for example, you want to add a high score feature to entice users, chances are that you want to keep the score over different versions of code (your next code change may be a simple bug fix). Note that you *cannot* add the call to persistence mechanism as an afterthought to a session that already has model data you wish to save, as adding the call changes the model code and thus Multisynq treats it as a new session. So  when you add a new model property for a new feature, it is good to ask yourself if you will have to persist it.

## When to call `persistSession`?
Once you determine that your application needs to persist data, you need to consider when is the right time to save it. Unlike automatic snapshotting, the application is responsible to decide when call [persistSession()]{@link Model#persistSession}. It is vital to save your important data while keeping the overhead of network and computation low. A common strategy is to trigger 'persistSession()` for a *major* data change in the model. For example, adding or deleting a graphical object in the shape editor would be major, while movements of a shared cursor is not. Another common strategy is to trigger it on a timer that is started when there are some data updates. In a text editor app, it may be overkill to store persistent data for every keystroke from any user, but you might also like to save persistent data 30 seconds after a burst of edit activity. (Note: if you call [persistSession()]{@link Model#persistSession} rapidly, Multisynq will not upload each data, but will wait a certain time before uploading again.)

## How to test and debug
For testing and debugging purposes, it is important to recall how the persistent mechanism works. That is, *when* a 'never-seen-before sessionId` is encountered, *then* the reflector looks up the persistent data for the `persistentId` and passes it to Model's [init()]{@link Model#init} if it is available.

An implication of this is that if your test version of  the app had a bug and has written an invalid persistent data for a `persistentId`, fixing code afterwards could be too late, as critical user contents could have been lost already if you cannot find the right combination of code that produces the same `sessionId`. It is good to safeguard against this:

To do so, you write [init()]{@link Model#init} as follows:

~~~~ JS
init(options, persisted) {
    // ...
    if (persisted) {
        delete this.loadingPersistentDataErrored;
        this.loadingPersistentData = true;
        try {
            this.fromSavedData(persisted);
        } catch (error) {
            console.error("error in loading persistent data", error);
            this.loadingPersistentDataErrored = true;
        } finally {
            delete this.loadingPersistentData;
        }
    }
}

save() {
    if (this.loadingPersistentData) {return;}
    if (this.loadingPersistentDataErrored) {return;}
    /* this.persistSession(...); */
}

fromSavedData(persisted) {
    ...
}
~~~~

where `fromSavedData()` interprets the incoming `persisted` data and sets up the data structures in the model. If that method raises an error, `loadingPersistentDataErrored` property becomes `true` so that `save()` skips the call to [persistSession()]{@link Model#persistSession}. The `loadingPersistentData` property above is set to be `true` during the execution of `fromSavedData()`. This is to prevent saving while persistent data is still being loaded. This can happen easily if the application uses the same methods to create objects from persistent data, as when the usewr creates those interactively. In the latter case you want to call `save()`, and with the `loadingPersistentData` guard in place it's fine to do so.

You may also encounter the case that your `save()` has a bug and raises an error. This usually is not a problem. If you relaunch the application with your old code (with the same `appId`, `name`, and the same Multisynq library version), the reflector will find the snapshot (not persistent data) to start the session. In this case, the user content is not lost.

While developing the persistent data mechanism for your app, a common workflow is as follows:

1. Put a break point in the `toSaveData()` method, and trigger it by publishing an event from the view.
2. Check the object it returns and make sure that it is structured as you expect. Repeat this step until you are satisfied.
3. If you think it is creating the right object to be saved, let your code run through to get the data to be stored.
4. Modify the model code just a little bit (it could be a change to a `console.log()` call in the model), and relaunch your application with a break point set in  `fromSavedData()`.
5. If loading fails due to a bug, fix it. You might have to go back to step 2 to fix the saving part also.
6. If it appears to load the correct data, try to trigger the persistent data saving logic from the loaded session. This often uncovers some bugs.

If you follow the above code pattern that skips a new persistent data store when it errored, you can start a debugging session with identical persistent data so it is easier to see that you are making progress.

It is handy to have two deployments of the same application. You would keep your old and working version of the application, from which you can create new persistent data. You update the other deployment (could be on your local machine) to try to load the data.

### Debug Options
To log more useful info to the console, you can specify the `debug: "session"` option in [Session.join()]{@link Session.join}, or specify the equivalent URL option (`debug=session`). You see additional log messages when this debug option is specified, for example if a new session is loaded from a snapshot or persisted data.

## End-to-End Encryption
Like everything in Multisynq, persistent data is encrypted, and as long as the session password is never transmitted to a server, it is
[end-to-end secure]{@link https://en.wikipedia.org/wiki/End-to-end_encryption} (this is the reason why by default, the session password is in the URL `#hash`, which is never transmitted over http, and why a good way to join a session is via QR code). Even if someone hacks our file servers, all they get is encrypted data with no way to decrypt it, the data is only ever decrypted on the client running the Multisynq app.

Conversely, it means that nobody, including Multisynq, can decrypt the contents of the data, unless the session password is known.
If a password is lost, the session data is lost too.
You may opt to store session names and passwords on a server where users log in.
That will not be end-to-end encrypted anymore, because it will only be as secure as that server (if someone breaks into that server with the passwords, they could decrypt the data).
But it would allow you to recover user data. You need to weigh convenience against privacy in the context of your app. Multisynq itself opts for end-to-end-security-by-default.