/**
 * Offline page handler
 * Manages connectivity checks and page reload when coming back online
 */

import urls from '../urls';

let unsubscribe: (() => void) | null = null;

/**
 * Handle online status response from main process
 */
const handleOnlineStatus = (online: boolean) => {
  if (online) {
    // Back online - redirect to Google Chat
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
  if (window.gchat?.checkIfOnline) {
    window.gchat.checkIfOnline();
  }
};

// Use secure API exposed via contextBridge
window.addEventListener('DOMContentLoaded', () => {
  // Listen to global event from offline.html
  window.addEventListener('app:checkIfOnline', handleCheckOnline);

  // Listen to online status from main process
  if (window.gchat?.onOnlineStatus) {
    unsubscribe = window.gchat.onOnlineStatus(handleOnlineStatus);
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
