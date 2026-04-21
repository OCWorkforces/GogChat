import type { StoreType } from '../shared/types/config.js';
import Store from 'electron-store';
import { addCacheLayer, isCachedStore, type CachedStore } from './utils/configCache.js';
import log from 'electron-log';
import { getPackageInfo } from './utils/packageInfo.js';
import {
  getOrCreateEncryptionKey,
  needsMigration,
  completeMigration,
} from './utils/encryptionKey.js';

import { schema, CACHE_VERSION } from './utils/configSchema.js';

/**
 * Initialize encrypted store
 * All configuration data is encrypted at rest using AES-256-GCM
 */
let storeInstance: Store<StoreType> | CachedStore<StoreType> | null = null;

/**
 * Initialize the electron-store instance
 * Now uses static import with ESM
 *
 * Migration strategy:
 * - If SafeStorage is available but key file doesn't exist while config does,
 *   we need to migrate from the legacy deterministic key to SafeStorage.
 * - Migration is done by exporting all data, creating new store with new key,
 *   and re-importing the data.
 */
export async function initializeStore(): Promise<Store<StoreType> | CachedStore<StoreType>> {
  if (storeInstance) {
    return storeInstance;
  }

  // Get or create encryption key (SafeStorage-backed or legacy)
  const encryptionKey = await getOrCreateEncryptionKey();

  // Create store with encryption
  let store: Store<StoreType> | CachedStore<StoreType> = new Store<StoreType>({
    schema,
    encryptionKey,
    clearInvalidConfig: true,
  });

  // Migration: if SafeStorage is available but we opened with legacy key
  if (await needsMigration()) {
    try {
      log.info('[Config] Starting migration from legacy to SafeStorage encryption');
      const newKey = await completeMigration();
      if (newKey) {
        // Export all data from old store
        const allData = { ...store.store }; // electron-store exposes .store for raw data

        // Create new store with new key
        store = new Store<StoreType>({
          schema,
          encryptionKey: newKey,
        });

        // Import data into new store
        for (const [key, value] of Object.entries(allData)) {
          store.set(key as keyof StoreType, value);
        }
        log.info('[Config] Migration to SafeStorage encryption complete');
      }
    } catch (error: unknown) {
      log.error('[Config] Migration failed, continuing with legacy key:', error);
      // Continue with the legacy-key store - data is still accessible
    }
  }

  /**
   * Enable caching layer for improved performance
   * Adds in-memory cache to reduce encryption/decryption overhead
   * Cache is automatically invalidated on writes to maintain consistency
   *
   * Note: Disabled in test environment to preserve test spies
   */
  // Only enable cache layer if not in test environment
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    store = addCacheLayer(store);
  }

  // ⚡ OPTIMIZATION: Check and update cache version
  validateAndUpdateCacheVersion(store);

  storeInstance = store;
  return store;
}

/**
 * Validate cache version and clear if outdated
 * ⚡ OPTIMIZATION: Prevents stale data after app updates
 */
function validateAndUpdateCacheVersion(store: Store<StoreType> | CachedStore<StoreType>): void {
  try {
    const meta = store.get('_meta');
    const currentAppVersion = getPackageInfo().version;
    const storedCacheVersion = meta?.cacheVersion;
    const storedAppVersion = meta?.lastAppVersion;

    // Check if cache version or app version changed
    const cacheVersionChanged = storedCacheVersion !== CACHE_VERSION;
    const appVersionChanged = storedAppVersion !== currentAppVersion;

    if (cacheVersionChanged || appVersionChanged) {
      log.info(
        `[Config] Cache invalidation triggered - Cache version: ${storedCacheVersion} → ${CACHE_VERSION}, App version: ${storedAppVersion} → ${currentAppVersion}`
      );

      // Clear cache if store has caching layer
      if (isCachedStore(store)) {
        store.clearCache();
        log.info('[Config] In-memory cache cleared');
      }

      // Update metadata
      store.set('_meta', {
        cacheVersion: CACHE_VERSION,
        lastAppVersion: currentAppVersion,
        lastUpdated: Date.now(),
      });

      log.info('[Config] Cache version and metadata updated');
    } else {
      log.debug(
        `[Config] Cache version valid (${CACHE_VERSION}), app version: ${currentAppVersion}`
      );
    }
  } catch (error: unknown) {
    log.error('[Config] Failed to validate cache version:', error);
  }
}

/**
 * Get the store instance (synchronous)
 * WARNING: Only use this after initializeStore() has been called
 * Throws an error if store hasn't been initialized
 */
export function getStore(): Store<StoreType> | CachedStore<StoreType> {
  if (!storeInstance) {
    throw new Error('Store not initialized. Call initializeStore() before using the store.');
  }
  return storeInstance;
}

// Create a proxy object that lazy-loads the store
// This maintains backward compatibility with existing code
const storeProxy = new Proxy({} as Store<StoreType> | CachedStore<StoreType>, {
  get(_target, prop) {
    const store = getStore();
    const value = store[prop as keyof typeof store];
    // Bind methods to the actual store instance to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(store);
    }
    return value;
  },
  set(_target, prop, value) {
    return Reflect.set(getStore(), prop, value);
  },
  has(_target, prop) {
    return prop in getStore();
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getStore());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getStore(), prop);
  },
});

export default storeProxy;
