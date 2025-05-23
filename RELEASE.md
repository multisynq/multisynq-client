# How to release

We basically need to do a package release for every `@croquet/croquet` release. Then release / update all the downstream packages / repos:

* release new client from this repo via `npm publish`
* update `croquet-docs` repo `multisynq` folder, push
* copy resulting docs to `multisynq.io` repo, push to dev, double-check multisynq.dev, merge into `main`, push, double-check multisynq.io
* release `multisynq-react` with new dependency
* update multisynq-react-mondrian example
* release `react-together` with new dependency
* release `react-together-primereact` with new dependency
* release `react-together-ant-design` with new dependency
* update multiblaster
* update multicar
* update apps.multisynq.io
