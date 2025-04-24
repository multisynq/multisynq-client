# Multisynq Docs

The docs are deployed at https://multisynq.io/docs/client and https://multisynq.io/docs/client.

## Building
The doc generator and theme are in the `croquet-docs` repo: https://github.com/croquet/croquet-docs/

The Croquet sources are at https://github.com/croquet/croquet/

It expects `multisync-client` and `croquet` to be checked out next to `croquet-docs`.

    ├── multisync-client
    │   └── docs         (this directory)
    │
    ├── croquet
    │
    └── croquet-docs
        └── croquet

If that's all in place, you can build the multisynq docs using `npm run build` or `npm run watch` in the `croquet-docs/multisync-client` directory.

The doc generator uses [JSDoc](https://jsdoc.app) to build the class documentation from structured comments in the source code (see [packages/croquet/teatime/src](https://github.com/croquet/croquet/tree/main/packages/croquet/teatime/src), in particular `index.js`, `model.js`, `view.js`, `session.js`), as well as tutorials from markdown files in this directory.

