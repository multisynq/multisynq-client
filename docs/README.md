# Multisynq Client Docs

These docs are automatically deployed at https://multisynq.github.io/multisynq-client/

## Building

To build the docs, use `build-docs.sh` which generates them into the `_site` directory.
This is also what the GitHub action uses to deploy them as GitHub pages.

It uses [JSDoc](https://jsdoc.app) to build the class documentation from structured comments in the source code (in particular `index.js`, `model.js`, `view.js`, `session.js`), as well as tutorials from markdown files in this directory.

