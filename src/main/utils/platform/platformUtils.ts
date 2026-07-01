import type { BrowserWindow } from 'electron';
import { app, nativeImage, Tray } from 'electron';
import { join } from 'path';
import { logger } from '../lifecycle/logger.js';
import {
  platform,
  type PlatformFeature,
  type PlatformShortcutMap,
  type PlatformState,
} from './platformDetection.js';

// Resolve resource paths based on packaged vs dev mode
// In packaged DMG: extraResources places resources/ at process.resourcesPath/resources/
// In dev: resources/ is at the project root via app.getAppPath()
const resourceBase = app.isPackaged ? process.resourcesPath : app.getAppPath();
const resolveResourcePath = (...segments: string[]) => join(resourceBase, ...segments);

/**
 * Platform utilities class
 */
export class PlatformUtils {
  private readonly log = logger.feature('Platform');

  constructor(private readonly activePlatform: PlatformState = platform) {}

  getAppIconPath(): string {
    return resolveResourcePath(
      'resources/icons/normal',
      this.activePlatform.config.appIconFileName
    );
  }

  getTrayIconPath(): string {
    return resolveResourcePath('resources/icons', this.activePlatform.config.trayIconFileName);
  }

  createTrayIcon(): Tray {
    const iconPath = this.getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    const { trayIconSize } = this.activePlatform.config;

    const resizedIcon = icon.resize(trayIconSize);

    const tray = new Tray(resizedIcon);

    if (this.activePlatform.config.ignoreTrayDoubleClickEvents) {
      tray.setIgnoreDoubleClickEvents(true);
    }

    return tray;
  }

  setBadge(_window: Pick<BrowserWindow, 'setOverlayIcon'>, count: number): void {
    try {
      if (count === 0) {
        this.clearBadge(_window);
        return;
      }

      if (this.activePlatform.config.supportsDockBadge) {
        app.dock?.setBadge(count > 99 ? '99+' : count.toString());
      } else if (this.activePlatform.config.supportsTaskbarBadge) {
        app.setBadgeCount(count);
      }

      this.log.debug(`${this.activePlatform.name} badge set to ${count}`);
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
      this.log.error('Failed to set dock badge:', error);
    }
  }

  clearBadge(_window: Pick<BrowserWindow, 'setOverlayIcon'>): void {
    try {
      if (this.activePlatform.config.supportsDockBadge) {
        app.dock?.setBadge('');
      } else if (this.activePlatform.config.supportsTaskbarBadge) {
        app.setBadgeCount(0);
      }

      this.log.debug(`${this.activePlatform.name} badge cleared`);
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
      this.log.error('Failed to clear dock badge:', error);
    }
  }

  getShortcuts(): PlatformShortcutMap {
    return this.activePlatform.config.shortcuts;
  }

  applyWindowOptions(options: Electron.BrowserWindowConstructorOptions): void {
    Object.assign(options, this.activePlatform.config.windowOptions);
  }

  isFeatureSupported(feature: PlatformFeature): boolean {
    return this.activePlatform.config[feature];
  }

  getPlatformInfo(): Record<string, unknown> {
    return {
      platform: this.activePlatform.name,
      arch: this.activePlatform.arch,
      isMac: this.activePlatform.isMac,
      isWindows: this.activePlatform.isWindows,
      version: process.getSystemVersion(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      locale: app.getLocale(),
      appVersion: app.getVersion(),
      ...this.activePlatform.config,
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
 * Destroy the platform utilities singleton.
 * Clears the cached instance so the next call to {@link getPlatformUtils}
 * returns a fresh `PlatformUtils`. The instance itself holds no resources
 * (its only field is a logger), so no further teardown is required.
 */
export function destroyPlatformUtils(): void {
  platformUtilsInstance = null;
}
