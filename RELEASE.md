# How to release

The multisynq client release consists of publishing the new npm and updating the docs:

[ ] release new client from this repo via `npm publish`
  - replace old version number with new version number in package.json and README
  - commit with a message ending in the version number (e.g. "Prerelease 1.1.0-0" or "Release 1.1.0")
  - `npm run build`, make sure it prints the version number correctly (without any +... extension, "bumped" and "clean" should both be true)
    ```
    Building Multisynq 1.1.0-0
      bumped: true, clean: true
    ```
  - test, push
  - for release: `npm publish` (and continue with next steps)
  - for prerelease: `npm publish --tag pre` (and skip the rest)

[ ] update docs **tbd**

## Downstream projects

*Decide which of these need to be updated depending on what changes were made to the library*

[ ] release `multisynq-react` with new dependency

[ ] update multisynq-react-mondrian example (depends on `multisynq-react`)

[ ] release `react-together` with new dependency (depends on `multisynq-react`)

[ ] release `react-together-primereact` with new dependency (depends on `react-together`)

[ ] release `react-together-ant-design` with new dependency (depends on `react-together`)

[ ] update multiblaster

[ ] update multicar

[ ] update apps.multisynq.io
