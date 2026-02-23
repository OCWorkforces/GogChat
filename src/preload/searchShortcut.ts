/**
 * Search shortcut handler
 * Focuses the Google Chat search input when triggered from main process
 */

import { SELECTORS } from '../shared/constants.js';

const getSearchElement = (): HTMLElement | null => {
  return document.querySelector(SELECTORS.SEARCH_INPUT);
};

// https://stackoverflow.com/a/38873788
function isVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

/**
 * Handle search shortcut trigger
 */
const handleSearchShortcut = () => {
  const element = getSearchElement();

  if (element && isVisible(element)) {
    element.focus();
  }
};

// Use secure API exposed via contextBridge
// Listen to event coming from main process
let unsubscribe: (() => void) | null = null;

window.addEventListener('DOMContentLoaded', () => {
  if (window.googlechat?.onSearchShortcut) {
    unsubscribe = window.googlechat.onSearchShortcut(handleSearchShortcut);
  }
});

// Clean up listener when page unloads
window.addEventListener('beforeunload', () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
});
