/**
 * Icon Cache Manager
 * Centralizes icon loading and caching to reduce file I/O operations
 * and improve startup performance
 * ⚡ OPTIMIZATION: Insertion-order LRU eviction matching configCache.ts pattern.
 *
 * DISJOINTNESS INVARIANT: INITIAL_ICON_PATHS (warmed during critical path) and
 * ADDITIONAL_ICON_PATHS in cacheWarmer.ts (warmed at 8s idle) MUST be disjoint
 * complements covering all preloaded icons exactly once. Do not duplicate paths
 * across these two sets — adding to one requires removing from the other.
 */

import type { NativeImage } from 'electron';
import { app, nativeImage } from 'electron';
import path from 'path';
import log from 'electron-log';

/**
 * Icons preloaded synchronously on the critical path (before UI phase).
 * Kept minimal: only icons required for first paint.
 *
 * INVARIANT: Must be disjoint from ADDITIONAL_ICON_PATHS in cacheWarmer.ts.
 * Together they form the complete preload set — no overlap, no gaps.
 */
export const INITIAL_ICON_PATHS = [
  'resources/icons/tray/iconTemplate.png', // Tray icon (light/dark mode)
  'resources/icons/tray/iconTemplate@2x.png', // Tray icon Retina
  'resources/icons/normal/16.png', // Favicon size
] as const;

/**
 * LRU Cache entry with access tracking
 */
interface CacheEntry {
  icon: NativeImage;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Manages icon loading and caching with insertion-order LRU eviction.
 * Uses singleton pattern to ensure single cache instance across app lifecycle.
 *
 * Eviction policy: Map insertion order — oldest inserted entry evicted first.
 * On cache hit, the entry is re-inserted to move it to the most-recent position
 * (matching the canonical pattern in configCache.ts).
 */
class IconCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxCacheSize: number = 50; // Limit cache size to prevent unbounded growth

  /**
   * Get icon from cache or load and cache it
   * ⚡ OPTIMIZATION: Insertion-order LRU — on hit, delete+reinsert to refresh recency.
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
      // LRU: move to end (most recently used) by re-inserting
      this.cache.delete(relativePath);
      this.cache.set(relativePath, cached);
      log.debug(`[IconCache] Cache hit: ${relativePath} (access count: ${cached.accessCount})`);
      return cached.icon;
    }

    // Load from disk
    // In packaged DMG: resources/ is bundled via extraResources outside asar
    // process.resourcesPath → Contents/Resources/ where extraResources are placed
    // In dev: app.getAppPath() → project root where resources/ directory exists
    const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
    const fullPath = path.join(basePath, relativePath);
    const icon = nativeImage.createFromPath(fullPath);

    if (icon.isEmpty()) {
      log.error(`[IconCache] Failed to load icon: ${relativePath}`);
    } else {
      // Check if cache is full and evict oldest (insertion-order) entry if needed
      if (this.cache.size >= this.maxCacheSize) {
        // Insertion-order eviction: Map preserves insertion order, so first key is oldest.
        // Mirrors the canonical pattern in configCache.ts:96-102.
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          const evicted = this.cache.get(oldestKey);
          this.cache.delete(oldestKey);
          log.debug(
            `[IconCache] Evicted oldest entry: ${oldestKey} (access count: ${evicted?.accessCount})`
          );
        }
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
   * Pre-load commonly used icons at startup
   * This reduces latency when icons are needed during app initialization
   * @returns Number of icons successfully loaded
   */
  warmCache(): number {
    log.debug('[IconCache] Warming icon cache...');

    let loaded = 0;
    INITIAL_ICON_PATHS.forEach((iconPath) => {
      const icon = this.getIcon(iconPath);
      if (!icon.isEmpty()) {
        loaded++;
      }
    });

    log.info(`[IconCache] Warmed cache with ${loaded}/${INITIAL_ICON_PATHS.length} icons`);
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
