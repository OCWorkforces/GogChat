import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => {
  const resize = vi.fn().mockReturnValue('resized-icon');
  const traySetIgnoreDoubleClickEvents = vi.fn();

  return {
    dockSetBadge: vi.fn(),
    getAppPath: vi.fn().mockReturnValue('/app'),
    getLocale: vi.fn().mockReturnValue('en-US'),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    resize,
    createFromPath: vi.fn().mockReturnValue({ resize }),
    traySetIgnoreDoubleClickEvents,
    Tray: vi.fn().mockImplementation(function MockTray() {
      return {
        setIgnoreDoubleClickEvents: traySetIgnoreDoubleClickEvents,
      };
    }),
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: electronMocks.getAppPath,
    getLocale: electronMocks.getLocale,
    getVersion: electronMocks.getVersion,
    dock: {
      setBadge: electronMocks.dockSetBadge,
    },
  },
  nativeImage: {
    createFromPath: electronMocks.createFromPath,
  },
  Tray: electronMocks.Tray,
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('path', () => ({
  join: vi.fn((...segments: string[]) => segments.join('/')),
}));

describe('PlatformUtils on Windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('process', {
      ...process,
      arch: 'arm64',
      getSystemVersion: vi.fn().mockReturnValue('10.0.22631'),
      versions: {
        ...process.versions,
        electron: '42.2.0',
        chrome: '142.0.0',
        v8: '14.2.0',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Windows app and tray icon defaults from the injected config', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));

    expect(platformUtils.getAppIconPath()).toBe('/app/resources/icons/normal/win.ico');
    expect(platformUtils.getTrayIconPath()).toBe('/app/resources/icons/normal/16.png');
  });

  it('creates a Windows tray icon without macOS template double-click behavior', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));

    platformUtils.createTrayIcon();

    expect(electronMocks.createFromPath).toHaveBeenCalledWith('/app/resources/icons/normal/16.png');
    expect(electronMocks.resize).toHaveBeenCalledWith({ width: 16, height: 16 });
    expect(electronMocks.traySetIgnoreDoubleClickEvents).not.toHaveBeenCalled();
  });

  it('does not apply macOS titlebar or traffic light options on Windows', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));
    const options: BrowserWindowConstructorOptions = { title: 'GogChat' };

    platformUtils.applyWindowOptions(options);

    expect(options.title).toBe('GogChat');
    expect(options.titleBarStyle).toBeUndefined();
    expect(options.trafficLightPosition).toBeUndefined();
  });

  it('uses Ctrl-oriented Windows shortcuts', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));

    expect(platformUtils.getShortcuts()).toMatchObject({
      quit: 'Ctrl+Q',
      preferences: 'Ctrl+,',
      reload: 'Ctrl+R',
      forceReload: 'Ctrl+Shift+R',
      toggleDevTools: 'Ctrl+Shift+I',
      redo: 'Ctrl+Y',
    });
  });

  it('does not use Dock badge APIs for Windows badge updates', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));
    const window = {
      setOverlayIcon: vi.fn(),
    } satisfies Pick<BrowserWindow, 'setOverlayIcon'>;

    platformUtils.setBadge(window, 7);
    platformUtils.clearBadge(window);

    expect(electronMocks.dockSetBadge).not.toHaveBeenCalled();
    expect(window.setOverlayIcon).not.toHaveBeenCalled();
  });

  it('reports Windows platform info from the injected platform state', async () => {
    const { detectPlatform } = await import('./platformDetection.js');
    const { PlatformUtils } = await import('./platformUtils.js');
    const platformUtils = new PlatformUtils(detectPlatform('win32', 'x64'));

    expect(platformUtils.getPlatformInfo()).toMatchObject({
      platform: 'win32',
      arch: 'x64',
      isMac: false,
      isWindows: true,
      defaultIconFormat: 'ico',
      supportsOverlayIcon: false,
      supportsDockBadge: false,
      supportsAutoLaunch: false,
      supportsTrayIcon: true,
    });
  });
});
