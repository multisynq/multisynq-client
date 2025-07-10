# How to release

We basically need to do a package release for every `@croquet/croquet` release. Then release / update all the downstream packages / repos:

[ ] release new client from this repo via `npm publish`
  - replace old version number with new version number in README
  - commit with a message ending in the version number (e.g. "Prerelease 1.1.0-0")
  - `npm run build`, make sure it prints the version number correctly (without any +... extension, "bumped" and "clean" should both be true)
    ```
    Building Multisynq 1.1.0-0
      bumped: true, clean: true
    ```
  - test, push
  - for release: `npm publish` (and continue with next steps)
  - for prerelease: `npm publish --tag pre` (and skip the rest)

[ ] in the `croquet-docs` repo, rebuild `multisynq` docs

    cd ../croquet-docs/multisynq
    npm run build
    open ../dist/multisynq/multisynq/index.html

[ ] copy resulting docs to `multisynq.io` repo, push to dev, double-check multisynq.dev, merge into `main`, push, double-check multisynq.io

    cd ../../multisynq.io/multisynq/frontend/public/docs
    rm -r client
    cp -r ../../../../../croquet-docs/dist/multisynq/multisynq client

## Downstream projects

*Decide which of these need to be updated depending on what changes were made to the Croquet library*

[ ] release `multisynq-react` with new dependency

[ ] update multisynq-react-mondrian example (depends on `multisynq-react`)

[ ] release `react-together` with new dependency (depends on `multisynq-react`)

[ ] release `react-together-primereact` with new dependency (depends on `react-together`)

[ ] release `react-together-ant-design` with new dependency (depends on `react-together`)

[ ] update multiblaster

[ ] update multicar

[ ] update apps.multisynq.io
