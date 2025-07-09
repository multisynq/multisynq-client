import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { replace } from 'esbuild-plugin-replace';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import inlineWorkerPlugin from './esbuild-plugin-inline-worker.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const VERSION = pkg.version;
const AUTHOR = pkg.author;

const date = new Date();

const COMMON = {
  entryPoints: ['multisynq-client.js'],
  bundle: true,
  sourcemap: true,
  minify: false,
  banner: {
    js:
      `// (C) ${date.getFullYear()} ${AUTHOR}\n` +
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
  // plugins for building worker
  const workerPlugins = [
    replace({
      include: /\.js$/,
      exclude: /node_modules/,
      values: {
        '_IS_NODE_': is_node.toString(),
        '_MULTISYNQ_VERSION_': `"${VERSION}"`,
        '_IMPORT_WORKER_THREADS_': (is_node ? `\nimport * as _WORKER_THREADS from 'worker_threads';\n` : ''),
      },
    }),
  ];
  if (!bundle_all) {
    workerPlugins.push(nodeExternalsPlugin({
      allowList: [
        /^crypto-js/,
        /^pako/,
      ],
    }));
  }
  // plugins for building client
  const plugins = [
    inlineWorkerPlugin({
      // config for building worker
      format: esm ? 'esm' : 'cjs',
      minify: false,
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

esbuild.build({
  ...COMMON,
  format: 'esm',
  outfile: 'dist/multisynq-client.mjs',
  plugins: createPlugins(false, false, true),
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    outfile: 'dist/multisynq-client.cjs',
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
    outfile: 'dist/multisynq-client-node.cjs',
    plugins: createPlugins(true, false, false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.mjs',
    plugins: createPlugins(true, false, true),
  });
}).then(() => {
  generateTypes();
});


function generateTypes() {
  // copy the types.d.ts file from @croquet/croquet to dist/multisynq-client.d.ts
  // and change the names to Multisynq
  const inputFile = path.join('client', 'types.d.ts');
  const outputFile = path.join('dist', 'multisynq-client.d.ts');
  const data = fs.readFileSync(inputFile, 'utf8');
  const modifiedData = data
    .replace(/@croquet\/croquet/g, '@multisynq/client')
    .replace(/Croquet/g, 'Multisynq');
  fs.writeFileSync(outputFile, modifiedData, 'utf8');
}

