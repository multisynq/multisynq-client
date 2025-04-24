Copyright © 2025 Croquet Labs

Unlike the view, there are limits to what the model can do if it is going to stay synched across all the machines in the session:

**Model classes must be registered when defined.** Call `MyModel.register("MyModel")` every time you define a new {@link Model} subclass.

**Use `create` and `destroy` to instantiate or dispose of models.** Do not use `new` to create sub-models. These models should be created/destroyed using the syntax `mySubModel.create()` and `mySubModel.destroy()`. Your `init` is called as part of the `create()` process.

**Use `init` to initialize models.** Do not implement a constructor. Model classes only call `init` when they are instantiated for the first time. Put all initialization code in this method. If you put initialization code in the constructor, it would also run when the model is reloaded from a snapshot.

**No global variables.** All variables in the model must be defined in the main model itself, or in sub-models instantiated by the main model. This way Multisynq can find them and save them to the snapshot. Instead, use Multisynq.Constants. The Constants object is recursively frozen once a session has started to avoid accidental modification. Here we assign the variable Q to Multisynq.Constants as a shorthand.

```
const Q = Multisynq.Constants;
Q.BALL_NUM = 25;              // how many balls do we want?
Q.STEP_MS = 1000 / 30;       // bouncing ball speed in virtual pixels / step
Q.SPEED = 10;                // max speed on a dimension, in units/s
```

This lets you use write ```this.future(Q.STEP_MS).step();``` where the STEP_MS value is registered and replicated. Just using a global STEP_MS could work in some cases, but there is no guarantee that the value will be replicated, so it could cause an accidental desyncing of the system.

**No regular classes.** All objects in the model must be derived from the Model base class. (Mostly. See below for more information.)

**No outside references.** The model must not use system services such as _Date.now()_, or reference JS globals such as _window_.

**No asynchronous functions.** Do not use _Promises_ or declare a function call with the _async_ keyword inside the model.

**Do not store function references or transmit them in events.** Functions cannot be serialized as part of the model state. (It's fine to use function references that exist temporarily, such as in a forEach call. You just shouldn't store them.)

**Don't query the view.** Don't publish events that trigger the view to respond to the model with another event. This can create a cascade of events that clogs the system.



## Advanced Topic: Non-Model Objects in the Model

In general, every object in the model should be a subclass of {@link Model}. However, sometimes it's useful to be able to use the occasional non-model utility class inside your model code. This is allowed, as long as you provide Multisynq with information about how to save and restore the non-model class.

Model classes that use non-model objects must include a special static method named `types()` that declares all of the non-model classes:

```
class MyModel extends Multisynq.Model {
    static types() {
        return {
            "MyFile.MyClass": MyClass,
        }
    }
}
```

This would use the default serializer to serialize the internals of that class. If you need to customize the serialization, add `write()` and `read()` methods that convert to and from the classes the serializer can handle (which is JSON plus built-in types like `Map`, `Set`, `Uint8Array` etc.):

```
class MyModel extends Multisynq.Model {
    static types() {
        return {
            "MyFile.MyClass": {
                cls: MyClass,
                write: c => ({x: c.x}),
                read: ({x}) => new MyClass(x)
            }
        }
    }
}
```

This example shows a type definition for a non-model class that stores a single piece of data, the variable x. It includes methods to extract the class data into a standard data format, and then restore a new version of the class from the stored data.
