// @vitest-environment jsdom

/**
 * Tests for faviconChanged preload script
 * Verifies MutationObserver on <head>, favicon detection, and IPC forwarding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture event listeners registered on window
type EventListenerEntry = { type: string; handler: EventListener };
let windowListeners: EventListenerEntry[] = [];

// Mock MutationObserver
let mutationCallback: MutationCallback | null = null;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockMutationObserver {
  constructor(callback: MutationCallback) {
    mutationCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
}

// Mock gogchat bridge API
const mockSendFaviconChanged = vi.fn();

describe('faviconChanged', () => {
  beforeEach(() => {
    vi.resetModules();

    windowListeners = [];
    mutationCallback = null;
    mockObserve.mockClear();
    mockDisconnect.mockClear();
    mockSendFaviconChanged.mockClear();

    // Stub MutationObserver
    vi.stubGlobal('MutationObserver', MockMutationObserver);

    // Stub window.gogchat
    Object.defineProperty(window, 'gogchat', {
      value: { sendFaviconChanged: mockSendFaviconChanged },
      configurable: true,
      writable: true,
    });

    // Default: no favicon in DOM
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    // Stub document.head
    Object.defineProperty(document, 'head', {
      value: {},
      configurable: true,
    });

    // Intercept window.addEventListener
    const originalAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        windowListeners.push({ type, handler: handler as EventListener });
        originalAddEventListener(type, handler);
      }
    );

    // Suppress console output
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const { type, handler } of windowListeners) {
      window.removeEventListener(type, handler);
    }
  });

  it('registers DOMContentLoaded and beforeunload listeners', async () => {
    await import('./faviconChanged');

    const types = windowListeners.map((l) => l.type);
    expect(types).toContain('DOMContentLoaded');
    expect(types).toContain('beforeunload');
  });

  it('initializes MutationObserver on document.head at DOMContentLoaded', async () => {
    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockObserve).toHaveBeenCalledWith(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'rel'],
    });
  });

  it('emits initial favicon href on DOMContentLoaded', async () => {
    const faviconEl = { href: 'https://example.com/favicon.ico' } as HTMLLinkElement;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return faviconEl;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/favicon.ico');
  });

  it('prefers shortcut icon over regular icon', async () => {
    const shortcutIcon = { href: 'https://example.com/shortcut.ico' } as HTMLLinkElement;
    const regularIcon = { href: 'https://example.com/regular.ico' } as HTMLLinkElement;

    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return shortcutIcon;
      if (sel === 'link[rel="icon"]') return regularIcon;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/shortcut.ico');
  });

  it('falls back to regular icon when shortcut icon not found', async () => {
    const regularIcon = { href: 'https://example.com/regular.ico' } as HTMLLinkElement;

    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="icon"]') return regularIcon;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/regular.ico');
  });

  it('does not emit when no favicon found in DOM', async () => {
    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).not.toHaveBeenCalled();
  });

  it('does not emit when favicon href has not changed', async () => {
    const faviconEl = { href: 'https://example.com/favicon.ico' } as HTMLLinkElement;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return faviconEl;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).toHaveBeenCalledTimes(1);

    // Trigger mutation with same href
    expect(mutationCallback).not.toBeNull();
    mutationCallback!(
      [{ type: 'attributes' }] as unknown as MutationRecord[],
      {} as MutationObserver
    );

    // Should NOT emit again — same href
    expect(mockSendFaviconChanged).toHaveBeenCalledTimes(1);
  });

  it('emits when favicon href changes via MutationObserver', async () => {
    const faviconEl = { href: 'https://example.com/v1.ico' } as HTMLLinkElement;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return faviconEl;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/v1.ico');

    // Change favicon href
    faviconEl.href = 'https://example.com/v2.ico';

    mutationCallback!(
      [{ type: 'attributes' }] as unknown as MutationRecord[],
      {} as MutationObserver
    );

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/v2.ico');
    expect(mockSendFaviconChanged).toHaveBeenCalledTimes(2);
  });

  it('emits on childList mutations (new favicon element added)', async () => {
    // Start with no favicon
    const querySpy = vi.spyOn(document, 'querySelector').mockReturnValue(null);

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).not.toHaveBeenCalled();

    // Now a favicon appears
    const faviconEl = { href: 'https://example.com/new.ico' } as HTMLLinkElement;
    querySpy.mockImplementation((sel: string) => {
      if (sel === 'link[rel="icon"]') return faviconEl;
      return null;
    });

    mutationCallback!(
      [{ type: 'childList' }] as unknown as MutationRecord[],
      {} as MutationObserver
    );

    expect(mockSendFaviconChanged).toHaveBeenCalledWith('https://example.com/new.ico');
  });

  it('disconnects observer on beforeunload', async () => {
    await import('./faviconChanged');

    // Init observer
    const dcHandler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    dcHandler!.handler(new Event('DOMContentLoaded'));

    // Fire cleanup
    const buHandler = windowListeners.find((l) => l.type === 'beforeunload');
    buHandler!.handler(new Event('beforeunload'));

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('disconnects previous observer when initObserver is called again', async () => {
    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');

    // First init
    handler!.handler(new Event('DOMContentLoaded'));
    expect(mockObserve).toHaveBeenCalledTimes(1);

    // Second init — should disconnect previous
    handler!.handler(new Event('DOMContentLoaded'));
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockObserve).toHaveBeenCalledTimes(2);
  });

  it('does not call sendFaviconChanged when gogchat API is unavailable', async () => {
    Object.defineProperty(window, 'gogchat', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const faviconEl = { href: 'https://example.com/favicon.ico' } as HTMLLinkElement;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return faviconEl;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendFaviconChanged).not.toHaveBeenCalled();
  });

  it('ignores mutations that are not childList or attributes type', async () => {
    const faviconEl = { href: 'https://example.com/favicon.ico' } as HTMLLinkElement;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') return faviconEl;
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Reset after initial emit
    mockSendFaviconChanged.mockClear();

    // Change href
    faviconEl.href = 'https://example.com/changed.ico';

    // Trigger mutation with characterData type (not childList or attributes)
    mutationCallback!(
      [{ type: 'characterData' }] as unknown as MutationRecord[],
      {} as MutationObserver
    );

    // Should NOT emit because characterData doesn't match the filter
    expect(mockSendFaviconChanged).not.toHaveBeenCalled();
  });

  it('only checks once per mutation batch (break after first match)', async () => {
    let callCount = 0;
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      if (sel === 'link[rel="shortcut icon"]') {
        callCount++;
        return { href: `https://example.com/v${callCount}.ico` } as HTMLLinkElement;
      }
      return null;
    });

    await import('./faviconChanged');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Reset counter after init
    const initialCount = callCount;

    // Multiple mutations in one batch
    mutationCallback!(
      [
        { type: 'attributes' },
        { type: 'childList' },
        { type: 'attributes' },
      ] as unknown as MutationRecord[],
      {} as MutationObserver
    );

    // getCurrentFavicon should only be called once per batch (break after first match)
    // One call for the first mutation that matches
    expect(callCount - initialCount).toBe(1);
  });
});
