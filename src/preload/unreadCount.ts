/**
 * Unread count tracker - Now using MutationObserver for better performance
 * Monitors Google Chat sidebar for unread message counts
 */

import {SELECTORS} from '../shared/constants';

let previousCount = -1;
let observer: MutationObserver | null = null;

/**
 * Extract unread message count from Google Chat DOM
 */
const getMessageCount = (): number => {
  let counter = 0;

  // Find Chat and Spaces groups
  const targets = document.body.querySelectorAll([SELECTORS.CHAT_GROUP, SELECTORS.SPACES_GROUP].join(','));

  targets.forEach((target) => {
    // Find the unread count span (next sibling of heading)
    const heading = target.querySelector(SELECTORS.UNREAD_HEADING);
    const countSpan = heading?.nextElementSibling;

    if (countSpan?.textContent) {
      const count = Number(countSpan.textContent);
      if (!isNaN(count)) {
        counter += count;
      }
    }
  });

  return counter;
};

/**
 * Emit unread count to main process (only if changed)
 */
const emitCount = () => {
  const count = getMessageCount();

  if (previousCount === count) {
    return; // No change, skip IPC call
  }

  previousCount = count;

  // Use secure API exposed via contextBridge
  if (window.gchat?.sendUnreadCount) {
    window.gchat.sendUnreadCount(count);
  }
};

/**
 * Initialize MutationObserver to watch for sidebar changes
 * Replaces 1-second polling with reactive observation
 */
const initObserver = () => {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Initial count check
  emitCount();

  // Create observer for document.body changes
  observer = new MutationObserver(() => {
    // Debounce: only check count when mutations occur
    emitCount();
  });

  // Observe changes to body
  if (document.body) {
    observer.observe(document.body, {
      childList: true,   // Watch for added/removed nodes
      subtree: true,      // Watch all descendants
      characterData: true, // Watch for text changes (count updates)
    });
  }
};

/**
 * ✅ SECURITY FIX: Cleanup to prevent memory leaks
 */
const cleanup = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', initObserver);

// Clean up observer when page unloads
window.addEventListener('beforeunload', cleanup);

