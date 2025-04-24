Copyright © 2025 Croquet Labs

Snapshots are copies of the model state that are saved to the cloud. When your Multisynq application is running, the reflector will periodically request one of the participants to perform a snapshot.

Snapshots provide automatic save functionality for your application. If you quit or reload while your application is running, it will automatically reload the last snapshot when the application restarts.

(When you write your initialization routine for your View, take into account that the Model may just have reloaded from a prior snapshot.)

More importantly, snapshots are how new users synchronize when they join an existing session. When you join an existing session, the following series of events will occur:

1. The local model is initialized with data from the last snapshot.
2. The reflector resends the local model all events that were transmitted after the last snapshot was taken.
3. The model simulates all the events to bring the snapshot up-to-date
4. The local view initializes itself to match the state of the model and subscribes to model events

The combination of loading the last snapshot and replaying all the intervening events brings the new user in sync with the other users in the session.

## Snapshot Performance

The snapshot code is currently unoptimized, so you may experience a performance hitch when the snapshot is taken. The Multisynq development team is working to resolve this issue and make snapshots invisible to both the user and developer, but for the time being you may see your application occasionally pause if your model is very large.
