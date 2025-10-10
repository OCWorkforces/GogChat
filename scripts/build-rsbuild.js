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
  const entries = {};
  const srcDir = path.join(__dirname, '../src');

  function scanDirectory(dir, relativePath = '') {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath, path.join(relativePath, file));
      } else if (
        file.endsWith('.ts') &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.spec.ts')
      ) {
        // Generate entry name: 'main/index' for 'src/main/index.ts'
        const entryName = path.join(relativePath, file.replace(/\.ts$/, ''));
        entries[entryName] = fullPath;
      }
    }
  }

  scanDirectory(srcDir);
  return entries;
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

/**
 * Track bundle size history
 */
function trackBuildHistory(libDir) {
  const libSize = getDirectorySize(libDir);
  const libSizeMB = (libSize / 1024 / 1024).toFixed(2);
  const files = getAllFiles(libDir);

  console.log(`[Build] Output size: ${libSizeMB} MB (${libSize.toLocaleString()} bytes)`);

  // Log top 10 largest files
  console.log('[Build] Top 10 largest files:');
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
    try {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    } catch (error) {
      console.warn('[Build] Warning: Could not parse build history file');
      history = [];
    }
  }

  history.push({
    timestamp: new Date().toISOString(),
    size: libSize,
    sizeMB: parseFloat(libSizeMB),
    fileCount: files.length,
    tool: 'rsbuild',
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

/**
 * Main build function
 */
async function build() {
  try {
    const startTime = Date.now();

    // Get all entry points
    const entryPoints = getEntryPoints();
    console.log(`[Build] Found ${Object.keys(entryPoints).length} TypeScript files to compile`);

    // Load Rsbuild configuration
    const { content: userConfig } = await loadConfig({
      cwd: path.join(__dirname, '..'),
    });

    // Override entry points in config
    const rsbuildConfig = {
      ...userConfig,
      source: {
        ...userConfig.source,
        entry: entryPoints,
      },
    };

    // Create Rsbuild instance
    const rsbuild = await createRsbuild({
      rsbuildConfig,
    });

    if (isWatch) {
      // Watch mode
      console.log('[Build] Starting watch mode...');
      const watcher = await rsbuild.createDevServer();

      await watcher.afterClose();
      console.log('[Build] ✅ Watching for changes...');
    } else {
      // Build mode
      await rsbuild.build();

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`[Build] ✅ Compilation completed in ${duration}s`);

      // Track bundle size and history (production only)
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
