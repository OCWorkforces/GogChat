/**
 * Unit tests for aboutPanel feature with custom BrowserWindow dialog.
 *
 * Uses dynamic import to work around Bun's vi.mock limitation:
 * static imports of modules that runtime-import from 'electron'
 * require vi.hoisted (unavailable in Bun) to expose mock state.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => {
  const BW = function MockBW(this: any) {
    this.loadURL = vi.fn();
    this.show = vi.fn();
    this.setAlwaysOnTop = vi.fn();
    this.setMenuBarVisibility = vi.fn();
    this.once = vi.fn();
    this.focus = vi.fn();
    this.restore = vi.fn();
    this.isMinimized = vi.fn().mockReturnValue(false);
    this.isDestroyed = vi.fn().mockReturnValue(false);
    this.webContents = { url: '' };
    (BW as any).__instances.push(this);
  };
  (BW as any).__instances = [];
  return { BrowserWindow: BW };
});

vi.mock('os', () => ({
  default: {
    type: vi.fn().mockReturnValue('Darwin'),
    release: vi.fn().mockReturnValue('23.0.0'),
    arch: vi.fn().mockReturnValue('arm64'),
  },
}));

vi.mock('../utils/packageInfo.js', () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    productName: 'GogChat',
    version: '1.0.0',
    author: 'Test Author',
  }),
}));

vi.mock('../utils/iconCache.js', () => ({
  getIconCache: vi.fn().mockReturnValue({
    getIcon: vi.fn().mockReturnValue({
      isEmpty: vi.fn().mockReturnValue(false),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,FAKE_AURA'),
    }),
  }),
}));

async function loadAboutPanel() {
  return (await import('./aboutPanel')).default;
}

function getInstances(): any[] {
  const { BrowserWindow } = require('electron');
  return (BrowserWindow as any).__instances;
}

describe('aboutPanel', () => {
  it('creates a BrowserWindow and loads aura icon HTML', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const instances = getInstances();
    expect(instances).toHaveLength(1);

    // Decode the data URL (it's URL-encoded by encodeURIComponent)
    const rawUrl: string = instances[0].loadURL.mock.calls[0][0];
    const decoded = decodeURIComponent(rawUrl.replace('data:text/html;charset=utf-8,', ''));
    expect(decoded).toContain('GogChat');
    expect(decoded).toContain('Test Author');
    expect(decoded).toContain('Darwin');
    expect(decoded).toContain('arm64');
    expect(decoded).toContain('FAKE_AURA');
  });

  it('sets always on top and hides menu bar', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const instances = getInstances();
    const win = instances[instances.length - 1];
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false);
  });

  it('shows window on ready-to-show event', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const instances = getInstances();
    const win = instances[instances.length - 1];
    const readyCall = win.once.mock.calls.find(
      (c: unknown[]) => c[0] === 'ready-to-show'
    );
    expect(readyCall).toBeDefined();
    readyCall[1]();
    expect(win.show).toHaveBeenCalled();
  });

  it('reuses existing window on second call', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const count = getInstances().length;
    // Second call should reuse
    aboutPanel({ id: 1 } as any);
    expect(getInstances()).toHaveLength(count);
  });

  it('creates new window when previous one is destroyed', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const count = getInstances().length;
    // Simulate destroyed window
    getInstances()[getInstances().length - 1].isDestroyed.mockReturnValue(true);
    aboutPanel({ id: 1 } as any);
    expect(getInstances()).toHaveLength(count + 1);
  });

  it('restores minimized window when reusing', async () => {
    const aboutPanel = await loadAboutPanel();
    aboutPanel({ id: 1 } as any);

    const instances = getInstances();
    const win = instances[instances.length - 1];
    win.isMinimized.mockReturnValue(true);

    aboutPanel({ id: 1 } as any);
    expect(win.restore).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });
});
