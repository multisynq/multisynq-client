import esbuild from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { replace } from 'esbuild-plugin-replace';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import inlineWorkerPlugin from './esbuild-plugin-inline-worker.mjs';

// We need a unique version string for each single build because this gets hashed
// into the Session ID instead of the whole library source code.
// The version string is derived from the package.json version and the git commit.
// release: x.y.z
// prerelease: x.y.z-v
// clean tree: x.y.z-v+branch.commit
// otherwise: x.y.z-v+branch.commit.user.date

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const sources = ["./multisynq-client.js", "./client", "./esbuild.mjs"]; // check if these are committed
const git_branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();                // current branch
const git_commit = execSync("git log -1 --pretty=format:%H  -- .").toString().trim();            // last commit hash
const git_date = execSync("git show --format='%as' -s " + git_commit).toString().trim();         // last commit date
const git_message = execSync("git show --format='%s' -s " + git_commit).toString().trim();       // last commit message
const git_bumped = git_message.endsWith(pkg.version);                                            // last commit was "changelog and version bump to x.y.z"
const git_clean = !execSync("git status --porcelain -- " + sources.join(" ")).toString().trim(); // relevant sources are committed

const release = !pkg.version.includes('-');
const prerelease = pkg.version.includes('-') && (git_branch === "main" || git_branch === "dev") && git_bumped && git_clean;

if (release) {
  // if you run into this error while developing, change the version in package.json to a prerelease version x.y.z-v
  if (!git_clean) throw Error(`Release build ${pkg.version} but git is not clean`);
  if (!git_bumped) throw Error(`Release build ${pkg.version} but not bumped`);
  if (git_branch !== "main") throw Error(`Release build ${pkg.version} but not on main branch`);
}

const date = new Date();

const VERSION = release || prerelease ? pkg.version
:  git_clean ? `${pkg.version}+${git_branch}.${git_commit}`
: `${pkg.version}+${git_branch}.${git_commit}.${os.userInfo().username}.${date.toISOString()}`;

console.log(`Building Multisynq ${VERSION}`);
console.log(`  bumped: ${git_bumped}, clean: ${git_clean}`);

// common options for all builds
const COMMON = {
  entryPoints: ['multisynq-client.js'],
  bundle: true,
  sourcemap: true,
  minify: false,
  banner: {
    js:
      `// (C) ${git_date.slice(0, 4)} ${pkg.author}\n` +
      `// Multisynq Client v${VERSION}\n` +
      `// Built on ${date.toISOString()}\n`
  },
};

const node_webrtc_import = `
    if (!globalThis.loadingDataChannel) {
        globalThis.loadingDataChannel = new Promise(resolve => {
            import('node-datachannel/polyfill')
            .then(polyfill => {
                globalThis.RTCPeerConnection = polyfill.RTCPeerConnection;
                return import('node-datachannel');
            }).then(ndc => {
                ndc.initLogger('Warning'); // 'Verbose' | 'Debug' | 'Info' | 'Warning' | 'Error' | 'Fatal';
                ndc.preload();
                resolve();
            });
        });
    }
    await globalThis.loadingDataChannel;
`;

function createPlugins(is_node, bundle_all, esm) {
  if (is_node && bundle_all) {
    throw new Error('Cannot bundle all modules in node');
  }
  // plugins for building worker (upload.worker.js)
  const workerPlugins = [
    replace({
      include: /\.js$/,
      exclude: /node_modules/,
      values: {
        '_IS_NODE_': is_node.toString(),
        '_MULTISYNQ_VERSION_': `"${VERSION}"`,
        '_IF_NODE_': (is_node ? '\n' : ''), // uncomment the rest of the line
      },
    }),
  ];
  // plugins for building client
  const plugins = [
    inlineWorkerPlugin({
      // config for building worker
      format: 'esm', // only esm appears to work, even in cjs builds
      minify: false,
      bundle: true, // bundle everything in the worker
      platform: is_node ? 'node' : 'browser',
      plugins: workerPlugins,
    }),
    // config for building client
    replace({
      include: /\.js$/,
      exclude: /node_modules/,
      values: {
        '_IS_NODE_': is_node.toString(),
        '_ENSURE_WEBSOCKET_': (is_node ? `\nimport * as _WS from 'ws';\nglobalThis.WebSocket = _WS.WebSocket;\n` : ''),
        '_ENSURE_WORKER_': (is_node ? `\nimport * as _WORKER_THREADS from 'worker_threads';\nglobalThis.Worker = _WORKER_THREADS.Worker;\n` : ''),
        '_ENSURE_RTCPEERCONNECTION_': (is_node ? node_webrtc_import : ''),
        '_HTML_MODULE_': (is_node ? 'node-html' : 'html'),
        '_URLOPTIONS_MODULE_': (is_node ? 'node-urlOptions' : 'urlOptions'),
        '_STATS_MODULE_': (is_node ? 'node-stats' : 'stats'),
        '_MESSENGER_MODULE_': (is_node ? 'node-messenger' : 'messenger'),
        '_MULTISYNQ_VERSION_': `"${VERSION}"`,
      },
    }),
  ];

  // by default, all modules are bundled
  if (!bundle_all) {
    // bundle internal modules but not node_modules
    plugins.push(nodeExternalsPlugin({
        allowList: [
          /^crypto-js/,
        ],
    }));
  }

  return plugins;
}

// build the client in various formats
esbuild.build({
  ...COMMON,
  format: 'esm',
  outfile: 'dist/multisynq-client.mjs.js',
  plugins: createPlugins(false, false, true),
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    outfile: 'dist/multisynq-client.cjs.js',
    plugins: createPlugins(false, false, false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'iife',
    outfile: 'bundled/multisynq-client.min.js',
    globalName: 'Multisynq',
    plugins: createPlugins(false, true, false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    outfile: 'bundled/multisynq-client.esm.js',
    plugins: createPlugins(false, true, true),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.cjs.js',
    plugins: createPlugins(true, false, false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.mjs.js',
    plugins: createPlugins(true, false, true),
  });
}).then(() => {
  generateTypes();
}).catch(error => {
  console.error(error);
  process.exit(1);
});


function generateTypes() {
  // copy the types.d.ts file from client/types.d.ts to dist/multisynq-client.d.ts
  // and change the names to Multisynq
  const inputFile = path.join('client', 'types.d.ts');
  const outputFile = path.join('dist', 'multisynq-client.d.ts');
  const data = fs.readFileSync(inputFile, 'utf8');
  const modifiedData = data
    .replace(/@croquet\/croquet/g, '@multisynq/client')
    .replace(/Croquet/g, 'Multisynq');
  fs.writeFileSync(outputFile, modifiedData, 'utf8');
}

