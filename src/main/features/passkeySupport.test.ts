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

  it('suppresses dialog when app.suppressPasskeyDialog is true', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    storeGetMock.mockImplementation((key: string) => {
      if (key === 'app.suppressPasskeyDialog') return true;
      return false;
    });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('sets suppress flag when user selects "Don\'t Show Again" (response === 2)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 2 });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(storeSetMock).toHaveBeenCalledWith('app.suppressPasskeyDialog', true);
  });

  it('falls back to shell.openPath when shell.openExternal throws', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });
    vi.spyOn(electronMock.shell, 'openExternal').mockRejectedValue(new Error('openExternal failed'));
    vi.spyOn(electronMock.shell, 'openPath').mockResolvedValue('');

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    // Flush enough microtasks for: handler → dialog → openExternal rejection → openPath
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(electronMock.shell.openPath).toHaveBeenCalledWith(
      '/System/Applications/System Settings.app'
    );
  });

  it('logs error when both shell.openExternal and shell.openPath fail', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });
    vi.spyOn(electronMock.shell, 'openExternal').mockRejectedValue(new Error('openExternal failed'));
    vi.spyOn(electronMock.shell, 'openPath').mockRejectedValue(new Error('openPath failed'));

    const log = (await import('electron-log')).default;

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    // Flush enough microtasks for the full async chain
    for (let i = 0; i < 15; i++) await Promise.resolve();

    expect(log.error).toHaveBeenCalledWith(
      '[Passkey Support] Fallback also failed:',
      expect.any(Error)
    );
  });

  it('skips initialization on non-macOS platform', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    expect(electronMock.ipcMain.listenerCount('passkeyAuthFailed')).toBe(0);
  });

  it('cleanupPasskeySupport is safe to call when no handler registered', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    // Should not throw even when no cleanup fn exists
    expect(() => feature.cleanupPasskeySupport()).not.toThrow();
  });

  it('cleanupPasskeySupport is idempotent (double-call)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    expect(() => {
      feature.cleanupPasskeySupport();
      feature.cleanupPasskeySupport();
    }).not.toThrow();
  });

  it('logs error when dialog.showMessageBox rejects (handler outer catch)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockRejectedValue(new Error('dialog crash'));

    const log = (await import('electron-log')).default;

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    // Flush microtasks for the rejection to propagate
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(log.error).toHaveBeenCalledWith(
      '[Passkey Support] Error handling passkey failure:',
      expect.any(Error)
    );
  });

  it('logs error when cleanupPasskeySupport internals throw', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const log = (await import('electron-log')).default;

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    // Force the cleanup function to throw by removing all listeners
    // then patching ipcMain.removeListener to throw
    const origRemoveListener = electronMock.ipcMain.removeListener;
    electronMock.ipcMain.removeListener = () => { throw new Error('remove failed'); };

    expect(() => feature.cleanupPasskeySupport()).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(
      '[Passkey Support] Failed to cleanup passkey support:',
      expect.any(Error)
    );

    // Restore
    electronMock.ipcMain.removeListener = origRemoveListener;
  });

  it('does nothing when user clicks Cancel (response === 1)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 1 });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError', timestamp: Date.now() }
    );

    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(electronMock.shell.openExternal).not.toHaveBeenCalled();
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it('handles missing timestamp in payload (fallback to validated timestamp)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.spyOn(electronMock.dialog, 'showMessageBox').mockResolvedValue({ response: 1 });

    const feature = await import('./passkeySupport.js');
    feature.default({} as never);

    // Send payload without timestamp — should not crash
    electronMock.ipcMain.emit(
      'passkeyAuthFailed',
      {},
      { errorType: 'NotAllowedError' }
    );

    for (let i = 0; i < 10; i++) await Promise.resolve();

    // Should still show dialog (timestamp defaults from validator)
    expect(electronMock.dialog.showMessageBox).toHaveBeenCalled();
  });
});
