import Store from 'electron-store';
import {app} from 'electron';
import {createHash} from 'crypto';
import type {StoreType} from '../shared/types';

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

const schema = {
  window: {
    type: 'object',
    properties: {
      bounds: {
        type: 'object',
        properties: {
          x: {
            type: 'number'
          },
          y: {
            type: 'number'
          },
          width: {
            type: 'number'
          },
          height: {
            type: 'number'
          },
        },
        default: {
          x: null,
          y: null,
          width: 800,
          height: 600,
        }
      },
      isMaximized: {
        type: 'boolean',
        default: false
      }
    },
    default: {
      bounds: {}
    }
  },
  app: {
    type: 'object',
    properties: {
      autoCheckForUpdates: {
        type: 'boolean',
        default: true
      },
      autoLaunchAtLogin: {
        type: 'boolean',
        default: true
      },
      startHidden: {
        type: 'boolean',
        default: false
      },
      hideMenuBar: {
        type: 'boolean',
        default: false
      },
      disableSpellChecker: {
        type: 'boolean',
        default: false
      },
      suppressPasskeyDialog: {
        type: 'boolean',
        default: false
      },
    },
    default: {}
  }
};

/**
 * Initialize encrypted store
 * All configuration data is encrypted at rest using AES-256-GCM
 */
let store = new Store<StoreType>({
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
import {addCacheLayer} from './utils/configCache';

// Only enable cache layer if not in test environment
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  store = addCacheLayer(store);
}

export default store;