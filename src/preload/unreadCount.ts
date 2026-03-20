/**
 * Unread count tracker - Updated for new Google Chat UI (2025+)
 * Monitors GogChat sidebar for unread message counts
 *
 * NEW SELECTOR LOGIC: Google Chat now uses:
 * - RuSDjb containers with OK1FOb/zY9JEf badge children
 * - aria-label="N unread message" on the badge element
 */

import { SELECTORS } from '../shared/constants.js';

let previousCount = -1;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

type UnreadSnapshot = {
  count: number;
  containers: number;
  matchedBadges: number;
};

/**
 * Extract unread message count from GogChat DOM
 * UPDATED: New Google Chat UI uses RuSDjb containers with OK1FOb badges
 */
const getMessageCount = (): UnreadSnapshot => {
  let counter = 0;
  let matchedBadges = 0;

  const containers = document.querySelectorAll(SELECTORS.UNREAD_BADGE_CONTAINER);

  containers.forEach((container) => {
    const primaryBadge = container.querySelector(SELECTORS.UNREAD_BADGE);
    const altBadge = container.querySelector(SELECTORS.UNREAD_BADGE_ALT);

    const badge = primaryBadge || altBadge;
    if (badge) {
      const ariaLabel = badge.getAttribute('aria-label') || badge.getAttribute('aria') || '';
      if (ariaLabel.toLowerCase().includes('unread')) {
        matchedBadges += 1;
        const text = badge.textContent?.trim();
        if (text) {
          const count = Number(text);
          if (!isNaN(count) && count > 0) {
            counter += count;
          }
        }
      }
    }
  });

  return {
    count: counter,
    containers: containers.length,
    matchedBadges,
  };
};

/**
 * Emit unread count to main process (only if changed)
 */
const emitCount = () => {
  const snapshot = getMessageCount();
  const { count } = snapshot;

  if (previousCount === count) {
    return;
  }

  console.info(
    `[UnreadCount] count=${count} previous=${previousCount} containers=${snapshot.containers} matched=${snapshot.matchedBadges} hidden=${document.hidden} visibility=${document.visibilityState}`
  );

  previousCount = count;

  if (window.gogchat?.sendUnreadCount) {
    window.gogchat.sendUnreadCount(count);
  }
};

/**
 * Initialize MutationObserver to watch for sidebar changes
 * Replaces 1-second polling with reactive observation
 * PERF: 200ms debounce batches rapid DOM mutations (typing, UI updates)
 */
const initObserver = () => {
  if (observer) {
    observer.disconnect();
  }

  console.info(
    `[UnreadCount] observer-init hidden=${document.hidden} visibility=${document.visibilityState}`
  );

  emitCount();

  observer = new MutationObserver(() => {
    if (debounceTimer !== null) {
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      emitCount();
    }, 200);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
};

/**
 * Cleanup to prevent memory leaks
 */
const cleanup = () => {
  console.info('[UnreadCount] observer-cleanup');

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

window.addEventListener('visibilitychange', () => {
  console.info(
    `[UnreadCount] visibility-change hidden=${document.hidden} visibility=${document.visibilityState}`
  );
  emitCount();
});

window.addEventListener('DOMContentLoaded', initObserver);

window.addEventListener('beforeunload', cleanup);
