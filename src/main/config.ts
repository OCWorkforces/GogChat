import { app } from 'electron';
import { createHash } from 'crypto';
import type { StoreType } from '../shared/types.js';
import Store, { Schema } from 'electron-store';
import { addCacheLayer, type CachedStore } from './utils/configCache.js';
import log from 'electron-log';
import { getPackageInfo } from './utils/packageInfo.js';

// ⚡ OPTIMIZATION: Cache version for invalidation on app updates
const CACHE_VERSION = '1.0.0';

/**
 * Generate encryption key from app-specific data
 * This creates a consistent key per machine/user
 * Encrypts sensitive configuration data at rest
 */
function getEncryptionKey(): string {
  // Use app name + user data path to generate consistent key per installation
  const keyMaterial = `${app.getName()}-${app.getPath('userData')}`;
  return createHash('sha256').update(keyMaterial).digest('hex');
}

// Schema definition for electron-store
const schema: Schema<StoreType> = {
  window: {
    type: 'object',
    properties: {
      bounds: {
        type: 'object',
        properties: {
          x: {
            type: ['number', 'null'] as const,
          },
          y: {
            type: ['number', 'null'] as const,
          },
          width: {
            type: 'number',
          },
          height: {
            type: 'number',
          },
        },
        default: {
          x: null,
          y: null,
          width: 800,
          height: 600,
        },
      },
      isMaximized: {
        type: 'boolean',
        default: false,
      },
    },
    default: {
      bounds: {
        x: null,
        y: null,
        width: 800,
        height: 600,
      },
      isMaximized: false,
    },
  },
  app: {
    type: 'object',
    properties: {
      autoCheckForUpdates: {
        type: 'boolean',
        default: true,
      },
      autoLaunchAtLogin: {
        type: 'boolean',
        default: true,
      },
      startHidden: {
        type: 'boolean',
        default: false,
      },
      hideMenuBar: {
        type: 'boolean',
        default: false,
      },
      disableSpellChecker: {
        type: 'boolean',
        default: false,
      },
      suppressPasskeyDialog: {
        type: 'boolean',
        default: false,
      },
    },
    default: {
      autoCheckForUpdates: true,
      autoLaunchAtLogin: true,
      startHidden: false,
      hideMenuBar: false,
      disableSpellChecker: false,
      suppressPasskeyDialog: false,
    },
  },
  _meta: {
    type: 'object',
    properties: {
      cacheVersion: {
        type: 'string',
        default: CACHE_VERSION,
      },
      lastAppVersion: {
        type: 'string',
        default: '',
      },
      lastUpdated: {
        type: 'number',
        default: 0,
      },
    },
    default: {
      cacheVersion: CACHE_VERSION,
      lastAppVersion: '',
      lastUpdated: Date.now(),
    },
  },
  accountWindows: {
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: {
        bounds: {
          type: 'object',
          properties: {
            x: {
              type: ['number', 'null'] as const,
            },
            y: {
              type: ['number', 'null'] as const,
            },
            width: {
              type: 'number',
            },
            height: {
              type: 'number',
            },
          },
          default: {
            x: null,
            y: null,
            width: 800,
            height: 600,
          },
        },
        isMaximized: {
          type: 'boolean',
          default: false,
        },
      },
      default: {
        bounds: {
          x: null,
          y: null,
          width: 800,
          height: 600,
        },
        isMaximized: false,
      },
    },
    default: {},
  },
};

/**
 * Initialize encrypted store
 * All configuration data is encrypted at rest using AES-256-GCM
 */
let storeInstance: Store<StoreType> | CachedStore<StoreType> | null = null;

/**
 * Initialize the electron-store instance
 * Now uses static import with ESM
 */
export function initializeStore(): Store<StoreType> | CachedStore<StoreType> {
  if (storeInstance) {
    return storeInstance;
  }

  // Create store with encryption
  let store: Store<StoreType> | CachedStore<StoreType> = new Store<StoreType>({
    schema,
    encryptionKey: getEncryptionKey(),
  });

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

      // Clear cache if it has the clearCache method (CachedStore)
      if (typeof (store as CachedStore<StoreType>).clearCache === 'function') {
        (store as CachedStore<StoreType>).clearCache();
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
  } catch (error) {
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
