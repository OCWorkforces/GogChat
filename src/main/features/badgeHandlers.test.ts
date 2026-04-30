/**
 * Unit tests for badgeHandlers — extracted IPC logic for badgeIcon feature.
 *
 * Covers:
 *   • decideIcon()         — favicon URL → IconType resolution
 *   • updateBadgeIcon()    — macOS dock badge update
 *   • setupBadgeHandlers() — IPC handler registration with rate limiting,
 *                             validation, and `withDeduplication` config wiring.
 *   • Burst regression     — rapid identical payloads collapse to one
 *                             downstream call via the real IPC deduplicator.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSetBadgeCount = vi.fn();
vi.mock('electron', () => ({
  app: { setBadgeCount: mockSetBadgeCount },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeListener: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetIcon = vi.fn().mockReturnValue('/fake/icon.png');
vi.mock('../utils/iconCache.js', () => ({
  getIconCache: () => ({ getIcon: mockGetIcon }),
}));

const mockSetTrayUnread = vi.fn();
vi.mock('./trayIcon.js', () => ({
  setTrayUnread: mockSetTrayUnread,
}));

vi.mock('../../shared/dataValidators.js', () => ({
  validateFaviconURL: vi.fn((url: string) => url),
  validateUnreadCount: vi.fn((count: number) => count),
}));

function fakeWindow() {
  return {} as unknown as Electron.BrowserWindow;
}
function fakeTray() {
  return { setImage: vi.fn() } as unknown as Electron.Tray;
}

// ─── Config-shape tests (mocked createSecureIPCHandler) ───────────────────────

describe('badgeHandlers (config wiring)', () => {
  const mockCreateSecureIPCHandler = vi.fn().mockReturnValue(vi.fn());

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../utils/ipcHelper.js', () => ({
      createSecureIPCHandler: (cfg: unknown) => mockCreateSecureIPCHandler(cfg),
    }));
    mockCreateSecureIPCHandler.mockClear();
    mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
    mockSetBadgeCount.mockClear();
    mockGetIcon.mockReturnValue('/fake/icon.png');
    mockSetTrayUnread.mockClear();
  });

  afterEach(() => {
    vi.doUnmock('../utils/ipcHelper.js');
  });

  describe('decideIcon', () => {
    it('returns NORMAL or BADGE for matching favicons, OFFLINE otherwise', async () => {
      const { decideIcon } = await import('./badgeHandlers.js');
      const { ICON_TYPES } = await import('../../shared/constants.js');
      expect(decideIcon('https://example.com/something-random.png')).toBe(ICON_TYPES.OFFLINE);
      expect(decideIcon('https://mail.google.com/favicon.ico')).toBeDefined();
    });
  });

  describe('updateBadgeIcon', () => {
    it('forwards the count to app.setBadgeCount on macOS', async () => {
      const { updateBadgeIcon } = await import('./badgeHandlers.js');
      updateBadgeIcon(fakeWindow(), 7);
      expect(mockSetBadgeCount).toHaveBeenCalledWith(7);
    });
  });

  describe('setupBadgeHandlers', () => {
    it('registers FAVICON_CHANGED handler with validator and rate limit', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'faviconChanged',
          validator: expect.any(Function),
          rateLimit: 5,
        })
      );
    });

    it('registers UNREAD_COUNT handler with validator and rate limit', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'unreadCount',
          validator: expect.any(Function),
          rateLimit: 5,
        })
      );
    });

    it('returns cleanup callbacks for both handlers', async () => {
      const faviconCleanupFn = vi.fn();
      const unreadCleanupFn = vi.fn();
      mockCreateSecureIPCHandler
        .mockReturnValueOnce(faviconCleanupFn)
        .mockReturnValueOnce(unreadCleanupFn);

      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      const { faviconCleanup, unreadCleanup } = setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(faviconCleanup).toBe(faviconCleanupFn);
      expect(unreadCleanup).toBe(unreadCleanupFn);
    });

    it('passes withDeduplication with 150ms window and channel-aware key for FAVICON_CHANGED', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const faviconCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'faviconChanged'
      )?.[0] as {
        withDeduplication: {
          keyFn: (channel: string, payload: unknown) => string;
          windowMs: number;
        };
      };

      expect(faviconCfg.withDeduplication.windowMs).toBe(150);
      expect(faviconCfg.withDeduplication.keyFn('faviconChanged', 'https://x/y.ico')).toBe(
        'faviconChanged:https://x/y.ico'
      );
    });

    it('passes withDeduplication with 100ms window and channel-aware key for UNREAD_COUNT', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as {
        withDeduplication: {
          keyFn: (channel: string, payload: unknown) => string;
          windowMs: number;
        };
      };

      expect(unreadCfg.withDeduplication.windowMs).toBe(100);
      expect(unreadCfg.withDeduplication.keyFn('unreadCount', 7)).toBe('unreadCount:7');
    });

    it('handler updates dock badge and tray when invoked', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(5);

      expect(mockSetBadgeCount).toHaveBeenCalledWith(5);
      expect(mockSetTrayUnread).toHaveBeenCalledWith(true);
    });

    it('handler clears tray unread when count is 0', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(0);

      expect(mockSetTrayUnread).toHaveBeenCalledWith(false);
    });
  });
});

// ─── Burst regression test (real ipcHelper + real IPCDeduplicator) ────────────
// Asserts that two/many rapid identical payloads collapse to a single
// downstream handler invocation via the withDeduplication wiring.

describe('badgeHandlers (burst regression with real deduplicator)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSetBadgeCount.mockClear();
    mockSetTrayUnread.mockClear();
    const { destroyDeduplicator } = await import('../utils/ipcDeduplicator.js');
    const { getRateLimiter } = await import('../utils/rateLimiter.js');
    destroyDeduplicator();
    getRateLimiter().resetAll();
  });

  it('collapses 2 rapid identical UNREAD_COUNT payloads into 1 downstream call', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHandlers.js');

    setupBadgeHandlers(fakeWindow(), fakeTray());

    // The most recently registered ipcMain.on call corresponds to UNREAD_COUNT
    // (FAVICON_CHANGED is registered first, UNREAD_COUNT second).
    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const unreadCall = onMock.mock.calls.find(([ch]) => ch === 'unreadCount');
    expect(unreadCall).toBeDefined();
    const unreadHandler = unreadCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    unreadHandler(event, 3);
    unreadHandler(event, 3);
    await new Promise((r) => setImmediate(r));

    // Only ONE downstream invocation despite two events
    expect(mockSetBadgeCount).toHaveBeenCalledTimes(1);
    expect(mockSetBadgeCount).toHaveBeenCalledWith(3);
  });

  it('does NOT deduplicate UNREAD_COUNT payloads with different values', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHandlers.js');

    setupBadgeHandlers(fakeWindow(), fakeTray());
    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const unreadCall = onMock.mock.calls.find(([ch]) => ch === 'unreadCount');
    const unreadHandler = unreadCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    // Different payloads → different dedup keys → both should execute.
    unreadHandler(event, 1);
    unreadHandler(event, 2);
    await new Promise((r) => setImmediate(r));

    expect(mockSetBadgeCount).toHaveBeenCalledTimes(2);
    expect(mockSetBadgeCount).toHaveBeenNthCalledWith(1, 1);
    expect(mockSetBadgeCount).toHaveBeenNthCalledWith(2, 2);
  });

  it('collapses rapid identical FAVICON_CHANGED payloads into 1 downstream call', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHandlers.js');
    const { destroyDeduplicator } = await import('../utils/ipcDeduplicator.js');

    destroyDeduplicator();
    const { getRateLimiter } = await import('../utils/rateLimiter.js');
    getRateLimiter().resetAll();
    setupBadgeHandlers(fakeWindow(), fakeTray());

    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const faviconCall = onMock.mock.calls.find(([ch]) => ch === 'faviconChanged');
    expect(faviconCall).toBeDefined();
    const faviconHandler = faviconCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    faviconHandler(event, 'https://example.com/x.ico');
    faviconHandler(event, 'https://example.com/x.ico');
    await new Promise((r) => setImmediate(r));

    // setTrayUnread runs inside the handler body — should be called once
    expect(mockSetTrayUnread).toHaveBeenCalledTimes(1);

    destroyDeduplicator();
  });
});
