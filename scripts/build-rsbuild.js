#!/usr/bin/env node

/**
 * Build script using Rsbuild (Rspack) for TypeScript compilation and bundling
 * Replaces the previous esbuild implementation with Rspack-powered builds
 *
 * Features:
 * - Scans all TypeScript files in src/ directory
 * - Bundles with selective externals (Electron modules stay external)
 * - Dev/prod modes with conditional minification
 * - Watch mode support
 * - Bundle size tracking and history
 */

import { createRsbuild, loadConfig } from '@rsbuild/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

console.log('[Build] Starting Rsbuild compilation...');
console.log(`[Build] Mode: ${isDev ? 'development' : 'production'}`);
console.log(`[Build] Watch: ${isWatch ? 'enabled' : 'disabled'}`);

// Set environment variables
process.env.NODE_ENV = isDev ? 'development' : 'production';

/**
 * Scan src/ directory and collect all TypeScript entry points
 * Excludes test files (*.test.ts, *.spec.ts)
 */
function getEntryPoints() {
  const allEntries = {};
  const preloadEntries = {};
  const mainEntries = {};
  const srcDir = path.join(__dirname, '../src');
  function scanDirectory(dir, relativePath = '') {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirectory(fullPath, path.join(relativePath, file));
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
        const entryName = path.join(relativePath, file.replace(/\.ts$/, ''));
        allEntries[entryName] = fullPath;
        if (relativePath === 'preload' || relativePath.startsWith('preload' + path.sep)) {
          preloadEntries[entryName] = fullPath;
        } else {
          mainEntries[entryName] = fullPath;
        }
      }
    }
  }
  scanDirectory(srcDir);
  return { allEntries, preloadEntries, mainEntries };
}

/**
 * Calculate directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

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

  scanDir(dirPath);
  return totalSize;
}

/**
 * Get all files in directory recursively
 */
function getAllFiles(dirPath) {
  const allFiles = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

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

  scanDir(dirPath);
  return allFiles;
}

function copyOfflineAssets() {
  const offlineSrcDir = path.join(__dirname, '../src/offline');
  const offlineDistDir = path.join(__dirname, '../lib/offline');
  const assets = ['index.html', 'index.css'];

  fs.mkdirSync(offlineDistDir, { recursive: true });

  for (const asset of assets) {
    const source = path.join(offlineSrcDir, asset);
    const destination = path.join(offlineDistDir, asset);
    fs.copyFileSync(source, destination);
  }

  console.log('[Build] Copied offline HTML assets');
}

/**
 * Track bundle size history with chunk-level details
 */
function trackBuildHistory(libDir) {
  const libSize = getDirectorySize(libDir);
  const libSizeMB = (libSize / 1024 / 1024).toFixed(2);
  const files = getAllFiles(libDir);

  console.log(`[Build] Output size: ${libSizeMB} MB (${libSize.toLocaleString()} bytes)`);

  // Separate chunks from regular files
  const chunks = [];
  const regularFiles = [];

  files.forEach((file) => {
    const relativePath = file.replace(libDir + '/', '');
    const size = fs.statSync(file).size;

    if (relativePath.includes('chunks/') && relativePath.endsWith('.chunk.js')) {
      chunks.push({ path: relativePath, size });
    } else if (relativePath.endsWith('.js')) {
      regularFiles.push({ path: relativePath, size });
    }
  });

  // Log main bundle
  const mainBundle = regularFiles.find((f) => f.path === 'main/index.js');
  if (mainBundle) {
    const mainSizeKB = (mainBundle.size / 1024).toFixed(1);
    console.log(`[Build] Main bundle: ${mainSizeKB} KB`);
  }

  // Log async chunks
  if (chunks.length > 0) {
    console.log(`[Build] Async chunks (${chunks.length}):`);
    chunks
      .sort((a, b) => b.size - a.size)
      .forEach((chunk) => {
        const sizeKB = (chunk.size / 1024).toFixed(1);
        const chunkName = chunk.path.replace('chunks/', '').replace('.chunk.js', '');
        console.log(`[Build]   - ${chunkName}: ${sizeKB} KB`);
      });

    const totalChunkSize = chunks.reduce((sum, c) => sum + c.size, 0);
    const totalChunkKB = (totalChunkSize / 1024).toFixed(1);
    console.log(`[Build]   Total chunks: ${totalChunkKB} KB`);
  }

  // Log top 5 largest regular files (excluding main bundle)
  console.log('[Build] Top 5 largest files:');
  regularFiles
    .filter((f) => f.path !== 'main/index.js')
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .forEach((file, index) => {
      const sizeKB = (file.size / 1024).toFixed(1);
      console.log(`[Build]   ${index + 1}. ${file.path} (${sizeKB} KB)`);
    });

  // Track bundle size history
  const historyFile = path.join(__dirname, '../.build-history.json');
  let history = [];
  if (fs.existsSync(historyFile)) {
    try {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    } catch (error) {
      console.warn('[Build] Warning: Could not parse build history file', error);
      history = [];
    }
  }

  const buildRecord = {
    timestamp: new Date().toISOString(),
    size: libSize,
    sizeMB: parseFloat(libSizeMB),
    fileCount: files.length,
    tool: 'rsbuild',
    mainBundleSize: mainBundle?.size || 0,
    chunkCount: chunks.length,
    totalChunkSize: chunks.reduce((sum, c) => sum + c.size, 0),
    chunks: chunks.map((c) => ({
      name: c.path.replace('chunks/', '').replace('.chunk.js', ''),
      size: c.size,
    })),
  };

  history.push(buildRecord);

  // Keep only last 20 builds
  if (history.length > 20) {
    history = history.slice(-20);
  }

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

  // Show size trend if we have history
  if (history.length > 1) {
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];

    // Main bundle trend
    if (prev.mainBundleSize && curr.mainBundleSize) {
      const mainDiff = (curr.mainBundleSize - prev.mainBundleSize) / 1024;
      const mainDiffPercent = ((mainDiff / (prev.mainBundleSize / 1024)) * 100).toFixed(1);

      if (Math.abs(mainDiff) > 0.1) {
        const sign = mainDiff > 0 ? '+' : '';
        console.log(
          `[Build] Main bundle: ${sign}${mainDiff.toFixed(1)} KB (${sign}${mainDiffPercent}%)`
        );
      }
    }

    // Total size trend
    const diff = parseFloat(libSizeMB) - prev.sizeMB;
    const diffPercent = ((diff / prev.sizeMB) * 100).toFixed(1);

    if (diff > 0) {
      console.log(`[Build] Total size: +${diff.toFixed(2)} MB (+${diffPercent}%)`);
    } else if (diff < 0) {
      console.log(`[Build] Total size: ${diff.toFixed(2)} MB (${diffPercent}%)`);
    } else {
      console.log(`[Build] Total size: unchanged`);
    }
  }
}

