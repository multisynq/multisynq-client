import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { replace } from 'esbuild-plugin-replace';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const VERSION = pkg.version;
const AUTHOR = pkg.author;

const date = new Date();

const COMMON = {
  entryPoints: ['multisynq-client.js'],
  bundle: true,
  sourcemap: true,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.MULTISYNQ_VERSION': `"${VERSION}"`,
  },
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

function createReplacePlugin(is_node) {
  return replace({
    include: /\.js$/,
    exclude: /node_modules/,
    values: {
      '_IS_NODE_': is_node.toString(),
      '_ENSURE_WEBSOCKET_': (is_node ? `\nimport * as _WS from 'ws';\nglobalThis.WebSocket = _WS.WebSocket;\n` : ''),
      '_ENSURE_RTCPEERCONNECTION_': (is_node ? node_webrtc_import : ''),
      '_HTML_MODULE_': (is_node ? 'node-html' : 'html'),
      '_URLOPTIONS_MODULE_': (is_node ? 'node-urlOptions' : 'urlOptions'),
      '_STATS_MODULE_': (is_node ? 'node-stats' : 'stats'),
      '_MESSENGER_MODULE_': (is_node ? 'node-messenger' : 'messenger')
    },
  });
}

esbuild.build({
  ...COMMON,
  format: 'esm',
  outfile: 'dist/multisynq-client.mjs',
  external: ['*'], // do not bundle any dependencies
  plugins: [
    createReplacePlugin(false),
  ],
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    outfile: 'dist/multisynq-client.cjs',
    external: ['*'], // do not bundle any dependencies
    plugins: [
      createReplacePlugin(false),
    ],
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'iife',
    outfile: 'bundled/multisynq-client.min.js',
    globalName: 'Multisynq',
    plugins: [
      createReplacePlugin(false),
    ],
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    outfile: 'bundled/multisynq-client.esm.js',
    plugins: [
      createReplacePlugin(false),
    ],
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.cjs',
    external: ['*'], // do not bundle any dependencies
    plugins: [
      createReplacePlugin(true),
    ],
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.mjs',
    external: ['*'], // do not bundle any dependencies
    plugins: [
      createReplacePlugin(true),
    ],
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

