import { beforeEach, describe, expect, it, vi } from 'vitest';
import { electronMock } from '../../../tests/mocks/electron';
import { IPC_CHANNELS } from '../../shared/constants.js';

const isAllowedMock = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('electron', () => electronMock);

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/rateLimiter.js', () => ({
  getRateLimiter: () => ({
    isAllowed: isAllowedMock,
  }),
}));

vi.mock('../utils/iconCache.js', () => ({
  getIconCache: () => ({
    getIcon: vi.fn(() => ({})),
  }),
}));

vi.mock('../utils/ipcDeduplicator.js', () => ({
  getDeduplicator: () => ({
    deduplicate: async (_key: string, fn: () => Promise<void>) => {
      await fn();
    },
  }),
}));

describe('feature IPC cleanup ownership', () => {
  beforeEach(() => {
    electronMock.reset();
    vi.clearAllMocks();
    isAllowedMock.mockReturnValue(true);
  });

  it('cleanupBadgeIcon removes only feature-owned listeners', async () => {
    const mod = await import('./badgeIcon.js');

    const tray = { setImage: vi.fn() };
    mod.default({} as never, tray as never);

    const externalFaviconListener = vi.fn();
    const externalUnreadListener = vi.fn();

    electronMock.ipcMain.on(IPC_CHANNELS.FAVICON_CHANGED, externalFaviconListener);
    electronMock.ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, externalUnreadListener);

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.FAVICON_CHANGED)).toBe(2);
    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.UNREAD_COUNT)).toBe(2);

    mod.cleanupBadgeIcon();

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.FAVICON_CHANGED)).toBe(1);
    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.UNREAD_COUNT)).toBe(1);

    electronMock.ipcMain.emit(
      IPC_CHANNELS.FAVICON_CHANGED,
      {},
      'https://chat.google.com/favicon.ico'
    );
    electronMock.ipcMain.emit(IPC_CHANNELS.UNREAD_COUNT, {}, 4);

    expect(externalFaviconListener).toHaveBeenCalled();
    expect(externalUnreadListener).toHaveBeenCalled();
  });

  it('cleanupNotificationHandler removes only feature-owned listeners', async () => {
    const mod = await import('./handleNotification.js');

    const windowMock = {
      isVisible: vi.fn(() => true),
      isFocused: vi.fn(() => true),
      show: vi.fn(),
    };

    mod.default(windowMock as never);

    const externalShowListener = vi.fn();
    const externalClickedListener = vi.fn();

    electronMock.ipcMain.on(IPC_CHANNELS.NOTIFICATION_SHOW, externalShowListener);
    electronMock.ipcMain.on(IPC_CHANNELS.NOTIFICATION_CLICKED, externalClickedListener);

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.NOTIFICATION_SHOW)).toBe(2);
    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.NOTIFICATION_CLICKED)).toBe(2);

    mod.cleanupNotificationHandler();

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.NOTIFICATION_SHOW)).toBe(1);
    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.NOTIFICATION_CLICKED)).toBe(1);

    electronMock.ipcMain.emit(IPC_CHANNELS.NOTIFICATION_SHOW, {}, { title: 'X' });
    electronMock.ipcMain.emit(IPC_CHANNELS.NOTIFICATION_CLICKED, {});

    expect(externalShowListener).toHaveBeenCalled();
    expect(externalClickedListener).toHaveBeenCalled();
  });

  it('cleanupConnectivityHandler removes only feature-owned listeners', async () => {
    const mod = await import('./inOnline.js');
    mod.default({} as never);

    const externalListener = vi.fn();
    electronMock.ipcMain.on(IPC_CHANNELS.CHECK_IF_ONLINE, externalListener);

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.CHECK_IF_ONLINE)).toBe(2);

    mod.cleanupConnectivityHandler();

    expect(electronMock.ipcMain.listenerCount(IPC_CHANNELS.CHECK_IF_ONLINE)).toBe(1);

    electronMock.ipcMain.emit(IPC_CHANNELS.CHECK_IF_ONLINE, {});
    expect(externalListener).toHaveBeenCalled();
  });
});
