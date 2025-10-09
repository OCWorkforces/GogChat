/**
 * Platform detection and utilities
 * Replaces electron-util to reduce bundle size
 * Centralizes platform-specific logic and provides unified API for cross-platform features
 */

import { app, shell, nativeImage, Tray, BrowserWindow } from 'electron';
import { join } from 'path';
import os from 'os';
import type Store from 'electron-store';
import type { StoreType } from '../../shared/types';
import { logger } from './logger';

/**
 * Supported platforms
 */
export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * Platform-specific configuration
 */
interface PlatformConfig {
  supportsOverlayIcon: boolean;
  supportsDockBadge: boolean;
  supportsTaskbarBadge: boolean;
  supportsTrayIcon: boolean;
  supportsAutoLaunch: boolean;
  supportsSpellChecker: boolean;
  defaultIconFormat: 'ico' | 'icns' | 'png';
  trayIconSize: { width: number; height: number };
}

/**
 * Platform configurations
 */
const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  darwin: {
    supportsOverlayIcon: false,
    supportsDockBadge: true,
    supportsTaskbarBadge: false,
    supportsTrayIcon: true,
    supportsAutoLaunch: true,
    supportsSpellChecker: true,
    defaultIconFormat: 'icns',
    trayIconSize: { width: 16, height: 16 },
  },
  win32: {
    supportsOverlayIcon: true,
    supportsDockBadge: false,
    supportsTaskbarBadge: true,
    supportsTrayIcon: true,
    supportsAutoLaunch: true,
    supportsSpellChecker: true,
    defaultIconFormat: 'ico',
    trayIconSize: { width: 16, height: 16 },
  },
  linux: {
    supportsOverlayIcon: false,
    supportsDockBadge: false,
    supportsTaskbarBadge: false,
    supportsTrayIcon: true,
    supportsAutoLaunch: true,
    supportsSpellChecker: true,
    defaultIconFormat: 'png',
    trayIconSize: { width: 16, height: 16 },
  },
};

/**
 * Platform detection
 */
export const platform = {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  name: process.platform as Platform,
  config: PLATFORM_CONFIGS[process.platform as Platform] || PLATFORM_CONFIGS.linux,
};

/**
 * Enforce macOS app location
 * Ensures the app is running from /Applications on macOS
 */
export function enforceMacOSAppLocation(): void {
  if (!platform.isMac || app.isPackaged === false) {
    return;
  }

  const appPath = app.getAppPath();
  const isInApplications = appPath.startsWith('/Applications/');

  if (!isInApplications) {
    const message = 'This app needs to be in your Applications folder to work correctly.';

    // Show dialog in renderer if available, otherwise log
    void import('electron').then(({ dialog }) => {
      void dialog.showMessageBox({
        type: 'error',
        message,
        detail: 'Please move the app to your Applications folder and reopen it.',
        buttons: ['OK'],
      });
    });

    app.quit();
  }
}

/**
 * Open GitHub issue with pre-filled information
 * @param options - Issue configuration
 */
export function openNewGitHubIssue(options: {
  repoUrl: string;
  body?: string;
  title?: string;
  labels?: string[];
}): void {
  const { repoUrl, body = '', title = '', labels = [] } = options;

  // Construct GitHub issue URL
  const baseUrl = `${repoUrl}/issues/new`;
  const params = new URLSearchParams();

  if (title) params.append('title', title);
  if (body) params.append('body', body);
  if (labels.length > 0) params.append('labels', labels.join(','));

  const issueUrl = `${baseUrl}?${params.toString()}`;

  void shell.openExternal(issueUrl);
}

/**
 * Collect system debug information
 * @returns System information string
 */
export function debugInfo(): string {
  const info: string[] = [];

  // App information
  info.push(`App: ${app.getName()} ${app.getVersion()}`);
  info.push(`Electron: ${process.versions.electron}`);
  info.push(`Chrome: ${process.versions.chrome}`);
  info.push(`Node: ${process.versions.node}`);
  info.push(`V8: ${process.versions.v8}`);

  // System information
  info.push(`Platform: ${os.platform()} ${os.release()}`);
  info.push(`Arch: ${os.arch()}`);
  info.push(`Locale: ${app.getLocale()}`);

  // Memory information
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  info.push(
    `Memory: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)}GB free / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB total`
  );

  return info.join('\n');
}

/**
 * Check if this is the first app launch
 * Uses electron-store to persist first launch state
 * @param store - electron-store instance
 * @returns true if first launch
 */
export function isFirstAppLaunch(store: Store<StoreType>): boolean {
  const key = 'firstLaunchComplete';

  if (store.get(key)) {
    return false;
  }

  store.set(key, true);
  return true;
}

/**
 * Get app path with proper handling for packaged apps
 * @returns App path
 */
export function getAppPath(): string {
  return app.getAppPath();
}

/**
 * Check if app is packaged (production)
 * @returns true if packaged
 */
export function isPackaged(): boolean {
  return app.isPackaged;
}

/**
 * Check if running in development mode
 * @returns true if development
 */
export function isDevelopment(): boolean {
  return !app.isPackaged;
}

/**
 * Platform-specific utilities class
 */
export class PlatformUtils {
  private readonly log = logger.feature('Platform');

