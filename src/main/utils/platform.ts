/**
 * macOS Platform utilities
 * Centralized macOS-specific logic and provides unified API for macOS features
 */

import { app, shell, nativeImage, Tray, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import type Store from 'electron-store';
import type { StoreType } from '../../shared/types.js';
import { validateExternalURL } from '../../shared/validators.js';
import { logger } from './logger.js';

// ESM __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * macOS Platform configuration
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
 * macOS configuration
 */
const MACOS_CONFIG: PlatformConfig = {
  supportsOverlayIcon: false,
  supportsDockBadge: true,
  supportsTaskbarBadge: false,
  supportsTrayIcon: true,
  supportsAutoLaunch: true,
  supportsSpellChecker: true,
  defaultIconFormat: 'icns',
  trayIconSize: { width: 16, height: 16 },
};

/**
 * Platform detection (macOS only)
 */
export const platform = {
  isMac: true,
  name: 'darwin' as const,
  config: MACOS_CONFIG,
};

/**
 * Enforce macOS app location
 * Ensures the app is running from /Applications on macOS
 */
export function enforceMacOSAppLocation(): void {
  if (app.isPackaged === false) {
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

  try {
    const sanitizedUrl = validateExternalURL(issueUrl);
    void shell.openExternal(sanitizedUrl);
  } catch (error: unknown) {
    logger.feature('Platform').error('Failed to open GitHub issue URL', error);
  }
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
 * macOS Platform utilities class
 */
export class PlatformUtils {
  private readonly log = logger.feature('Platform');

  /**
   * Get the macOS app icon path
   */
  getAppIconPath(): string {
    return join(__dirname, '../../../resources/icons/normal/mac.icns');
  }

  /**
   * Get the macOS tray icon path
   * Uses Template for automatic dark/light mode adaptation
   */
  getTrayIconPath(): string {
    return join(__dirname, '../../../resources/icons/normal/trayTemplate.png');
  }

  /**
   * Create a tray icon with macOS-specific configuration
   */
  createTrayIcon(): Tray {
    const iconPath = this.getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);

    // Resize icon for macOS tray
    const resizedIcon = icon.resize({ width: 16, height: 16 });

    const tray = new Tray(resizedIcon);

    // macOS specific: Ignore double-click events
    tray.setIgnoreDoubleClickEvents(true);

    return tray;
  }

  /**
   * Set dock badge on macOS
   */
  setBadge(window: BrowserWindow, count: number): void {
    try {
      if (count === 0) {
        this.clearBadge(window);
        return;
      }

      // macOS: Use dock badge
      app.dock?.setBadge(count > 99 ? '99+' : count.toString());

      this.log.debug(`Dock badge set to ${count}`);
    } catch (error) {
      this.log.error('Failed to set dock badge:', error);
    }
  }

  /**
   * Clear dock badge
   */
  clearBadge(_window: BrowserWindow): void {
    try {
      app.dock?.setBadge('');
      this.log.debug('Dock badge cleared');
    } catch (error) {
      this.log.error('Failed to clear dock badge:', error);
    }
  }

  /**
   * Get macOS keyboard shortcuts
   */
  getShortcuts(): Record<string, string> {
    return {
      quit: 'Cmd+Q',
      preferences: 'Cmd+,',
      reload: 'Cmd+R',
      forceReload: 'Cmd+Shift+R',
      toggleDevTools: 'Cmd+Option+I',
      zoomIn: 'Cmd+Plus',
      zoomOut: 'Cmd+-',
      zoomReset: 'Cmd+0',
      find: 'Cmd+F',
      selectAll: 'Cmd+A',
      copy: 'Cmd+C',
      paste: 'Cmd+V',
      cut: 'Cmd+X',
      undo: 'Cmd+Z',
      redo: 'Cmd+Shift+Z',
    };
  }

  /**
   * Apply macOS-specific window options
   */
  applyWindowOptions(options: Electron.BrowserWindowConstructorOptions): void {
    // macOS specific window options
    options.titleBarStyle = 'hiddenInset';
    options.trafficLightPosition = { x: 16, y: 16 };
  }

  /**
   * Check if a feature is supported on macOS
   */
  isFeatureSupported(feature: keyof PlatformConfig): boolean {
    return Boolean(MACOS_CONFIG[feature]);
  }

  /**
   * Get macOS platform information for debugging
   */
  getPlatformInfo(): Record<string, unknown> {
    return {
      platform: 'darwin',
      arch: process.arch,
      version: process.getSystemVersion(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      locale: app.getLocale(),
      appVersion: app.getVersion(),
      ...MACOS_CONFIG,
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
 * Export feature support checks (macOS-specific)
 */
export const supports = {
  overlayIcon: () => false,
  dockBadge: () => true,
  taskbarBadge: () => false,
  trayIcon: () => true,
  autoLaunch: () => true,
  spellChecker: () => true,
};
