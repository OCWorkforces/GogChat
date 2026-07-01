import { describe, expect, it } from 'vitest';

import {
  MACOS_CONFIG,
  WINDOWS_CONFIG,
  createSupportChecks,
  detectPlatform,
} from './platformDetection.js';

describe('platform detection', () => {
  it('detects macOS capabilities when the runtime platform is darwin', () => {
    const detected = detectPlatform('darwin', 'arm64');

    expect(detected.isMac).toBe(true);
    expect(detected.isWindows).toBe(false);
    expect(detected.name).toBe('darwin');
    expect(detected.arch).toBe('arm64');
    expect(detected.config).toBe(MACOS_CONFIG);
  });

  it('detects Windows capabilities when the runtime platform is win32', () => {
    const detected = detectPlatform('win32', 'x64');

    expect(detected.isMac).toBe(false);
    expect(detected.isWindows).toBe(true);
    expect(detected.name).toBe('win32');
    expect(detected.arch).toBe('x64');
    expect(detected.config).toBe(WINDOWS_CONFIG);
    expect(detected.config.defaultIconFormat).toBe('ico');
    expect(detected.config.supportsDockBadge).toBe(false);
    expect(detected.config.supportsTrayIcon).toBe(true);
    expect(detected.config.supportsAutoLaunch).toBe(false);
    expect(detected.config.supportsSpellChecker).toBe(true);
  });

  it('falls back to unsupported capabilities without naming Linux support', () => {
    const detected = detectPlatform('linux', 'x64');

    expect(detected.isMac).toBe(false);
    expect(detected.isWindows).toBe(false);
    expect(detected.name).toBe('unsupported');
    expect(detected.config.supportsTrayIcon).toBe(false);
    expect(detected.config.supportsAutoLaunch).toBe(false);
    expect(detected.config.defaultIconFormat).toBe('png');
  });

  it('creates support helpers from the supplied active config', () => {
    const supports = createSupportChecks(detectPlatform('win32', 'x64'));

    expect(supports.overlayIcon()).toBe(false);
    expect(supports.dockBadge()).toBe(false);
    expect(supports.taskbarBadge()).toBe(false);
    expect(supports.trayIcon()).toBe(true);
    expect(supports.autoLaunch()).toBe(false);
    expect(supports.spellChecker()).toBe(true);
  });
});