  /**
   * Get the appropriate app icon path for the current platform
   */
  getAppIconPath(): string {
    const iconDir = join(__dirname, '../../../resources/icons/normal');

    switch (platform.name) {
      case 'darwin':
        return join(iconDir, 'mac.icns');
      case 'win32':
        return join(iconDir, 'windows.ico');
      default:
        return join(iconDir, 'linux.png');
    }
  }

  /**
   * Get the appropriate tray icon path for the current platform
   */
  getTrayIconPath(): string {
    const iconDir = join(__dirname, '../../../resources/icons/normal');

    switch (platform.name) {
      case 'darwin':
        return join(iconDir, 'trayTemplate.png'); // Template for dark/light mode
      case 'win32':
        return join(iconDir, 'tray.ico');
      default:
        return join(iconDir, 'tray.png');
    }
  }

  /**
   * Create a tray icon with platform-specific configuration
   */
  createTrayIcon(): Tray {
    const iconPath = this.getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);

    // Resize icon based on platform requirements
    const resizedIcon = icon.resize(platform.config.trayIconSize);

    const tray = new Tray(resizedIcon);

    // Platform-specific tray configuration
    if (platform.isMac) {
      // macOS specific settings
      tray.setIgnoreDoubleClickEvents(true);
    } else if (platform.isWindows) {
      // Windows specific settings
      tray.setToolTip(app.getName());
    }

    return tray;
  }

  /**
   * Set badge/overlay icon based on platform
   */
  setBadge(window: BrowserWindow, count: number): void {
    try {
      if (count === 0) {
        this.clearBadge(window);
        return;
      }

      if (platform.isMac) {
        // macOS: Use dock badge
        app.dock?.setBadge(count > 99 ? '99+' : count.toString());
      } else if (platform.isWindows) {
        // Windows: Use overlay icon (simplified - actual implementation would generate icon)
        const description = `${count} unread message${count === 1 ? '' : 's'}`;
        // For now, just clear the overlay - in production, you'd create a proper overlay icon
        window.setOverlayIcon(null, description);
      }
      // Linux: No native badge support

      this.log.debug(`Badge set to ${count} on ${platform.name}`);
    } catch (error) {
      this.log.error(`Failed to set badge on ${platform.name}:`, error);
    }
  }

  /**
   * Clear badge/overlay icon
   */
  clearBadge(window: BrowserWindow): void {
    try {
      if (platform.isMac) {
        app.dock?.setBadge('');
      } else if (platform.isWindows) {
        window.setOverlayIcon(null, '');
      }

      this.log.debug(`Badge cleared on ${platform.name}`);
    } catch (error) {
      this.log.error(`Failed to clear badge on ${platform.name}:`, error);
    }
  }

  /**
   * Get platform-specific keyboard shortcuts
   */
  getShortcuts(): Record<string, string> {
    const modifier = platform.isMac ? 'Cmd' : 'Ctrl';

    return {
      quit: platform.isMac ? 'Cmd+Q' : 'Ctrl+Q',
      preferences: platform.isMac ? 'Cmd+,' : 'Ctrl+,',
      reload: `${modifier}+R`,
      forceReload: `${modifier}+Shift+R`,
      toggleDevTools: platform.isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
      zoomIn: `${modifier}+Plus`,
      zoomOut: `${modifier}+-`,
      zoomReset: `${modifier}+0`,
      find: `${modifier}+F`,
      selectAll: `${modifier}+A`,
      copy: `${modifier}+C`,
      paste: `${modifier}+V`,
      cut: `${modifier}+X`,
      undo: `${modifier}+Z`,
      redo: platform.isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
    };
  }

  /**
   * Apply platform-specific window options
   */
  applyWindowOptions(options: Electron.BrowserWindowConstructorOptions): void {
    if (platform.isMac) {
      // macOS specific window options
      options.titleBarStyle = 'hiddenInset';
      options.trafficLightPosition = { x: 16, y: 16 };
    } else if (platform.isWindows) {
      // Windows specific window options
      options.autoHideMenuBar = true;
    } else if (platform.isLinux) {
      // Linux specific window options
      options.icon = nativeImage.createFromPath(this.getAppIconPath());
    }
  }

  /**
   * Check if a feature is supported on the current platform
   */
  isFeatureSupported(feature: keyof PlatformConfig): boolean {
    return Boolean(platform.config[feature]);
  }

  /**
   * Get platform information for debugging
   */
  getPlatformInfo(): Record<string, unknown> {
    return {
      platform: platform.name,
      arch: process.arch,
      version: process.getSystemVersion(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      locale: app.getLocale(),
      appVersion: app.getVersion(),
      ...platform.config,
    };
  }
}

/**
 * Singleton instance
 */
let platformUtilsInstance: PlatformUtils | null = null;

/**
 * Get platform utilities instance
 */
export function getPlatformUtils(): PlatformUtils {
  if (!platformUtilsInstance) {
    platformUtilsInstance = new PlatformUtils();
  }
  return platformUtilsInstance;
}

/**
 * Export feature support checks
 */
export const supports = {
  overlayIcon: () => platform.config.supportsOverlayIcon,
  dockBadge: () => platform.config.supportsDockBadge,
  taskbarBadge: () => platform.config.supportsTaskbarBadge,
  trayIcon: () => platform.config.supportsTrayIcon,
  autoLaunch: () => platform.config.supportsAutoLaunch,
  spellChecker: () => platform.config.supportsSpellChecker,
};
