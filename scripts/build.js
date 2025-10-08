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

// esbuild configuration
const buildOptions = {
  entryPoints,
  outdir: 'lib',
  outbase: 'src',
  platform: 'node',
  target: 'node22',
  format: 'cjs',

  // Minification (production only)
  minify: !isDev,
  minifyWhitespace: !isDev,
  minifyIdentifiers: !isDev,
  minifySyntax: !isDev,

  // Source maps (development only)
  sourcemap: isDev,

  // Keep file structure (don't bundle, compile each file separately)
  splitting: false,
  bundle: false,

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

      // Calculate size savings
      if (!isDev) {
        const libSize = getDirectorySize(libDir);
        console.log(`[Build] Output size: ${(libSize / 1024 / 1024).toFixed(2)} MB`);
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

// Run build
build();
