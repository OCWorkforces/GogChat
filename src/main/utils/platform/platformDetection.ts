/**
 * macOS Platform detection
 * Platform configuration, detection flags, and feature support declarations.
 */

/**
 * macOS Platform configuration
 */
export interface PlatformConfig {
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
export const MACOS_CONFIG: PlatformConfig = {
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
