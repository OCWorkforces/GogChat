/**
 * Unread count tracker - Now using MutationObserver for better performance
 * Monitors Google Chat sidebar for unread message counts
 */

import { SELECTORS } from '../shared/constants.js';

let previousCount = -1;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Extract unread message count from Google Chat DOM
 */
const getMessageCount = (): number => {
  let counter = 0;

  // Find Chat and Spaces groups
  const targets = document.body.querySelectorAll(
    [SELECTORS.CHAT_GROUP, SELECTORS.SPACES_GROUP].join(',')
  );

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
  if (window.googlechat?.sendUnreadCount) {
    window.googlechat.sendUnreadCount(count);
  }
};

/**
 * Initialize MutationObserver to watch for sidebar changes
 * Replaces 1-second polling with reactive observation
 * ⚡ PERF: 200ms debounce batches rapid DOM mutations (typing, UI updates)
 */
const initObserver = () => {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Initial count check
  emitCount();

  // Create observer for document.body changes with debounced callback
  observer = new MutationObserver(() => {
    // Debounce rapid mutations — Google Chat fires many during typing/rendering
    if (debounceTimer !== null) {
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      emitCount();
    }, 200);
  });

  // Observe changes to body
  if (document.body) {
    observer.observe(document.body, {
      childList: true, // Watch for added/removed nodes
      subtree: true, // Watch all descendants
      characterData: true, // Watch for text changes (count updates)
    });
  }
};

/**
 * ✅ SECURITY FIX: Cleanup to prevent memory leaks
 */
const cleanup = () => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', initObserver);

// Clean up observer when page unloads
window.addEventListener('beforeunload', cleanup);
