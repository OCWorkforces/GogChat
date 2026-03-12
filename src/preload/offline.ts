/**
 * Offline page handler
 * Manages connectivity checks and page reload when coming back online
 */

import urls from '../urls.js';

let unsubscribe: (() => void) | null = null;

/**
 * Handle online status response from main process
 */
const handleOnlineStatus = (online: boolean) => {
  if (online) {
    // Back online - redirect to GogChat
    window.location.replace(urls.appUrl);
  } else {
    // Still offline - reload offline page
    window.location.reload();
  }
};

/**
 * Handle check connectivity button click from offline.html
 */
const handleCheckOnline = () => {
  if (window.gogchat?.checkIfOnline) {
    window.gogchat.checkIfOnline();
  }
};

// Use secure API exposed via contextBridge
window.addEventListener('DOMContentLoaded', () => {
  // Listen to global event from offline.html
  window.addEventListener('app:checkIfOnline', handleCheckOnline);

  // Listen to online status from main process
  if (window.gogchat?.onOnlineStatus) {
    unsubscribe = window.gogchat.onOnlineStatus(handleOnlineStatus);
  }
});

// Clean up listeners when page unloads
window.addEventListener('beforeunload', () => {
  window.removeEventListener('app:checkIfOnline', handleCheckOnline);

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
});
