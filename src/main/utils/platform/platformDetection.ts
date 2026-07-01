export const SUPPORTED_PLATFORM_NAMES = {
  macOS: 'darwin',
  windows: 'win32',
} as const;

const UNSUPPORTED_PLATFORM_NAME = 'unsupported';

export type SupportedPlatformName =
  (typeof SUPPORTED_PLATFORM_NAMES)[keyof typeof SUPPORTED_PLATFORM_NAMES];
export type PlatformName = SupportedPlatformName | typeof UNSUPPORTED_PLATFORM_NAME;
export type PlatformFeature =
  | 'supportsOverlayIcon'
  | 'supportsDockBadge'
  | 'supportsTaskbarBadge'
  | 'supportsTrayIcon'
  | 'supportsAutoLaunch'
  | 'supportsSpellChecker';

export type PlatformShortcutAction =
  | 'quit'
  | 'preferences'
  | 'reload'
  | 'forceReload'
  | 'toggleDevTools'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'find'
  | 'selectAll'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'undo'
  | 'redo';

export type PlatformShortcutMap = Readonly<Record<PlatformShortcutAction, string>>;

export interface PlatformWindowOptions {
  readonly titleBarStyle?: Electron.BrowserWindowConstructorOptions['titleBarStyle'];
  readonly trafficLightPosition?: Electron.BrowserWindowConstructorOptions['trafficLightPosition'];
}

export interface PlatformConfig {
  readonly supportsOverlayIcon: boolean;
  readonly supportsDockBadge: boolean;
  readonly supportsTaskbarBadge: boolean;
  readonly supportsTrayIcon: boolean;
  readonly supportsAutoLaunch: boolean;
  readonly supportsSpellChecker: boolean;
  readonly defaultIconFormat: 'ico' | 'icns' | 'png';
  readonly appIconFileName: string;
  readonly trayIconFileName: string;
  readonly trayIconSize: { readonly width: number; readonly height: number };
  readonly useTemplateTrayIcon: boolean;
  readonly ignoreTrayDoubleClickEvents: boolean;
  readonly shortcuts: PlatformShortcutMap;
  readonly windowOptions: PlatformWindowOptions;
}

export interface PlatformState {
  readonly isMac: boolean;
  readonly isWindows: boolean;
  readonly name: PlatformName;
  readonly arch: NodeJS.Architecture;
  readonly config: PlatformConfig;
}

export interface PlatformSupportChecks {
  readonly overlayIcon: () => boolean;
  readonly dockBadge: () => boolean;
  readonly taskbarBadge: () => boolean;
  readonly trayIcon: () => boolean;
  readonly autoLaunch: () => boolean;
  readonly spellChecker: () => boolean;
}

const MACOS_SHORTCUTS: PlatformShortcutMap = {
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

const WINDOWS_SHORTCUTS: PlatformShortcutMap = {
  quit: 'Ctrl+Q',
  preferences: 'Ctrl+,',
  reload: 'Ctrl+R',
  forceReload: 'Ctrl+Shift+R',
  toggleDevTools: 'Ctrl+Shift+I',
  zoomIn: 'Ctrl+Plus',
  zoomOut: 'Ctrl+-',
  zoomReset: 'Ctrl+0',
  find: 'Ctrl+F',
  selectAll: 'Ctrl+A',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  cut: 'Ctrl+X',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
};

export const MACOS_CONFIG = {
  supportsOverlayIcon: false,
  supportsDockBadge: true,
  supportsTaskbarBadge: false,
  supportsTrayIcon: true,
  supportsAutoLaunch: true,
  supportsSpellChecker: true,
  defaultIconFormat: 'icns',
  appIconFileName: 'mac.icns',
  trayIconFileName: 'tray/iconTemplate.png',
  trayIconSize: { width: 16, height: 16 },
  useTemplateTrayIcon: true,
  ignoreTrayDoubleClickEvents: true,
  shortcuts: MACOS_SHORTCUTS,
  windowOptions: {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  },
} as const satisfies PlatformConfig;

export const WINDOWS_CONFIG = {
  supportsOverlayIcon: false,
  supportsDockBadge: false,
  supportsTaskbarBadge: false,
  supportsTrayIcon: true,
  supportsAutoLaunch: false,
  supportsSpellChecker: true,
  defaultIconFormat: 'ico',
  appIconFileName: 'win.ico',
  trayIconFileName: 'normal/16.png',
  trayIconSize: { width: 16, height: 16 },
  useTemplateTrayIcon: false,
  ignoreTrayDoubleClickEvents: false,
  shortcuts: WINDOWS_SHORTCUTS,
  windowOptions: {},
} as const satisfies PlatformConfig;

const UNSUPPORTED_CONFIG = {
  supportsOverlayIcon: false,
  supportsDockBadge: false,
  supportsTaskbarBadge: false,
  supportsTrayIcon: false,
  supportsAutoLaunch: false,
  supportsSpellChecker: false,
  defaultIconFormat: 'png',
  appIconFileName: '256.png',
  trayIconFileName: 'normal/16.png',
  trayIconSize: { width: 16, height: 16 },
  useTemplateTrayIcon: false,
  ignoreTrayDoubleClickEvents: false,
  shortcuts: WINDOWS_SHORTCUTS,
  windowOptions: {},
} as const satisfies PlatformConfig;

export function detectPlatform(
  runtimePlatform: NodeJS.Platform,
  runtimeArch: NodeJS.Architecture
): PlatformState {
  switch (runtimePlatform) {
    case SUPPORTED_PLATFORM_NAMES.macOS:
      return {
        isMac: true,
        isWindows: false,
        name: SUPPORTED_PLATFORM_NAMES.macOS,
        arch: runtimeArch,
        config: MACOS_CONFIG,
      };
    case SUPPORTED_PLATFORM_NAMES.windows:
      return {
        isMac: false,
        isWindows: true,
        name: SUPPORTED_PLATFORM_NAMES.windows,
        arch: runtimeArch,
        config: WINDOWS_CONFIG,
      };
    default:
      return {
        isMac: false,
        isWindows: false,
        name: UNSUPPORTED_PLATFORM_NAME,
        arch: runtimeArch,
        config: UNSUPPORTED_CONFIG,
      };
  }
}

export function createSupportChecks(activePlatform: PlatformState): PlatformSupportChecks {
  return {
    overlayIcon: () => activePlatform.config.supportsOverlayIcon,
    dockBadge: () => activePlatform.config.supportsDockBadge,
    taskbarBadge: () => activePlatform.config.supportsTaskbarBadge,
    trayIcon: () => activePlatform.config.supportsTrayIcon,
    autoLaunch: () => activePlatform.config.supportsAutoLaunch,
    spellChecker: () => activePlatform.config.supportsSpellChecker,
  };
}

export const platform = detectPlatform(process.platform, process.arch);
export const supports = createSupportChecks(platform);
