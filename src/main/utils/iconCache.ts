/**
 * Icon Cache Manager
 * Centralizes icon loading and caching to reduce file I/O operations
 * and improve startup performance
 * ⚡ OPTIMIZATION: Now includes LRU (Least Recently Used) eviction policy
 */

import { app, nativeImage, NativeImage } from 'electron';
import path from 'path';
import log from 'electron-log';

/**
 * LRU Cache entry with access tracking
 */
interface CacheEntry {
  icon: NativeImage;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Manages icon loading and caching with LRU eviction
 * Uses singleton pattern to ensure single cache instance across app lifecycle
 */
class IconCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxCacheSize: number = 50; // Limit cache size to prevent unbounded growth

  /**
   * Get icon from cache or load and cache it
   * ⚡ OPTIMIZATION: Now implements LRU cache with size limit
   * @param relativePath - Path relative to app root (e.g., 'resources/icons/normal/256.png')
   * @returns NativeImage instance (may be empty if load failed)
   */
  getIcon(relativePath: string): NativeImage {
    // Check cache first
    const cached = this.cache.get(relativePath);
    if (cached) {
      // Update access statistics
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      log.debug(`[IconCache] Cache hit: ${relativePath} (access count: ${cached.accessCount})`);
      return cached.icon;
    }

    // Load from disk
    const fullPath = path.join(app.getAppPath(), relativePath);
    const icon = nativeImage.createFromPath(fullPath);

    if (icon.isEmpty()) {
      log.error(`[IconCache] Failed to load icon: ${relativePath}`);
    } else {
      // Check if cache is full and evict LRU entry if needed
      if (this.cache.size >= this.maxCacheSize) {
        this.evictLRU();
      }

      // Add to cache with access tracking
      this.cache.set(relativePath, {
        icon,
        accessCount: 1,
        lastAccessed: Date.now(),
      });

      log.debug(
        `[IconCache] Cached icon: ${relativePath} (size: ${icon.getSize().width}x${icon.getSize().height}, cache size: ${this.cache.size}/${this.maxCacheSize})`
      );
    }

    return icon;
  }

  /**
   * Evict least recently used entry from cache
   * @private
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let oldestTime = Date.now();

    // Find the least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      const evicted = this.cache.get(lruKey);
      this.cache.delete(lruKey);
      log.debug(
        `[IconCache] Evicted LRU entry: ${lruKey} (access count: ${evicted?.accessCount}, last accessed: ${new Date(oldestTime).toISOString()})`
      );
    }
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
      'resources/icons/normal/16.png', // Favicon size
      'resources/icons/normal/32.png', // Favicon size
      'resources/icons/offline/16.png', // Offline indicator (macOS)
      'resources/icons/offline/32.png', // Offline indicator
      'resources/icons/badge/16.png', // Badge overlay icon
      'resources/icons/tray/iconTemplate.png', // Tray icon (light/dark mode)
      'resources/icons/tray/iconTemplate@2x.png', // Tray icon Retina
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
   * ⚡ OPTIMIZATION: Now includes access statistics and LRU info
   * @returns Object with cache metrics
   */
  getStats(): {
    size: number;
    maxSize: number;
    icons: string[];
    totalAccesses: number;
    mostAccessed: string | null;
    leastAccessed: string | null;
  } {
    let totalAccesses = 0;
    let mostAccessedKey: string | null = null;
    let mostAccessedCount = 0;
    let leastAccessedKey: string | null = null;
    let leastAccessedTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      totalAccesses += entry.accessCount;

      if (entry.accessCount > mostAccessedCount) {
        mostAccessedCount = entry.accessCount;
        mostAccessedKey = key;
      }

      if (entry.lastAccessed < leastAccessedTime) {
        leastAccessedTime = entry.lastAccessed;
        leastAccessedKey = key;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      icons: Array.from(this.cache.keys()),
      totalAccesses,
      mostAccessed: mostAccessedKey,
      leastAccessed: leastAccessedKey,
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
