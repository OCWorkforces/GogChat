import { beforeEach, describe, expect, it, vi } from 'vitest';
import { electronMock } from '../../../tests/mocks/electron';

const isAllowedMock = vi.fn<(...args: unknown[]) => boolean>();
const storeGetMock = vi.fn<(key: string) => boolean>();
const storeSetMock = vi.fn<(key: string, value: boolean) => void>();

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

vi.mock('../config.js', () => ({
  default: {
    get: storeGetMock,
    set: storeSetMock,
  },
}));

describe('passkeySupport feature', () => {
  beforeEach(() => {
    electronMock.reset();
    vi.clearAllMocks();
    isAllowedMock.mockReturnValue(true);
    storeGetMock.mockReturnValue(false);

    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 1 });
    vi.spyOn(electronMock.shell, 'openExternal').mockResolvedValue();
    vi.spyOn(electronMock.shell, 'openPath').mockResolvedValue('');
  });

  it('registers PASSKEY_AUTH_FAILED listener on macOS', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    expect(electronMock.ipcMain.listenerCount('passkeyAuthFailed')).toBe(1);
  });

  it('ignores invalid payloads', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit('passkeyAuthFailed', {}, 'invalid');

    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('opens validated System Settings URL when requested', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(electronMock.shell.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy'
    );
  });

  it('supports cleanup by unregistering its channel listeners', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);
    expect(electronMock.ipcMain.listenerCount('passkeyAuthFailed')).toBe(1);

    feature.cleanupPasskeySupport();
    expect(electronMock.ipcMain.listenerCount('passkeyAuthFailed')).toBe(0);
  });
});
