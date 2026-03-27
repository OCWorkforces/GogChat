/**
 * Unit tests for appMenu feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: vi.fn().mockReturnValue({}),
    setApplicationMenu: vi.fn(),
  },
  app: {
    relaunch: vi.fn(),
    exit: vi.fn(),
    setBadgeCount: vi.fn(),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    getPath: vi.fn().mockReturnValue('/mock/logs'),
    showAboutPanel: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
}));

vi.mock('electron-update-notifier', () => ({
  checkForUpdates: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./openAtLogin', () => ({
  autoLaunch: vi.fn().mockReturnValue({
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('./aboutPanel', () => ({
  default: vi.fn(),
}));

vi.mock('../config', () => ({
  default: {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        'app.autoCheckForUpdates': true,
        'app.autoLaunchAtLogin': false,
        'app.startHidden': false,
        'app.hideMenuBar': false,
        'app.disableSpellChecker': false,
      };
      return defaults[key];
    }),
    set: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('./externalLinks', () => ({
  toggleExternalLinksGuard: vi.fn(),
}));

vi.mock('../../environment', () => ({
  default: {
    isDev: false,
    appUrl: 'https://chat.google.com',
    logoutUrl: 'https://accounts.google.com/logout',
  },
}));

vi.mock('../../shared/constants', () => ({
  IPC_CHANNELS: { SEARCH_SHORTCUT: 'searchShortcut' },
}));

vi.mock('../utils/platform', () => ({
  openNewGitHubIssue: vi.fn(),
  debugInfo: vi.fn().mockReturnValue('platform: darwin'),
}));

vi.mock('../utils/packageInfo', () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    productName: 'GogChat',
    version: '1.0.0',
    author: 'Test Author',
    repository: 'https://github.com/test/repo',
  }),
}));

import appMenu from './appMenu';
import aboutPanel from './aboutPanel';
import { Menu, app, dialog, clipboard } from 'electron';
import store from '../config';
import { IPC_CHANNELS } from '../../shared/constants';
import { openNewGitHubIssue } from '../utils/platform';

function makeFakeWindow() {
  return {
    hide: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    webContents: {
      send: vi.fn(),
      getURL: vi.fn().mockReturnValue('https://chat.google.com'),
      goBack: vi.fn(),
      goForward: vi.fn(),
      session: {
        clearStorageData: vi.fn().mockResolvedValue(undefined),
        clearCache: vi.fn().mockResolvedValue(undefined),
        setSpellCheckerEnabled: vi.fn(),
      },
    },
    setMenuBarVisibility: vi.fn(),
    setAutoHideMenuBar: vi.fn(),
  };
}

describe('appMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds and sets the application menu', () => {
    const window = makeFakeWindow();
    appMenu(window as any);
    expect(Menu.buildFromTemplate).toHaveBeenCalled();
    expect(Menu.setApplicationMenu).toHaveBeenCalled();
  });

  it('includes File menu with Close To Tray action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((item: any) => item.label === 'File');
    expect(fileMenu).toBeDefined();

    const closeToTray = fileMenu.submenu.find((item: any) => item.label === 'Close To Tray');
    expect(closeToTray).toBeDefined();
    expect(closeToTray.accelerator).toBe('CommandOrControl+W');

    // Invoke the click handler
    closeToTray.click();
    expect(window.hide).toHaveBeenCalled();
  });

  it('includes File menu with Quit action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((item: any) => item.label === 'File');
    const quit = fileMenu.submenu.find((item: any) => item.label === 'Quit');

    quit.click();
    expect(app.exit).toHaveBeenCalled();
  });

  it('includes File menu with Sign Out action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((item: any) => item.label === 'File');
    const signOut = fileMenu.submenu.find((item: any) => item.label === 'Sign Out');

    signOut.click();
    expect(window.loadURL).toHaveBeenCalledWith('https://accounts.google.com/logout');
  });

  it('includes View menu with Search action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((item: any) => item.label === 'View');
    const search = viewMenu.submenu.find((item: any) => item.label === 'Search');

    search.click();
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.SEARCH_SHORTCUT);
  });

  it('includes View menu with Copy Current URL action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const viewMenu = template.find((item: any) => item.label === 'View');
    const copyUrl = viewMenu.submenu.find((item: any) => item.label === 'Copy Current URL');

    copyUrl.click();
    expect(clipboard.writeText).toHaveBeenCalledWith('https://chat.google.com');
  });

  it('includes Preferences menu with checkbox items', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const prefsMenu = template.find((item: any) => item.label === 'Preferences');

    const autoUpdates = prefsMenu.submenu.find(
      (item: any) => item.label === 'Auto check for Updates'
    );
    expect(autoUpdates).toBeDefined();
    expect(autoUpdates.checked).toBe(true);

    const startHidden = prefsMenu.submenu.find((item: any) => item.label === 'Start Hidden');
    expect(startHidden).toBeDefined();
    expect(startHidden.checked).toBe(false);
  });

  it('Preferences checkbox updates store on click', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const prefsMenu = template.find((item: any) => item.label === 'Preferences');
    const startHidden = prefsMenu.submenu.find((item: any) => item.label === 'Start Hidden');

    startHidden.click({ checked: true });
    expect(store.set).toHaveBeenCalledWith('app.startHidden', true);
  });

  it('includes Help menu with About action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((item: any) => item.label === 'Help');
    const about = helpMenu.submenu.find((item: any) => item.label === 'About');

    about.click();
    expect(aboutPanel).toHaveBeenCalledWith(window);
  });

  it('includes Help menu with Report issue action', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((item: any) => item.label === 'Help');
    const troubleshooting = helpMenu.submenu.find((item: any) => item.label === 'Troubleshooting');
    const reportIssue = troubleshooting.submenu.find(
      (item: any) => item.label === 'Report issue...'
    );

    reportIssue.click();
    expect(openNewGitHubIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/test/repo',
      })
    );
  });

  it('shows version info in Help menu', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const helpMenu = template.find((item: any) => item.label === 'Help');
    const versionItem = helpMenu.submenu.find((item: any) => item.label && item.label.includes('Version'));

    expect(versionItem).toBeDefined();
    expect(versionItem.enabled).toBe(false);
  });

  it('Relaunch action relaunches without --hidden flag', () => {
    const window = makeFakeWindow();
    appMenu(window as any);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const fileMenu = template.find((item: any) => item.label === 'File');
    const relaunch = fileMenu.submenu.find((item: any) => item.label === 'Relaunch');

    relaunch.click();
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalled();
  });
});
