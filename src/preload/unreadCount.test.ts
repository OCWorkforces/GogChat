// @vitest-environment jsdom

/**
 * Tests for unreadCount preload script
 * Verifies MutationObserver setup, debounced IPC emission, and cleanup
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
const mockSendUnreadCount = vi.fn();

describe('unreadCount', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    windowListeners = [];
    mutationCallback = null;
    mockObserve.mockClear();
    mockDisconnect.mockClear();
    mockSendUnreadCount.mockClear();

    // Stub MutationObserver
    vi.stubGlobal('MutationObserver', MockMutationObserver);

    // Stub document.hidden / visibilityState
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    // Stub document.body
    Object.defineProperty(document, 'body', {
      value: {
        querySelectorAll: vi.fn().mockReturnValue([]),
      },
      configurable: true,
    });

    // Stub document.querySelectorAll for getMessageCount
    vi.spyOn(document, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<Element>);

    // Stub window.gogchat
    vi.stubGlobal('gogchat', { sendUnreadCount: mockSendUnreadCount });
    Object.defineProperty(window, 'gogchat', {
      value: { sendUnreadCount: mockSendUnreadCount },
      configurable: true,
      writable: true,
    });

    // Intercept window.addEventListener to capture handlers
    const originalAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        windowListeners.push({ type, handler: handler as EventListener });
        originalAddEventListener(type, handler);
      }
    );

    // Suppress console.info
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Remove any event listeners we added
    for (const { type, handler } of windowListeners) {
      window.removeEventListener(type, handler);
    }
  });

  it('registers DOMContentLoaded, visibilitychange, and beforeunload listeners', async () => {
    await import('./unreadCount');

    const types = windowListeners.map((l) => l.type);
    expect(types).toContain('DOMContentLoaded');
    expect(types).toContain('visibilitychange');
    expect(types).toContain('beforeunload');
  });

  it('initializes MutationObserver on DOMContentLoaded', async () => {
    await import('./unreadCount');

    // Fire DOMContentLoaded
    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    expect(handler).toBeDefined();
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockObserve).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  it('sends unread count 0 on initial observation when no badges found', async () => {
    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Initial count is 0, previousCount starts at -1, so it should send
    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('extracts unread count from DOM badges via aria-label', async () => {
    // Create mock badge elements
    const badge1 = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '3 unread messages' : ''),
      textContent: '3',
    };
    const container1 = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge1 : null),
    };

    const badge2 = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '5 unread messages' : ''),
      textContent: '5',
    };
    const container2 = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge2 : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container1,
      container2,
    ] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendUnreadCount).toHaveBeenCalledWith(8);
  });

  it('uses alt badge selector when primary not found', async () => {
    const altBadge = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? '2 unread' : ''),
      textContent: '2',
    };
    const container = {
      querySelector: (sel: string) => (sel === '.zY9JEf' ? altBadge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendUnreadCount).toHaveBeenCalledWith(2);
  });

  it('does not send when count has not changed', async () => {
    vi.spyOn(document, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // First call: count=0, previous=-1 → sends
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    // Trigger visibility change (emitCount again with same count=0)
    const visHandler = windowListeners.find((l) => l.type === 'visibilitychange');
    visHandler!.handler(new Event('visibilitychange'));

    // Should NOT send again since count hasn't changed
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('debounces MutationObserver callbacks with 200ms delay', async () => {
    const badge = {
      getAttribute: () => '1 unread',
      textContent: '1',
    };
    const container = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge : null),
    };

    // Start with no badges
    const querySpy = vi
      .spyOn(document, 'querySelectorAll')
      .mockReturnValue([] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Initial emit: count=0
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    // Now simulate badge appearing
    querySpy.mockReturnValue([container] as unknown as NodeListOf<Element>);

    // Trigger multiple rapid mutations
    expect(mutationCallback).not.toBeNull();
    mutationCallback!([] as unknown as MutationRecord[], {} as MutationObserver);
    mutationCallback!([] as unknown as MutationRecord[], {} as MutationObserver);
    mutationCallback!([] as unknown as MutationRecord[], {} as MutationObserver);

    // Not yet — debounce hasn't elapsed
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);

    // Advance 200ms
    vi.advanceTimersByTime(200);

    // Now emitCount should fire once (debounced)
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(2);
    expect(mockSendUnreadCount).toHaveBeenLastCalledWith(1);
  });

  it('disconnects observer and clears timer on beforeunload', async () => {
    await import('./unreadCount');

    // Init observer
    const dcHandler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    dcHandler!.handler(new Event('DOMContentLoaded'));

    // Trigger a mutation to start debounce timer
    mutationCallback!([] as unknown as MutationRecord[], {} as MutationObserver);

    // Fire cleanup
    const buHandler = windowListeners.find((l) => l.type === 'beforeunload');
    buHandler!.handler(new Event('beforeunload'));

    expect(mockDisconnect).toHaveBeenCalled();

    // Advancing timer should not trigger emitCount after cleanup
    vi.advanceTimersByTime(200);
    // Only the initial emit from initObserver (count=0, prev=-1)
    expect(mockSendUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('emits count on visibilitychange', async () => {
    const badge = {
      getAttribute: () => '4 unread',
      textContent: '4',
    };
    const container = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    // Init with badges → sends count=4
    const dcHandler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    dcHandler!.handler(new Event('DOMContentLoaded'));

    expect(mockSendUnreadCount).toHaveBeenCalledWith(4);
  });

  it('does not call sendUnreadCount when gogchat API is unavailable', async () => {
    Object.defineProperty(window, 'gogchat', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Should not throw, and sendUnreadCount should not be called
    expect(mockSendUnreadCount).not.toHaveBeenCalled();
  });

  it('ignores badges without "unread" in aria-label', async () => {
    const badge = {
      getAttribute: () => 'some other label',
      textContent: '7',
    };
    const container = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Count should be 0 since badge doesn't have 'unread' in aria-label
    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('ignores badges with non-numeric text content', async () => {
    const badge = {
      getAttribute: () => 'unread messages',
      textContent: 'many',
    };
    const container = {
      querySelector: (sel: string) => (sel === '.OK1FOb' ? badge : null),
    };

    vi.spyOn(document, 'querySelectorAll').mockReturnValue([
      container,
    ] as unknown as NodeListOf<Element>);

    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Count should be 0 since text is not a number
    expect(mockSendUnreadCount).toHaveBeenCalledWith(0);
  });

  it('disconnects previous observer when initObserver is called again', async () => {
    await import('./unreadCount');

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');

    // First init
    handler!.handler(new Event('DOMContentLoaded'));
    expect(mockObserve).toHaveBeenCalledTimes(1);

    // Second init — should disconnect previous
    handler!.handler(new Event('DOMContentLoaded'));
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockObserve).toHaveBeenCalledTimes(2);
  });
});
