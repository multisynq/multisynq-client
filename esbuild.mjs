import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const VERSION = pkg.version;
const AUTHOR = pkg.author;

const croquetPkg = JSON.parse(fs.readFileSync('node_modules/@croquet/croquet/package.json', 'utf8'));
const CROQUET_VERSION = croquetPkg.version;

const date = new Date();

function banner(bundledCroquet) {
  return { js:
    `// (C) ${date.getFullYear()} ${AUTHOR}\n` +
    `// Multisynq Client v${VERSION}\n` +
    (bundledCroquet
      ? `// Using Croquet v${CROQUET_VERSION}\n`
      : '') +
    `// Built on ${date.toISOString()}\n`
  };
}

const COMMON = {
  entryPoints: ['multisynq-client.ts'],
  bundle: true,
  sourcemap: true,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.MULTISYNQ_VERSION': `"${VERSION}"`,
  },
};


esbuild.build({
  ...COMMON,
  format: 'esm',
  outfile: 'dist/multisynq-client.mjs',
  external: ['*'], // do not bundle any dependencies (i.e. @croquet/croquet)
  banner: banner(false),
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    outfile: 'dist/multisynq-client.cjs',
    external: ['*'], // do not bundle any dependencies (i.e. @croquet/croquet))
    banner: banner(false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'iife',
    outfile: 'bundled/multisynq-client.min.js',
    globalName: 'Multisynq',
    banner: banner(true), // Croquet is bundled in this version
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    outfile: 'bundled/multisynq-client.esm.js',
    banner: banner(true), // Croquet is bundled in this version
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.cjs',
    external: ['*'], // do not bundle any dependencies (i.e. @croquet/croquet))
    banner: banner(false),
  });
}).then(() => {
  esbuild.build({
    ...COMMON,
    format: 'esm',
    platform: 'node',
    outfile: 'dist/multisynq-client-node.mjs',
    external: ['*'], // do not bundle any dependencies (i.e. @croquet/croquet))
    banner: banner(false),
  });
}).then(() => {
  generateTypes();
});


function generateTypes() {
  // copy the types.d.ts file from @croquet/croquet to dist/multisynq-client.d.ts
  // and change the names to Multisynq
  const inputFile = path.join('node_modules', '@croquet', 'croquet', 'types.d.ts');
  const outputFile = path.join('dist', 'multisynq-client.d.ts');
  const data = fs.readFileSync(inputFile, 'utf8');
  const modifiedData = data
    .replace(/@croquet\/croquet/g, '@multisynq/client')
    .replace(/Croquet/g, 'Multisynq');
  fs.writeFileSync(outputFile, modifiedData, 'utf8');
}

