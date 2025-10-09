#!/usr/bin/env node

/**
 * Build script using esbuild for TypeScript compilation and minification
 * Provides significant size reduction compared to tsc
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

console.log('[Build] Starting esbuild compilation...');
console.log(`[Build] Mode: ${isDev ? 'development' : 'production'}`);
console.log(`[Build] Watch: ${isWatch ? 'enabled' : 'disabled'}`);

// Clean lib directory
const libDir = path.join(__dirname, '../lib');
if (fs.existsSync(libDir)) {
  console.log('[Build] Cleaning lib directory...');
  fs.rmSync(libDir, { recursive: true, force: true });
}

// Get all TypeScript entry points
function getEntryPoints() {
  const entryPoints = [];
  const srcDir = path.join(__dirname, '../src');

  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
        entryPoints.push(fullPath);
      }
    }
  }

  scanDirectory(srcDir);
  return entryPoints;
}

const entryPoints = getEntryPoints();
console.log(`[Build] Found ${entryPoints.length} TypeScript files to compile`);

// Native modules that must be external
const nativeModules = ['better-sqlite3'];

// Electron built-in modules that must be external
const electronModules = [
  'electron',
  'electron-log',
  'electron-store',
  'electron-unhandled',
  'electron-update-notifier',
  'electron-context-menu',
  'auto-launch',
  'v8-compile-cache',
];

// esbuild configuration
const buildOptions = {
  entryPoints,
  outdir: 'lib',
  outbase: 'src',
  platform: 'node',
  target: 'node22',
  format: 'cjs',

  // Bundling strategy (production: bundle dependencies, dev: compile only)
  bundle: !isDev,
  splitting: false,

  // External modules (Electron built-ins and native modules)
  external: isDev ? [] : [...electronModules, ...nativeModules],

  // Minification (production only)
  minify: !isDev,
  minifyWhitespace: !isDev,
  minifyIdentifiers: !isDev,
  minifySyntax: !isDev,

  // Source maps (development only)
  sourcemap: isDev,

  // Advanced optimizations
  treeShaking: true,
  legalComments: 'none',
  keepNames: false,

  // Logging
  logLevel: 'info',
  color: true,
};

async function build() {
  try {
    const startTime = Date.now();

    if (isWatch) {
      const context = await esbuild.context(buildOptions);
      await context.watch();
      console.log('[Build] ✅ Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`[Build] ✅ Compilation completed in ${duration}s`);

      if (result.warnings.length > 0) {
        console.warn(`[Build] ⚠️  ${result.warnings.length} warnings`);
        result.warnings.forEach((warning) => console.warn(warning));
      }

      // Calculate size and track bundle metrics
      if (!isDev) {
        const libSize = getDirectorySize(libDir);
        const libSizeMB = (libSize / 1024 / 1024).toFixed(2);
        console.log(`[Build] Output size: ${libSizeMB} MB (${libSize.toLocaleString()} bytes)`);

        // Log top 10 largest files
        console.log('[Build] Top 10 largest files:');
        const files = getAllFiles(libDir);
        const fileSizes = files
          .map((file) => ({
            path: file.replace(libDir + '/', ''),
            size: fs.statSync(file).size,
          }))
          .sort((a, b) => b.size - a.size)
          .slice(0, 10);

        fileSizes.forEach((file, index) => {
          const sizeKB = (file.size / 1024).toFixed(1);
          console.log(`[Build]   ${index + 1}. ${file.path} (${sizeKB} KB)`);
        });

        // Track bundle size history
        const historyFile = path.join(__dirname, '../.build-history.json');
        let history = [];
        if (fs.existsSync(historyFile)) {
          history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        }

        history.push({
          timestamp: new Date().toISOString(),
          size: libSize,
          sizeMB: parseFloat(libSizeMB),
          fileCount: files.length,
        });

        // Keep only last 20 builds
        if (history.length > 20) {
          history = history.slice(-20);
        }

        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

        // Show size trend if we have history
        if (history.length > 1) {
          const previousSize = history[history.length - 2].sizeMB;
          const diff = parseFloat(libSizeMB) - previousSize;
          const diffPercent = ((diff / previousSize) * 100).toFixed(1);

          if (diff > 0) {
            console.log(`[Build] Size increased by ${diff.toFixed(2)} MB (+${diffPercent}%)`);
          } else if (diff < 0) {
            console.log(`[Build] Size decreased by ${Math.abs(diff).toFixed(2)} MB (${diffPercent}%)`);
          } else {
            console.log(`[Build] Size unchanged`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Build] ❌ Build failed:', error);
    process.exit(1);
  }
}

/**
 * Calculate directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  function scanDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDir(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  }

  if (fs.existsSync(dirPath)) {
    scanDir(dirPath);
  }

  return totalSize;
}

/**
 * Get all files in directory recursively
 */
function getAllFiles(dirPath) {
  const allFiles = [];

  function scanDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDir(filePath);
      } else {
        allFiles.push(filePath);
      }
    }
  }

  if (fs.existsSync(dirPath)) {
    scanDir(dirPath);
  }

  return allFiles;
}

// Run build
build();
