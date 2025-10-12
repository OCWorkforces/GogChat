/**
 * Crypto polyfill for test environment
 *
 * Ensures crypto/webcrypto APIs are available globally for tests.
 * Node.js 24+ has native crypto support, but we need to ensure it's
 * available in the global scope for certain test scenarios.
 */

const crypto = require('crypto');

// Make crypto available globally if not already present
if (!global.crypto) {
  global.crypto = crypto.webcrypto || crypto;
}

// Ensure crypto module is available
if (!global.crypto.subtle && crypto.webcrypto) {
  global.crypto = crypto.webcrypto;
}
