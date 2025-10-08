/**
 * Icon Cache Manager
 * Centralizes icon loading and caching to reduce file I/O operations
 * and improve startup performance
 */

import { app, nativeImage, NativeImage } from 'electron';
import path from 'path';
import log from 'electron-log';

/**
 * Manages icon loading and caching
 * Uses singleton pattern to ensure single cache instance across app lifecycle
 */
class IconCacheManager {
  private cache: Map<string, NativeImage> = new Map();

  /**
   * Get icon from cache or load and cache it
   * @param relativePath - Path relative to app root (e.g., 'resources/icons/normal/256.png')
   * @returns NativeImage instance (may be empty if load failed)
   */
  getIcon(relativePath: string): NativeImage {
    // Check cache first
    if (this.cache.has(relativePath)) {
      log.debug(`[IconCache] Cache hit: ${relativePath}`);
      return this.cache.get(relativePath)!;
    }

    // Load and cache
    const fullPath = path.join(app.getAppPath(), relativePath);
    const icon = nativeImage.createFromPath(fullPath);

    if (icon.isEmpty()) {
      log.error(`[IconCache] Failed to load icon: ${relativePath}`);
    } else {
      this.cache.set(relativePath, icon);
      log.debug(
        `[IconCache] Cached icon: ${relativePath} (size: ${icon.getSize().width}x${icon.getSize().height})`
      );
    }

    return icon;
  }

  /**
   * Pre-load commonly used icons at startup
   * This reduces latency when icons are needed during app initialization
   * @returns Number of icons successfully loaded
   */
  warmCache(): number {
    log.debug('[IconCache] Warming icon cache...');

    const commonIcons = [
      'resources/icons/normal/256.png', // Main window icon
      'resources/icons/normal/64.png', // About panel icon
      'resources/icons/normal/16.png', // Tray icon (macOS)
      'resources/icons/normal/32.png', // Tray icon (Windows/Linux)
      'resources/icons/offline/16.png', // Offline tray icon (macOS)
      'resources/icons/offline/32.png', // Offline tray icon (Windows/Linux)
      'resources/icons/badge/16.png', // Badge overlay icon
    ];

    let loaded = 0;
    commonIcons.forEach((iconPath) => {
      const icon = this.getIcon(iconPath);
      if (!icon.isEmpty()) {
        loaded++;
      }
    });

    log.info(`[IconCache] Warmed cache with ${loaded}/${commonIcons.length} icons`);
    return loaded;
  }

  /**
   * Get current cache size (number of cached icons)
   * @returns Number of icons in cache
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics for monitoring
   * @returns Object with cache metrics
   */
  getStats(): { size: number; icons: string[] } {
    return {
      size: this.cache.size,
      icons: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clear all cached icons
   * Useful for testing or memory management
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    log.debug(`[IconCache] Cleared ${size} cached icons`);
  }
}

// Singleton instance
let instance: IconCacheManager | null = null;

/**
 * Get the singleton icon cache instance
 * Creates instance on first call (lazy initialization)
 * @returns IconCacheManager instance
 */
export function getIconCache(): IconCacheManager {
  if (!instance) {
    instance = new IconCacheManager();
    log.debug('[IconCache] Created icon cache instance');
  }
  return instance;
}

/**
 * Destroy the icon cache singleton
 * Used for cleanup or testing
 */
export function destroyIconCache(): void {
  if (instance) {
    instance.clear();
    instance = null;
    log.debug('[IconCache] Destroyed icon cache instance');
  }
}
