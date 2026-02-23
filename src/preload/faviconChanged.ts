/**
 * Favicon change detector - Now using MutationObserver for better performance
 * Replaces polling with reactive DOM observation
 */

import { SELECTORS } from '../shared/constants.js';

let previousHref: string = '';
let observer: MutationObserver | null = null;

/**
 * Notify main process of favicon changes
 */
const emitFaviconChanged = (href: string) => {
  if (previousHref === href || !href) {
    return;
  }

  previousHref = href;

  // Use the secure API exposed via contextBridge
  if (window.googlechat?.sendFaviconChanged) {
    window.googlechat.sendFaviconChanged(href);
  }
};

/**
 * Get current favicon element and href
 */
const getCurrentFavicon = (): string => {
  // Try shortcut icon first, then regular icon
  const favicon =
    (document.querySelector(SELECTORS.FAVICON_SHORTCUT) as HTMLLinkElement) ||
    (document.querySelector(SELECTORS.FAVICON_ICON) as HTMLLinkElement);

  return favicon?.href || '';
};

/**
 * Initialize MutationObserver to watch for favicon changes
 * Replaces 1-second polling with reactive observation
 */
const initObserver = () => {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Initial check
  const initialHref = getCurrentFavicon();
  if (initialHref) {
    emitFaviconChanged(initialHref);
  }

  // Create observer for <head> element changes
  observer = new MutationObserver((mutations) => {
    // Check if any mutation affected favicon elements
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        const currentHref = getCurrentFavicon();
        if (currentHref) {
          emitFaviconChanged(currentHref);
        }
        break; // Only need to check once per batch
      }
    }
  });

  // Observe changes to <head>
  const head = document.head;
  if (head) {
    observer.observe(head, {
      childList: true, // Watch for added/removed nodes
      subtree: true, // Watch descendants
      attributes: true, // Watch for attribute changes
      attributeFilter: ['href', 'rel'], // Only watch relevant attributes
    });
  }
};

// ✅ SECURITY FIX: Add cleanup to prevent memory leaks
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
