#!/usr/bin/env node

/**
 * Remove unused Electron locales to reduce package size
 * Keeps only en-US locale, removes all others (100+ languages)
 * Expected savings: 15-25MB
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const [, , platform, arch] = process.argv;

if (!platform || !arch) {
  console.error('Usage: node remove-locales.js <platform> <arch>');
  console.error('Example: node remove-locales.js mac x64');
  process.exit(1);
}

// macOS locales to keep (.lproj directories)
const KEEP_LPROJ = ['en.lproj', 'en-US.lproj', 'en_US.lproj'];

// Get the locales directory path for macOS
function getLocalesPath(platform, arch) {
  const distDir = path.join(__dirname, '..', 'dist');

  if (platform === 'mac' || platform === 'darwin') {
    const archSuffix = arch === 'arm64' ? 'arm64' : 'x64';
    const appPath = path.join(distDir, `Google Chat-darwin-${archSuffix}`, 'Google Chat.app');
    // On macOS, locale files are in .lproj directories in Resources
    return {
      path: path.join(
        appPath,
        'Contents',
        'Frameworks',
        'Electron Framework.framework',
        'Versions',
        'A',
        'Resources'
      ),
      isMacOS: true,
    };
  }

  throw new Error(`Unsupported platform: ${platform}. This script only supports macOS.`);
}

// Helper function to get directory size
function getDirectorySize(dirPath) {
  let totalSize = 0;

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        scanDir(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  }

  scanDir(dirPath);
  return totalSize;
}

// Main function
function removeUnusedLocales() {
  const localesInfo = getLocalesPath(platform, arch);
  const localesPath = localesInfo.path;

  console.log(`[Locale Cleanup] Platform: ${platform}, Arch: ${arch}`);
  console.log(`[Locale Cleanup] Locales path: ${localesPath}`);

  if (!fs.existsSync(localesPath)) {
    console.error(`[Locale Cleanup] ERROR: Locales directory not found: ${localesPath}`);
    console.error('[Locale Cleanup] Make sure packaging completed successfully');
    process.exit(1);
  }

  // Read all files/directories in locales path
  const items = fs.readdirSync(localesPath);

  let totalSize = 0;
  let removedSize = 0;
  let removedCount = 0;
  let keptCount = 0;

  items.forEach((item) => {
    const itemPath = path.join(localesPath, item);
    const stats = fs.statSync(itemPath);

    // macOS uses .lproj directories
    if (item.endsWith('.lproj')) {
      const itemSize = stats.isDirectory() ? getDirectorySize(itemPath) : stats.size;
      totalSize += itemSize;

      if (!KEEP_LPROJ.includes(item)) {
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
          removedSize += itemSize;
          removedCount++;
          console.log(`[Locale Cleanup] Removed: ${item} (${(itemSize / 1024).toFixed(1)} KB)`);
        } catch (error) {
          console.error(`[Locale Cleanup] Failed to remove ${item}: ${error.message}`);
        }
      } else {
        keptCount++;
        console.log(`[Locale Cleanup] Kept: ${item} (${(itemSize / 1024).toFixed(1)} KB)`);
      }
    }
  });

  // Print summary
  console.log('\n[Locale Cleanup] ========== SUMMARY ==========');
  console.log(`[Locale Cleanup] Total locales: ${removedCount + keptCount}`);
  console.log(`[Locale Cleanup] Removed: ${removedCount} locales`);
  console.log(`[Locale Cleanup] Kept: ${keptCount} locales`);
  console.log(`[Locale Cleanup] Space saved: ${(removedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Locale Cleanup] Original size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `[Locale Cleanup] Final size: ${((totalSize - removedSize) / 1024 / 1024).toFixed(2)} MB`
  );
  console.log('[Locale Cleanup] =============================\n');
}

// Run the cleanup
try {
  removeUnusedLocales();
  console.log('[Locale Cleanup] ✅ Locale cleanup completed successfully');
} catch (error) {
  console.error(`[Locale Cleanup] ❌ Error: ${error.message}`);
  process.exit(1);
}
