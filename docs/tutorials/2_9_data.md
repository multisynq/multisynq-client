Copyright © 2025 Croquet Labs

Multisynq offers secure bulk data storage service for apps. A Multisynq application can upload a file, typically media content or a document file, to the Multisynq file server. The `store()` function returns a *data handle* that can be sent to replicated models in a Multisynq message, and then other participants can `fetch()` the stored data. Off-loading the actual bits of data to a file server and keeping only its meta data in the model is a lot more efficient than trying to send that data via `publish`/`subscribe`. It also allows caching.

Just like snapshots and persistent data, data uploaded via the Data API is end-to-end encrypted with the session password. That means it can only be decoded from within the session.

Optionally, you can create a *shareable handle* where each data is encrypted individually with a random key, which becomes part of the data handle.
Its string form can be shared between sessions and even apps. If you keep this kind of handle stored in the model it is protected by the general end-to-end encryption of the session.
If it leaks, however, anyone will be able to access and decrypt that data, unlike with the default, non-shareable handle.

Following is a full example of the Data API.

~~~~ HTML
<html>
    <head>
        <meta charset="utf-8">
        <title>Data + Persistence Example</title>
        <script src="https://cdn.jsdelivr.net/npm/@multisynq/client@@CLIENT_VERSION@""></script>
    </head>
    <body style="background-color: #666; background-size: contain; background-repeat: no-repeat; background-position: center;" onclick="imageinput.click()">
        <input id="imageinput" type="file" accept="image/*" style="display:none;">
        <span id="message" style="background-color: rgb(255,255,255,0.5);">click to import picture, or drag-and-drop one</i></span>
        <script>

class DataTestModel extends Multisynq.Model {

    init(options, persisted) {                                  // <== Multisynq Persistence
        this.subscribe("global", "add-asset", this.addAsset);
        if (persisted) this.restoreData(persisted);
    }

    addAsset(asset) {
        this.asset = asset;
        this.publish("global", "asset-added", asset);
        this.persistSession(this.saveData);                     // <== Multisynq Persistence
    }

    saveData() {
        const { name, type, size, handle } = this.asset;
        const id = Multisynq.Data.toId(handle);
        return { name, type, size, id };
    }

    restoreData(saved) {
        const { name, type, size, id } = saved;
        const handle = Multisynq.Data.fromId(id);
        this.asset = { name, type, size, handle };
    }
}
DataTestModel.register("DataTestModel");

let deferredUpload = null;

class DataTestView extends Multisynq.View {

    constructor(model) {
        super(model);
        this.subscribe("global", "asset-added", this.assetAdded);
        if (model.asset) this.assetAdded(model.asset);
        if (deferredUpload) {
            this.uploadFile(...deferredUpload);
            deferredUpload = null;
        }

        window.ondragover = event => event.preventDefault();
        window.ondrop = event => {
            event.preventDefault();
            this.addFile(event.dataTransfer.items[0].getAsFile());
        }
        imageinput.onchange = () => {
            this.addFile(imageinput.files[0]);
            imageinput.value = ''; // otherwise upload of another camera image won't trigger onchange
        };
    }

    async addFile(file) {
        if (!file.type.startsWith('image/')) return this.showMessage(`Not an image: "${file.name}" (${file.type})`);
        // grab file data now, even if we're disconnected
        this.showMessage(`reading "${file.name}" (${file.type})`);
        const data = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(file);
        });
        // the session may have been disconnected while the file chooser dialog was open
        if (this.session) this.uploadFile(file, data);
        else deferredUpload = [file, data]; // upload as soon as the session is back
    }

    // only uploading user does this
    async uploadFile(file, data) {
        this.showMessage(`uploading "${file.name}" (${data.byteLength} bytes}`);
        const size = data.byteLength; // get size before store() destroys the data
        const handle = await this.session.data.store(data);                     // <== Multisynq Data API
        const asset = { name: file.name, type: file.type, size: size, handle };
        this.publish("global", "add-asset", asset);
    }

    // every user gets this event via model
    async assetAdded(asset) {
        this.showMessage(`fetching "${asset.name}" (${asset.size} bytes}`);
        this.showImage(asset);
    }

    showMessage(string) {
        message.innerText = string;
        console.log(string);
    }

    async showImage(asset) {
        const data = await this.session.data.fetch(asset.handle);               // <== Multisynq Data API
        this.showMessage(`fetched "${asset.name}" (${data.byteLength} bytes)`);
        const blob = new Blob([data], { type: asset.type });
        document.body.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
    }
}


Multisynq.App.makeWidgetDock();     // show QR code
Multisynq.Session.join({
    appId: "com.example.datatest",
    apiKey: "<fill in>",            // get an API key from multisynq.io/coder
    model: DataTestModel,
    view: DataTestView,
    tps: 0,
});

        </script>
    </body>
</html>
~~~~

When a user drops an image file onto the browser window, or clicks in the window to get the file dialog and chooses a file, the `addFile()` of the `DataTestView` is invoked. It calls [data.store()]{@link Data#store} with `data` as an `ArrayBuffer`. [data.store()]{@link Data#store} returns asynchronously the data handle, then an `"add-asset"` event with the handle is published and the handle gets stored in the model by the `addAsset()` event handler. In addition to the handle, this example also stores some meta data, like file name, MIME type, and file size.

In `addAsset()`, the model also publishes an `"asset-added"` event for all views. The views fetch the data from the file server by calling [data.fetch()]{@link Data#fetch}. Then they create a `Blob` object and use it as the `background-image` CSS style. Now the views of every user show the first user's image.

By default, [data.store()]{@link Data#store} does not preserve the `ArrayBuffer` data, it is detached when it is transferred to the WebWorker that handles encrypting and uploading data (see [ArrayBuffer]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer#transferring_arraybuffers} and [Transferable objects]{@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects}). This is done for efficiency, and the reason why in this example we put the file's size into a variable beforehand (after storing it would be `0`). If you need to use the same data after you call [data.store()]{@link Data#store}, pass `{keep: true}` in the store options, which will transfer a copy instead.

To be able to access the uploaded data even when the app code changes, the data handle needs to be [persisted]{@link Model#persistSession}, so the data handle can be recreated in a new session with the same `appId` and session `name` but modified code (see [Persistence]{@tutorial 2_A_persistence} tutorial). Since persistence needs JSON data, we use [Data.toId()]{@link Data.toId} to create a string representation of the handle, and recreate the equivalent data handle by calling [Data.fromId()]{@link Data.fromId}.

# Best Practices
Keep in mind that accessing external services is responsibility of the view, as the model should be concerned with the logical data.  Calling [data.store()]{@link Data#store} and  [data.fetch()]{@link Data#fetch} is done by the view asynchronously, and the view notifies the model via a Multisynq message.

You will most likely to store the `id` for the data handle created by [data.toId()]{@link Data.toId} for persistent data. It is indeed fine to store the id in the model as the primary data, and the view creates the data handle from it by calling [data.fromId()]{@link Data.fromId} before fetching data.

As in the example above, you can use an `input` DOM element with `type="file"` to get the browser's file dialog or camera roll dialog. However, while the dialog is opened, on some systems (like iOS) the JavaScript execution is suspended and the Multisynq network connection may disconnect while the user takes a long time to select a file or take a photo. We handle this case by storing the information of the chosen file in a global variable, and upload it when the view gets constructed again.

Notice that `init()` of the view calls `assetAdded` when there already is `model.asset` so that a view that joined later shows the same image. This is a common pattern that is not limited to apps that uses Data API, but in general Multisynq views should be initialized to reflect the current model state when constructed, without relying on events.