/**
 * Main build function
 */
async function build() {
  try {
    const startTime = Date.now();
    // Get all entry points, split by preload vs main
    const { allEntries, preloadEntries, mainEntries } = getEntryPoints();
    console.log(`[Build] Found ${Object.keys(allEntries).length} TypeScript files to compile`);
    // Load Rsbuild configuration
    const { content: userConfig } = await loadConfig({
      cwd: path.join(__dirname, '..'),
    });

    // Build 1: Main process (ESM) — everything except preload
    console.log('[Build] Building main process (ESM)...');
    const mainRsbuildConfig = {
      ...userConfig,
      source: {
        ...userConfig.source,
        entry: mainEntries,
      },
    };
    const mainRsbuild = await createRsbuild({ rsbuildConfig: mainRsbuildConfig });

    // Build 2: Preload scripts (CJS) — sandbox preloads cannot use ESM import
    console.log('[Build] Building preload scripts (CJS)...');
    const preloadRsbuildConfig = {
      ...userConfig,
      source: {
        ...userConfig.source,
        entry: preloadEntries,
      },
      output: {
        ...userConfig.output,
        module: false,
        // Preload must NOT clean dist — main process already wrote there
        cleanDistPath: false,
      },
      tools: {
        ...userConfig.tools,
        rspack: (config, ctx) => {
          // Apply any existing rspack config first
          if (userConfig.tools && typeof userConfig.tools.rspack === 'function') {
            config = userConfig.tools.rspack(config, ctx) ?? config;
          } else if (
            userConfig.tools &&
            typeof userConfig.tools.rspack === 'object' &&
            !Array.isArray(userConfig.tools.rspack)
          ) {
            Object.assign(config, userConfig.tools.rspack);
          }
          // Force CJS output for sandboxed preload
          config.target = 'electron-renderer';
          config.output = config.output || {};
          config.output.module = false;
          config.output.chunkFormat = 'commonjs';
          config.output.library = { type: 'commonjs2' };
          config.experiments = config.experiments || {};
          config.experiments.outputModule = false;
          return config;
        },
      },
    };
    const preloadRsbuild = await createRsbuild({ rsbuildConfig: preloadRsbuildConfig });
    if (isWatch) {
      console.log('[Build] Starting watch mode...');
      const mainResult = await mainRsbuild.build({ watch: true });
      const preloadResult = await preloadRsbuild.build({ watch: true });
      console.log('[Build] ✅ Watching for changes... (press Ctrl+C to stop)');

      // Graceful shutdown on SIGINT/SIGTERM
      const cleanup = async () => {
        console.log('\n[Build] Stopping watch mode...');
        await mainResult.close();
        await preloadResult.close();
        process.exit(0);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    } else {
      await mainRsbuild.build();
      await preloadRsbuild.build();
      copyOfflineAssets();
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`[Build] ✅ Compilation completed in ${duration}s`);
      if (!isDev) {
        const libDir = path.join(__dirname, '../lib');
        trackBuildHistory(libDir);
      }
    }
  } catch (error) {
    console.error('[Build] ❌ Build failed:', error);
    process.exit(1);
  }
}
// Run build
build();
