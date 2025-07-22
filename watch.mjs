import chokidar from 'chokidar';
import { spawn } from 'child_process';

// Directories and files to watch
const watchPatterns = [
  'multisynq-client.js',
  'client',
  'esbuild.mjs',
  'esbuild-plugin-inline-worker.mjs'
];

console.log('Starting watch mode...');
console.log('Watching files:', watchPatterns);

// Debounce function to avoid multiple builds
let buildTimeout;
let isBuilding = false;
let initialBuildDone = false;

function debouncedBuild() {
  if (buildTimeout) {
    clearTimeout(buildTimeout);
  }
  buildTimeout = setTimeout(() => {
    if (!isBuilding) {
      if (initialBuildDone) {
        console.log('\n🔄 File change detected, rebuilding...');
      }
      runBuild();
    }
  }, 500); // 500ms debounce
}

function runBuild() {
  if (isBuilding) {
    console.log('⏳ Build already in progress, skipping...');
    return;
  }

  isBuilding = true;
  console.log('Running build...');
  const buildProcess = spawn('node', ['esbuild.mjs'], {
    stdio: 'inherit',
    shell: false
  });

  buildProcess.on('close', (code) => {
    isBuilding = false;
    if (code === 0) {
      console.log('✅ Build completed successfully');
      initialBuildDone = true;
    } else {
      console.log('❌ Build failed with code:', code);
    }
  });
}

// Initialize watcher
const watcher = chokidar.watch(watchPatterns, {
  ignored: [
    /(^|[\/\\])\../, // ignore dotfiles
    '**/node_modules/**',
    '**/dist/**',
    '**/bundled/**'
  ],
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 100
  }
});

// Watch events
watcher
  .on('ready', () => {
    console.log('👀 Watcher ready.');
  })
  .on('change', (path) => {
    console.log(`📝 File changed: ${path}`);
    debouncedBuild();
  })
  .on('add', (path) => {
    if (initialBuildDone) console.log(`➕ File added: ${path}`);
    debouncedBuild();
  })
  .on('unlink', (path) => {
    console.log(`🗑️  File removed: ${path}`);
    debouncedBuild();
  })
  .on('error', (error) => {
    console.error('Watcher error:', error);
  });

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping watch mode...');
  watcher.close();
  process.exit(0);
});

console.log('Press Ctrl+C to stop watching');