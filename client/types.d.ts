declare module "@multisynq/client" {

    export type ClassId = string;

    export interface Class<T> extends Function {
        new (...args: any[]): T;
    }

    export type InstanceSerializer<T, IS> = {
        cls: Class<T>;
        write: (value: T) => IS;
        read: (state: IS) => T;
    }

    export type StaticSerializer<S> = {
        writeStatic: () => S;
        readStatic: (state: S) => void;
    }

    export type InstAndStaticSerializer<T, IS, S> = {
        cls: Class<T>;
        write: (value: T) => IS;
        read: (state: IS) => T;
        writeStatic: () => S;
        readStatic: (state: S) => void;
    }

    export type Serializer = InstanceSerializer<any, any> | StaticSerializer<any> | InstAndStaticSerializer<any, any, any>;

    export type SubscriptionHandler<T> = ((e: T) => void) | string;

    export abstract class PubSubParticipant<SubOptions> {
        publish<T>(scope: string, event: string, data?: T): void;
        subscribe<T>(
            scope: string,
            event: string | { event: string } | ({ event: string } & SubOptions),
            handler: SubscriptionHandler<T>,
        ): void;
        unsubscribe<T>(
            scope: string,
            event: string,
            handler?: SubscriptionHandler<T>,
        ): void;
        unsubscribeAll(): void;
    }

    export type FutureHandler<T extends any[]> = ((...args: T) => void) | string;

    export type QFuncEnv = Record<string, any>;

    export type EventType = {
        scope: string;
        event: string;
        source: "model" | "view";
    }

    /**
     * Models are synchronized objects in Multisynq.
     *
     * They are automatically kept in sync for each user in the same [session]{@link Session.join}.
     * Models receive input by [subscribing]{@link Model#subscribe} to events published in a {@link View}.
     * Their output is handled by views subscribing to events [published]{@link Model#publish} by a model.
     * Models advance time by sending messages into their [future]{@link Model#future}.
     *
     * ## Instance Creation and Initialization
     *
     * ### Do __NOT__ create a {@link Model} instance using `new` and<br>do __NOT__ override the `constructor`!
     *
     * To __create__ a new instance, use [create()]{@link Model.create}, for example:
     * ```
     * this.foo = FooModel.create({answer: 123});
     * ```
     * To __initialize__ an instance, override [init()]{@link Model#init}, for example:
     * ```
     * class FooModel extends Multisynq.Model {
     *     init(options={}) {
     *         this.answer = options.answer || 42;
     *     }
     * }
     * ```
     * The **reason** for this is that Models are only initialized by calling `init()`
     * the first time the object comes into existence in the session.
     * After that, when joining a session, the models are deserialized from the snapshot, which
     * restores all properties automatically without calling `init()`. A constructor would
     * be called all the time, not just when starting a session.
     *
     * @hideconstructor
     * @public
     */
    export class Model extends PubSubParticipant<{}> {
        id: string;

        /**
         * __Create an instance of a Model subclass.__
         *
         * The instance will be registered for automatical snapshotting, and is assigned an [id]{@link Model#id}.
         *
         * Then it will call the user-defined [init()]{@link Model#init} method to initialize the instance,
         * passing the {@link options}.
         *
         * **Note:** When your model instance is no longer needed, you must [destroy]{@link Model#destroy} it.
         * Otherwise it will be kept in the snapshot forever.
         *
         * **Warning**: never create a Model instance using `new`, or override its constructor. See [above]{@link Model}.
         *
         * Example:
         * ```
         * this.foo = FooModel.create({answer: 123});
         * ```
         *
         * @public
         * @param options - option object to be passed to [init()]{@link Model#init}.
         *     There are no system-defined options as of now, you're free to define your own.
         */
        static create<T extends typeof Model>(this: T, options?: any): InstanceType<T>;

        /**
         * __Registers this model subclass with Multisynq__
         *
         * It is necessary to register all Model subclasses so the serializer can recreate their instances from a snapshot.
         * Also, the [session id]{@link Session.join} is derived by hashing the source code of all registered classes.
         *
         * **Important**: for the hashing to work reliably across browsers, be sure to specify `charset="utf-8"` for your `<html>` or all `<script>` tags.
         *
         * Example
         * ```
         * class MyModel extends Multisynq.Model {
         *   ...
         * }
         * MyModel.register("MyModel")
         * ```
         *
         * @param classId Id for this model class. Must be unique. If you use the same class name in two files, use e.g. `"file1/MyModel"` and `"file2/MyModel"`.
         * @public
         */
        static register(classId:ClassId): void;

        /** Static version of [wellKnownModel()]{@link Model#wellKnownModel} for currently executing model.
         *
         * This can be used to emulate static accessors, e.g. for lazy initialization.
         *
         * __WARNING!__ Do not store the result in a static variable.
         * Like any global state, that can lead to divergence.
         *
         * Will throw an error if called from outside model code.
         *
         * Example:
         * ```
         * static get Default() {
         *     let default = this.wellKnownModel("DefaultModel");
         *     if (!default) {
         *         console.log("Creating default")
         *         default = MyModel.create();
         *         default.beWellKnownAs("DefaultModel");
         *     }
         *     return default;
         * }
         * ```
         */
        static wellKnownModel<M extends Model>(name: string): Model | undefined;

        /**
         * __Static declaration of how to serialize non-model classes.__
         *
         * The Multisynq snapshot mechanism only knows about {@link Model} subclasses.
         * If you want to store instances of non-model classes in your model, override this method.
         *
         * `types()` needs to return an Object that maps _names_ to _class descriptions_:
         * - the name can be any string, it just has to be unique within your app
         * - the class description can either be just the class itself (if the serializer should
         *   snapshot all its fields, see first example below), or an object with `write()` and `read()` methods to
         *   convert instances from and to their serializable form (see second example below).
         * - the serialized form answered by `write()` can be almost anything. E.g. if it answers an Array of objects
         *   then the serializer will be called for each of those objects. Conversely, these objects will be deserialized
         *   before passing the Array to `read()`.
         *
         * The types only need to be declared once, even if several different Model subclasses are using them.
         *
         * __NOTE:__ This is currently the only way to customize serialization (for example to keep snapshots fast and small).
         * The serialization of Model subclasses themselves can not be customized.
         *
         * Example: To use the default serializer just declare the class:</caption>
         * ```
         * class MyModel extends Multisynq.Model {
         *   static types() {
         *     return {
         *       "SomeUniqueName": MyNonModelClass,
         *       "THREE.Vector3": THREE.Vector3,        // serialized as '{"x":...,"y":...,"z":...}'
         *       "THREE.Quaternion": THREE.Quaternion,
         *     };
         *   }
         * }
         * ```
         *
         * Example: To define your own serializer, declare read and write functions:
         * ```
         * class MyModel extends Multisynq.Model {
         *   static types() {
         *     return {
         *       "THREE.Vector3": {
         *         cls: THREE.Vector3,
         *         write: v => [v.x, v.y, v.z],        // serialized as '[...,...,...]' which is shorter than the default above
         *         read: a => new THREE.Vector3(a[0], a[1], a[2]),
         *       },
         *       "THREE.Color": {
         *         cls: THREE.Color,
         *         write: color => '#' + color.getHexString(),
         *         read: state => new THREE.Color(state),
         *       },
         *     };
         *   }
         * }
         * ```
         * @public
         */
        static types(): Record<ClassId, Class<any> | Serializer>;


        /** Find classes inside an external library
         *
         * This recursivley traverses a dummy object and gathers all object classes found.
         * Returns a mapping that can be returned from a Model's static `types()` method.
         *
         * This can be used to gather all internal class types of a third party library
         * that otherwise would not be accessible to the serializer
         *
         * Example: If `Foo` is a class from a third party library
         *   that internally create a `Bar` instance,
         *   this would find both classes
         * ```
         * class Bar {}
         * class Foo { bar = new Bar(); }
         * static types() {
         *    const sample = new Foo();
         *    return this.gatherClassTypes(sample, "MyLib");
         *    // returns { "MyLib.Foo": Foo, "MyLib.Bar": Bar }
         * }
         * ```
         * @param {Object} dummyObject - an instance of a class from the library
         * @param {String} prefix - a prefix to add to the class names
         * @since 2.0
         */
        static gatherClassTypes<T extends Object>(dummyObject: T, prefix: string): Record<ClassId, Class<any>>;

        /**
         * This is called by [create()]{@link Model.create} to initialize a model instance.
         *
         * In your Model subclass this is the place to [subscribe]{@link Model#subscribe} to events,
         * or start a [future]{@link Model#future} message chain.
         *
         * **Note:** When your model instance is no longer needed, you must [destroy]{@link Model#destroy} it.
         *
         * @param options - there are no system-defined options, you're free to define your own
         * @public
         */
        init(_options?: any, persistentData?: any): void;

        /**
         * Unsubscribes all [subscriptions]{@link Model#subscribe} this model has,
         * unschedules all [future]{@link Model#future} messages,
         * and removes it from future snapshots.
         *
         * Example:
         * ```
         * removeChild(child) {
         *    const index = this.children.indexOf(child);
         *    this.children.splice(index, 1);
         *    child.destroy();
         * }
         * ```
         * @public
         */
        destroy(): void;

        /**
         * **Publish an event to a scope.**
         *
         * Events are the main form of communication between models and views in Multisynq.
         * Both models and views can publish events, and subscribe to each other's events.
         * Model-to-model and view-to-view subscriptions are possible, too.
         *
         * See [Model.subscribe]{@link Model#subscribe}() for a discussion of **scopes** and **event names**.
         * Refer to [View.subscribe]{@link View#subscribe}() for invoking event handlers *asynchronously* or *immediately*.
         *
         * Optionally, you can pass some **data** along with the event.
         * For events published by a model, this can be any arbitrary value or object.
         * See View's [publish]{@link View#publish} method for restrictions in passing data from a view to a model.
         *
         * If you subscribe inside the model to an event that is published by the model,
         * the handler will be called immediately, before the publish method returns.
         * If you want to have it handled asynchronously, you can use a future message:
         * `this.future(0).publish("scope", "event", data)`.
         *
         * Note that there is no way of testing whether subscriptions exist or not (because models can exist independent of views).
         * Publishing an event that has no subscriptions is about as cheap as that test would be, so feel free to always publish,
         * there is very little overhead.
         *
         * Example:
         * ```
         * this.publish("something", "changed");
         * this.publish(this.id, "moved", this.pos);
         * ```
         * @param {String} scope see [subscribe]{@link Model#subscribe}()
         * @param {String} event see [subscribe]{@link Model#subscribe}()
         * @param {*=} data can be any value or object
         * @public
         */
        publish<T>(scope: string, event: string, data?: T): void;

        /**
         * **Register an event handler for an event published to a scope.**
         *
         * Both `scope` and `event` can be arbitrary strings.
         * Typically, the scope would select the object (or groups of objects) to respond to the event,
         * and the event name would select which operation to perform.
         *
         * A commonly used scope is `this.id` (in a model) and `model.id` (in a view) to establish
         * a communication channel between a model and its corresponding view.
         *
         * You can use any literal string as a global scope, or use [`this.sessionId`]{@link Model#sessionId} for a
         * session-global scope (if your application supports multipe sessions at the same time).
         * The predefined events [`"view-join"`]{@link event:view-join} and [`"view-exit"`]{@link event:view-exit}
         * use this session scope.
         *
         * The handler must be a method of `this`, e.g. `subscribe("scope", "event", this.methodName)` will schedule the
         * invocation of `this["methodName"](data)` whenever `publish("scope", "event", data)` is executed.
         *
         * If `data` was passed to the [publish]{@link Model#publish} call, it will be passed as an argument to the handler method.
         * You can have at most one argument. To pass multiple values, pass an Object or Array containing those values.
         * Note that views can only pass serializable data to models, because those events are routed via a reflector server
         * (see [View.publish]{@link View#publish}).
         *
         * Example:
         * ```
         * this.subscribe("something", "changed", this.update);
         * this.subscribe(this.id, "moved", this.handleMove);
         * ```
         * Example:
         * ```
         * class MyModel extends Multisynq.Model {
         *   init() {
         *     this.subscribe(this.id, "moved", this.handleMove);
         *   }
         *   handleMove({x,y}) {
         *     this.x = x;
         *     this.y = y;
         *   }
         * }
         * class MyView extends Multisynq.View {
         *   constructor(model) {
         *     this.modelId = model.id;
         *   }
         *   onpointermove(evt) {
         *      const x = evt.x;
         *      const y = evt.y;
         *      this.publish(this.modelId, "moved", {x,y});
         *   }
         * }
         * ```
         * @param {String} scope - the event scope (to distinguish between events of the same name used by different objects)
         * @param {String} event - the event name (user-defined or system-defined)
         * @param {Function|String} handler - the event handler (must be a method of `this`, or the method name as string)
         * @return {this}
         * @public
         */
        subscribe<T>(
            scope: string,
            event: string,
            handler: SubscriptionHandler<T>,
        ): void;

        /**
         * Unsubscribes this model's handler for the given event in the given scope.
         * @param {String} scope see [subscribe]{@link Model#subscribe}
         * @param {String} event see [subscribe]{@link Model#subscribe}
         * @param {Function=} handler - the event handler (if not given, all handlers for the event are removed)
         * @public
         */
        unsubscribe<T>(
            scope: string,
            event: string,
            handler?: SubscriptionHandler<T>,
        ): void;

        /**
         * Unsubscribes all of this model's handlers for any event in any scope.
         * @public
         */
        unsubscribeAll(): void;

        /**
         * Scope, event, and source of the currently executing subscription handler.
         *
         * The `source' is either `"model"` or `"view"`.
         *
         * ```
         * // this.subscribe("*", "*", this.logEvents)
         * logEvents(data: any) {
         *     const {scope, event, source} = this.activeSubscription!;
         *     console.log(`${this.now()} Event in model from ${source} ${scope}:${event} with`, data);
         * }
         * ```
         * @returns {Object} `{scope, event, source}` or `undefined` if not in a subscription handler.
         * @since 2.0
         * @public
         */
        get activeSubscription(): EventType | undefined;

        /**
         * **Schedule a message for future execution**
         *
         * Use a future message to automatically advance time in a model,
         * for example for animations.
         * The execution will be scheduled `tOffset` milliseconds into the future.
         * It will run at precisely `this.now() + tOffset`.
         *
         * Use the form `this.future(100).methodName(args)` to schedule the execution
         * of `this.methodName(args)` at time `this.now() + tOffset`.
         *
         * **Hint**: This would be an unusual use of `future()`, but the `tOffset` given may be `0`,
         * in which case the execution will happen asynchronously before advancing time.
         * This is the only way for asynchronous execution in the model since you must not
         * use Promises or async functions in model code (because a snapshot may happen at any time
         * and it would not capture those executions).
         *
         * **Note:** the recommended form given above is equivalent to `this.future(100, "methodName", arg1, arg2)`
         * but makes it more clear that "methodName" is not just a string but the name of a method of this object.
         * Also, this will survive minification.
         * Technically, it answers a [Proxy]{@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Proxy}
         * that captures the name and arguments of `.methodName(args)` for later execution.
         *
         * See this [tutorial]{@tutorial 1_1_hello_world} for a complete example.
         *
         * Example: single invocation with two arguments
         * ```
         * this.future(3000).say("hello", "world");
         * ```
         * Example: repeated invocation with no arguments
         * ```
         * tick() {
         *     this.n++;
         *     this.publish(this.id, "count", {time: this.now(), count: this.n)});
         *     this.future(100).tick();
         * }
         * ```
         * @param {Number} tOffset - time offset in milliseconds, must be >= 0
         * @returns {this}
         * @public
         */
        future<T extends any[]>(tOffset?:number, method?: FutureHandler<T>, ...args: T): this;

        /**
         * **Cancel a previously scheduled future message**
         *
         * This unschedules the invocation of a message that was scheduled with [future]{@link Model#future}.
         * It is okay to call this method even if the message was already executed or if it was never scheduled.
         *
         * **Note:** as with [future]{@link Model#future}, the recommended form is to pass the method itself,
         * but you can also pass the name of the method as a string.
         *
         * @example
         * this.future(3000).say("hello", "world");
         * ...
         * this.cancelFuture(this.say);
         * @param {Function} method - the method (must be a method of `this`)
         * @returns {Boolean} true if the message was found and canceled, false otherwise
         * @since 1.1.0-16
         * @public
        */
        cancelFuture<T extends any[]>(method: FutureHandler<T>): boolean;

        /** **Generate a synchronized pseudo-random number**
         *
         * This returns a floating-point, pseudo-random number in the range 0–1 (inclusive of 0, but not 1)
         * with approximately uniform distribution over that range
         * (just like [Math.random](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random)).
         *
         * Since the model computation is synchronized for every user on their device, the sequence of random numbers
         * generated must also be exactly the same for everyone. This method provides access to such a random number generator.
        */
        random(): number;

        /** **The model's current time**
         *
         * Every [event handler]{@link Model#subscribe} and [future message]{@link Model#future} is run at a precisely defined moment
         * in virtual model time, and time stands still while this execution is happening. That means if you were to access this.now()
         * in a loop, it would never answer a different value.
         *
         * The unit of now is milliseconds (1/1000 second) but the value can be fractional, it is a floating-point value.
         */
        now(): number;

        /** Make this model globally accessible under the given name. It can be retrieved from any other model in the same session
         * using [wellKnownModel()]{@link Model#wellKnownModel}.
         *
         * Hint: Another way to make a model well-known is to pass a name as second argument to [Model.create()]{@link Model#create}.
         *
         * Example:
         * ```
         *  class FooManager extends Multisynq.Model {
         *      init() {
         *          this.beWellKnownAs("UberFoo");
         *      }
         *  }
         *  class Underlings extends Multisynq.Model {
         *      reportToManager(something) {
         *          this.wellKnownModel("UberFoo").report(something);
         *      }
         *  }
         * ```*/
        beWellKnownAs(name: string): void;

        /** Access a model that was registered previously using beWellKnownAs().
         *
         * Note: The instance of your root Model class is automatically made well-known as `"modelRoot"`
         * and passed to the [constructor]{@link View#constructor} of your root View during [Session.join]{@link Session.join}.
         *
         * Example:
         * ```
         * const topModel = this.wellKnownModel("modelRoot");
         * ```
         */
        wellKnownModel<M extends Model>(name: string): Model | undefined;


        /** Look up a model in the current session given its `id`.
         *
         * Example:
         * ```
         * const otherModel = this.getModel(otherId);
         * ```
         */
        getModel<M extends Model>(id: string): M | undefined;

        /** This methods checks if it is being called from a model, and throws an Error otherwise.
         *
         * Use this to protect some model code against accidentally being called from a view.
         *
         * Example:
         * ```
         * get foo() { return this._foo; }
         * set foo(value) { this.modelOnly(); this._foo = value; }
         * ```*/
        modelOnly(errorMessage?: string): boolean;

        /**
         * **Create a serializable function that can be stored in the model.**
         *
         * Plain functions can not be serialized because they may contain closures that can
         * not be introspected by the snapshot mechanism. This method creates a serializable
         * "QFunc" from a regular function. It can be stored in the model and called like
         * the original function.
         *
         * The function can only access global references (like classes), *all local
         * references must be passed in the `env` object*. They are captured
         * as constants at the time the QFunc is created. Since they are constants,
         * re-assignments will throw an error.
         *
         * In a fat-arrow function, `this` is bound to the model that called `createQFunc`,
         * even in a different lexical scope. It is okay to call a model's `createQFunc` from
         * anywhere, e.g. from a view. QFuncs can be passed from view to model as arguments
         * in `publish()` (provided their environment is serializable).
         *
         * **Warning:** Minification can change the names of local variables and functions,
         * but the env will still use the unminified names. You need to disable
         * minification for source code that creates QFuncs with env. Alternatively, you can
         * pass the function's source code as a string, which will not be minified.
         *
         * Behind the scenes, the function is stored as a string and compiled when needed.
         * The env needs to be constant because the serializer would not able to capture
         * the values if they were allowed to change.
         *
         * @example
         * const template = { greeting: "Hi there," };
         * this.greet = this.createQFunc({template}, (name) => console.log(template.greeting, name));
         * this.greet(this, "friend"); // logs "Hi there, friend"
         * template.greeting = "Bye now,";
         * this.greet(this, "friend"); // logs "Bye now, friend"
         *
         * @param env - an object with references used by the function
         * @param func - the function to be wrapped, or a string with the function's source code
         * @returns a serializable function bound to the given environment
         * @public
         * @since 2.0
         */
        createQFunc<T extends Function>(env: QFuncEnv, func: T|string): T;
        createQFunc<T extends Function>(func: T|string): T;

        persistSession(func: () => any): void;

        /** **Identifies the shared session of all users**
         *
         * (as opposed to the [viewId]{@link View#viewId} which identifies the non-shared views of each user).
         *
         * The session id is used as "global" scope for events like [`"view-join"`]{@link event:view-join}.
         *
         * See {@link Session.join} for how the session id is generated.
         *
         * If your app has several sessions at the same time, each session id will be different.
         *
         * Example
         * ```
         * this.subscribe(this.sessionId, "view-join", this.addUser);
         * ```*/
        sessionId: string;

        /** **The number of users currently in this session.**
         *
         * All users in a session share the same Model (meaning all model objects) but each user has a different View
         * (meaning all the non-model state). This is the number of views currently sharing this model.
         * It increases by 1 for every [`"view-join"`]{@link event:view-join}
         * and decreases by 1 for every [`"view-exit"`]{@link event:view-exit} event.
         *
         * Example
         * ```
         * this.subscribe(this.sessionId, "view-join", this.showUsers);
         * this.subscribe(this.sessionId, "view-exit", this.showUsers);
         * showUsers() { this.publish(this.sessionId, "view-count", this.viewCount); }
         * ```*/
        viewCount: number;

        /** make module exports accessible via any subclass */
        static Multisynq: Multisynq;
    }

    export type ViewLocation = {
        country: string;
        region: string;
        city?: {
            name: string;
            lat: number;
            lng: number;
        }
    }

    /** payload of view-join and view-exit if viewData was passed in Session.join */
    export type ViewInfo<T> = {
        viewId: string; // set by reflector
        viewData: T; // passed in Session.join
        location?: ViewLocation; // set by reflector if enabled in Session.join
    };

    export type ViewSubOptions = {
        handling?: "queued" | "oncePerFrame" | "immediate";
    };

    export class View extends PubSubParticipant<ViewSubOptions> {
        /**
         * A View instance is created in {@link Session.join}, and the root model is passed into its constructor.
         *
         * This inherited constructor does not use the model in any way.
         * Your constructor should recreate the view state to exactly match what is in the model.
         * It should also [subscribe]{@link View#subscribe} to any changes published by the model.
         * Typically, a view would also subscribe to the browser's or framework's input events,
         * and in response [publish]{@link View#publish} events for the model to consume.
         *
         * The constructor will, however, register the view and assign it an [id]{@link View#id}.
         *
         * **Note:** When your view instance is no longer needed, you must [detach]{@link View#detach} it.
         * Otherwise it will be kept in memory forever.
         *
         * @param {Model} model - the view's model
         * @public
         */
        constructor(model: Model);

        /**
         * **Unsubscribes all [subscriptions]{@link View#subscribe} this model has,
         * and removes it from the list of views**
         *
         * This needs to be called when a view is no longer needed to prevent memory leaks.
         *
         * Example:
         * ```
         * removeChild(child) {
         *    const index = this.children.indexOf(child);
         *    this.children.splice(index, 1);
         *    child.detach();
         * }
         * ```
         * @public
         */
        detach(): void;

        /**
         * **Publish an event to a scope.**
         *
         * Events are the main form of communication between models and views in Multisynq.
         * Both models and views can publish events, and subscribe to each other's events.
         * Model-to-model and view-to-view subscriptions are possible, too.
         *
         * See [Model.subscribe]{@link Model#subscribe} for a discussion of **scopes** and **event names**.
         *
         * Optionally, you can pass some **data** along with the event.
         * For events published by a view and received by a model,
         * the data needs to be serializable, because it will be sent via the reflector to all users.
         * For view-to-view events it can be any value or object.
         *
         * Note that there is no way of testing whether subscriptions exist or not (because models can exist independent of views).
         * Publishing an event that has no subscriptions is about as cheap as that test would be, so feel free to always publish,
         * there is very little overhead.
         *
         * Example:
         * ```
         * this.publish("input", "keypressed", {key: 'A'});
         * this.publish(this.model.id, "move-to", this.pos);
         * ```
         * @param {String} scope see [subscribe]{@link Model#subscribe}()
         * @param {String} event see [subscribe]{@link Model#subscribe}()
         * @param {*=} data can be any value or object (for view-to-model, must be serializable)
         * @public
         */
        publish<T>(scope: string, event: string, data?: T): void;

        /**
         * **Register an event handler for an event published to a scope.**
         *
         * Both `scope` and `event` can be arbitrary strings.
         * Typically, the scope would select the object (or groups of objects) to respond to the event,
         * and the event name would select which operation to perform.
         *
         * A commonly used scope is `this.id` (in a model) and `model.id` (in a view) to establish
         * a communication channel between a model and its corresponding view.
         *
         * Unlike in a model's [subscribe]{@link Model#subscribe} method, you can specify when the event should be handled:
         * - **Queued:** The handler will be called on the next run of the [main loop]{@link Session.join},
         *   the same number of times this event was published.
         *   This is useful if you need each piece of data that was passed in each [publish]{@link Model#publish} call.
         *
         *   An example would be log entries generated in the model that the view is supposed to print.
         *   Even if more than one log event is published in one render frame, the view needs to receive each one.
         *
         *   **`{ event: "name", handling: "queued" }` is the default.  Simply specify `"name"` instead.**
         *
         * - **Once Per Frame:** The handler will be called only _once_ during the next run of the [main loop]{@link Session.join}.
         *   If [publish]{@link Model#publish} was called multiple times, the handler will only be invoked once,
         *   passing the data of only the last `publish` call.
         *
         *   For example, a view typically would only be interested in the current position of a model to render it.
         *   Since rendering only happens once per frame, it should subscribe using the `oncePerFrame` option.
         *   The event typically would be published only once per frame anyways, however,
         *   while the model is catching up when joining a session, this would be fired rapidly.
         *
         *   **`{ event: "name", handling: "oncePerFrame" }` is the most efficient option, you should use it whenever possible.**
         *
         * - **Immediate:** The handler will be invoked _synchronously_ during the [publish]{@link Model#publish} call.
         *   This will tie the view code very closely to the model simulation, which in general is undesirable.
         *   However, if the view needs to know the exact state of the model at the time the event was published,
         *   before execution in the model proceeds, then this is the facility to allow this without having to copy model state.
         *
         *   Pass `{event: "name", handling: "immediate"}` to enforce this behavior.
         *
         * The `handler` can be any callback function.
         * Unlike a model's [handler]{@link Model#subscribe} which must be a method of that model,
         * a view's handler can be any function, including fat-arrow functions declared in-line.
         * Passing a method like in the model is allowed too, it will be bound to `this` in the subscribe call.
         *
         * Example:
         * ```
         * this.subscribe("something", "changed", this.update);
         * this.subscribe(this.id, {event: "moved", handling: "oncePerFrame"}, pos => this.sceneObject.setPosition(pos.x, pos.y, pos.z));
         * ```
         * @tutorial 1_4_view_smoothing
         * @param {String} scope - the event scope (to distinguish between events of the same name used by different objects)
         * @param {String|Object} eventSpec - the event name (user-defined or system-defined), or an event handling spec object
         * @param {String} eventSpec.event - the event name (user-defined or system-defined)
         * @param {String} eventSpec.handling - `"queued"` (default), `"oncePerFrame"`, or `"immediate"`
         * @param {Function} handler - the event handler (can be any function)
         * @return {this}
         * @public
         */
        subscribe(
            scope: string,
            eventSpec:
                | string
                | { event: string; handling: "queued" | "oncePerFrame" | "immediate" },
            callback: (e: any) => void,
        ): void;

        /**
         * Unsubscribes this view's handler for the given event in the given scope.
         * @param {String} scope see [subscribe]{@link View#subscribe}
         * @param {String} event see [subscribe]{@link View#subscribe}
         * @param {Function=} handler - the event handler (if not given, all handlers for the event are removed)
         * @public
         */
        unsubscribe<T>(
            scope: string,
            event: string,
            handler?: SubscriptionHandler<T>,
        ): void;

        /**
         * Unsubscribes all of this views's handlers for any event in any scope.
         * @public
         */
        unsubscribeAll(): void;

        /**
         * Scope, event, and source of the currently executing subscription handler.
         *
         * The `source' is either `"model"` or `"view"`.
         *`
         * ```
         * // this.subscribe("*", "*", this.logEvents)
         * logEvents(data: any) {
         *     const {scope, event, source} = this.activeSubscription;
         *     console.log(`Event in view from ${source} ${scope}:${event} with`, data);
         * }
         * ```
         * @returns {Object} `{scope, event, source}` or `undefined` if not in a subscription handler.
         * @since 2.0
         * @public
         */
        get activeSubscription(): EventType | undefined;

        /**
         * The ID of the view.
         * @public
         */
        viewId: string;

        /** **Schedule a message for future execution**
         * This method is here for symmetry with [Model.future]{@link Model#future}.
         *
         * It simply schedules the execution using `window.setTimeout`.
         * The only advantage to using this over setTimeout() is consistent style.
         */
        future(tOffset: number): this;

        /** **Answers `Math.random()`**
         *
         * This method is here purely for symmetry with [Model.random]{@link Model#random}.
         */
        random(): number;

        /** **The model's current time**
         *
         * This is the time of how far the model has been simulated.
         * Normally this corresponds roughly to real-world time, since the reflector is generating
         * time stamps based on real-world time.
         *
         * If there is [backlog]{@link View#externalNow} however (e.g while a newly joined user is catching up),
         * this time will advance much faster than real time.
         *
         * The unit is milliseconds (1/1000 second) but the value can be fractional, it is a floating-point value.
         *
         * Returns: the model's time in milliseconds since the first user created the session.
        */
        now(): number;

        /** **The latest timestamp received from reflector**
         *
         * Timestamps are received asynchronously from the reflector at the specified tick rate.
         * [Model time]{@View#now} however only advances synchronously on every iteration of the [main loop]{@link Session.join}.
         * Usually `now == externalNow`, but if the model has not caught up yet, then `now < externalNow`.
         *
         * We call the difference "backlog". If the backlog is too large, Multisynq will put an overlay on the scene,
         * and remove it once the model simulation has caught up. The `"synced"` event is sent when that happens.
         *
         * The `externalNow` value is rarely used by apps but may be useful if you need to synchronize views to real-time.
         *
         * Example:
         * ```
         * const backlog = this.externalNow() - this.now();
         * ```
        */
        externalNow(): number;

        /**
         * **The model time extrapolated beyond latest timestamp received from reflector**
         *
         * Timestamps are received asynchronously from the reflector at the specified tick rate.
         * In-between ticks or messages, neither [now()]{@link View#now} nor [externalNow()]{@link View#externalNow} advances.
         * `extrapolatedNow` is `externalNow` plus the local time elapsed since that timestamp was received,
         * so it always advances.
         *
         * `extrapolatedNow()` will always be >= `now()` and `externalNow()`.
         * However, it is only guaranteed to be monotonous in-between time stamps received from the reflector
         * (there is no "smoothing" to reconcile local time with reflector time).
         */
        extrapolatedNow(): number;

        /** Called on the root view from [main loop]{@link Session.join} once per frame. Default implementation does nothing.
         *
         * Override to add your own view-side input polling, rendering, etc.
         *
         * If you want this to be called for other views than the root view,
         * you will have to call those methods from the root view's `update()`.
         *
         * The time received is related to the local real-world time. If you need to access the model's time, use [this.now()]{@link View#now}.
        */
        update(time: number): void;

        /** Access a model that was registered previously using beWellKnownAs().
         *
         * Note: The instance of your root Model class is automatically made well-known as `"modelRoot"`
         * and passed to the [constructor]{@link View#constructor} of your root View during [Session.join]{@link Session.join}.
         *
         * Example:
         * ```
         * const topModel = this.wellKnownModel("modelRoot");
         * ```
         */
        wellKnownModel<M extends Model>(name: string): Model | undefined;

        /** Access the session object.
         *
         * Note: The view instance may be taken down and reconstructed during the lifetime of a session. the `view` property of the session may differ from `this`, when you store the view instance in our data structure outside of Multisynq and access it sometime later.
         * @public
         */

        get session(): MultisynqSession<View>;

        /** make module exports accessible via any subclass */
        static Multisynq: Multisynq;
    }

    export type MultisynqSession<V extends View> = {
        id: string;
        view: V;
        step: (time: number) => void;
        leave: () => Promise<void>;
        data: {
            fetch: (handle: DataHandle) => Promise<ArrayBuffer>;
            store: (
                data: ArrayBuffer,
                options?: { shareable?: boolean; keep?: boolean },
            ) => Promise<DataHandle>;
            toId: (handle: DataHandle) => string;
            fromId: (id: string) => DataHandle;
        };
    };

    export type MultisynqModelOptions = object;
    export type MultisynqViewOptions = object;

    export type MultisynqDebugOption =
        | "session"
        | "messages"
        | "sends"
        | "snapshot"
        | "data"
        | "hashing"
        | "subscribe"
        | "publish"
        | "events"
        | "classes"
        | "ticks"
        | "write"
        | "offline";

    type ClassOf<M> = new (...args: any[]) => M;

    export type MultisynqSessionParameters<M extends Model, V extends View, T> = {
        apiKey?: string;
        appId: string;
        name?: string | Promise<string>;
        password?: string | Promise<string>;
        model: ClassOf<M>;
        view?: ClassOf<V>;
        options?: MultisynqModelOptions;
        viewOptions?: MultisynqViewOptions;
        viewData?: T;
        location?: boolean;
        step?: "auto" | "manual";
        tps?: number | string;
        autoSleep?: number | boolean;
        rejoinLimit?: number;
        eventRateLimit?: number;
        reflector?: string;
        files?: string;
        box?: string;
        debug?: MultisynqDebugOption | Array<MultisynqDebugOption>;
    };

    export namespace Session {
        function join<M extends Model, V extends View, T>(
            parameters: MultisynqSessionParameters<M, V, T>,
        ): Promise<MultisynqSession<V>>;
    }

    export var Constants: Record<string, any>;

    export const VERSION: string;

    interface IApp {
        sessionURL: string;
        root: HTMLElement | null;
        sync: boolean;
        messages: boolean;
        badge: boolean;
        stats: boolean;
        qrcode: boolean;
        makeWidgetDock(options?: {
            debug?: boolean;
            iframe?: boolean;
            badge?: boolean;
            qrcode?: boolean;
            stats?: boolean;
            alwaysPinned?: boolean;
            fixedSize?: boolean;
        }): void;
        makeSessionWidgets(sessionId: string): void;
        makeQRCanvas(options?: {
            text?: string;
            width?: number;
            height?: number;
            colorDark?: string;
            colorLight?: string;
            correctLevel?: "L" | "M" | "Q" | "H";
        }): HTMLCanvasElement | null;
        clearSessionMoniker(): void;
        showSyncWait(bool: boolean): void;
        messageFunction(
            msg: string,
            options?: {
                duration?: number;
                gravity?: "bottom" | "top";
                position?: "right" | "left" | "center" | "bottom";
                backgroundColor?: string;
                stopOnFocus?: boolean;
            },
        ): void;
        showMessage(msg: string, options?: Record<string, unknown>): void;
        isMultisynqHost(hostname: string): boolean;
        referrerURL(): string;
        autoSession: (options?: {
            key?: string;
            force?: boolean;
            default?: string;
            keyless?: boolean;
        }) => Promise<string>;
        autoPassword: (options?: {
            key?: string;
            default?: string;
            force?: boolean;
            scrub?: boolean;
            keyless?: boolean;
        }) => Promise<string>;
        randomSession: (len?: number) => string;
        randomPassword: (len?: number) => string;
    }

    /**
     * The App API is under construction.
     *
     * @public
     */

    export var App:IApp;


    interface DataHandle {
        store(
            sessionId: string,
            data: string | ArrayBuffer,
            keep?: boolean,
        ): Promise<DataHandle>;
        fetch(sessionid: string, handle: DataHandle): string | ArrayBuffer;
        hash(data: unknown, output?: string): string;
    }

    /**
     * The Data API is under construction.
     *
     * @public
     */

    export var Data: DataHandle;


    type Multisynq = {
        Model: typeof Model;
        View: typeof View;
        Session: typeof Session;
        Data: DataHandle;
        Constants: typeof Constants;
        App: IApp;
    };
}
