/**
 * macOS Platform utilities class
 * Provides tray icon creation, dock badge management, keyboard shortcuts,
 * window options, and feature support queries.
 */

import type { BrowserWindow } from 'electron';
import { app, nativeImage, Tray } from 'electron';
import { join } from 'path';
import { logger } from './logger.js';
import { MACOS_CONFIG, type PlatformConfig } from './platformDetection.js';

// Resolve resource paths based on packaged vs dev mode
// In packaged DMG: extraResources places resources/ at process.resourcesPath/resources/
// In dev: resources/ is at the project root via app.getAppPath()
const resourceBase = app.isPackaged ? process.resourcesPath : app.getAppPath();
const resolveResourcePath = (...segments: string[]) => join(resourceBase, ...segments);

/**
 * macOS Platform utilities class
 */
export class PlatformUtils {
  private readonly log = logger.feature('Platform');

  /**
   * Get the macOS app icon path
   */
  getAppIconPath(): string {
    return resolveResourcePath('resources/icons/normal/mac.icns');
  }

  /**
   * Get the macOS tray icon path
   * Uses Template for automatic dark/light mode adaptation
   */
  getTrayIconPath(): string {
    return resolveResourcePath('resources/icons/tray/iconTemplate.png');
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
