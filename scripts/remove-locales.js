#!/usr/bin/env node

/**
 * Remove unused Electron locales to reduce package size
 * Keeps only en-US locale, removes all others (100+ languages)
 * Expected savings: 15-25MB
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const [,, platform, arch] = process.argv;

if (!platform || !arch) {
  console.error('Usage: node remove-locales.js <platform> <arch>');
  console.error('Example: node remove-locales.js mac x64');
  process.exit(1);
}

// Locales to keep
const KEEP_LOCALES = ['en-US.pak'];

// Get the locales directory path based on platform
function getLocalesPath(platform, arch) {
  const distDir = path.join(__dirname, '..', 'dist');

  switch (platform) {
    case 'mac':
    case 'darwin': {
      const archSuffix = arch === 'arm64' ? 'arm64' : 'x64';
      const appPath = path.join(distDir, `GChat-darwin-${archSuffix}`, 'GChat.app');
      return path.join(
        appPath,
        'Contents',
        'Frameworks',
        'Electron Framework.framework',
        'Versions',
        'A',
        'Resources',
        'locales'
      );
    }

    case 'win':
    case 'win32':
    case 'windows': {
      const appPath = path.join(distDir, 'GChat-win32-x64');
      return path.join(appPath, 'locales');
    }

    case 'linux': {
      const appPath = path.join(distDir, 'GChat-linux-x64');
      return path.join(appPath, 'locales');
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

// Main function
function removeUnusedLocales() {
  const localesPath = getLocalesPath(platform, arch);

  console.log(`[Locale Cleanup] Platform: ${platform}, Arch: ${arch}`);
  console.log(`[Locale Cleanup] Locales path: ${localesPath}`);

  if (!fs.existsSync(localesPath)) {
    console.error(`[Locale Cleanup] ERROR: Locales directory not found: ${localesPath}`);
    console.error('[Locale Cleanup] Make sure packaging completed successfully');
    process.exit(1);
  }

  // Read all files in locales directory
  const files = fs.readdirSync(localesPath);

  let totalSize = 0;
  let removedSize = 0;
  let removedCount = 0;
  let keptCount = 0;

  files.forEach(file => {
    const filePath = path.join(localesPath, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;

    if (!KEEP_LOCALES.includes(file)) {
      try {
        fs.unlinkSync(filePath);
        removedSize += stats.size;
        removedCount++;
        console.log(`[Locale Cleanup] Removed: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
      } catch (error) {
        console.error(`[Locale Cleanup] Failed to remove ${file}: ${error.message}`);
      }
    } else {
      keptCount++;
      console.log(`[Locale Cleanup] Kept: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
  });

  // Print summary
  console.log('\n[Locale Cleanup] ========== SUMMARY ==========');
  console.log(`[Locale Cleanup] Total locales: ${files.length}`);
  console.log(`[Locale Cleanup] Removed: ${removedCount} locales`);
  console.log(`[Locale Cleanup] Kept: ${keptCount} locales`);
  console.log(`[Locale Cleanup] Space saved: ${(removedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Locale Cleanup] Original size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Locale Cleanup] Final size: ${((totalSize - removedSize) / 1024 / 1024).toFixed(2)} MB`);
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
