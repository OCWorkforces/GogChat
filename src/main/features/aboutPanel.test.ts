/**
 * Unit tests for aboutPanel feature with custom BrowserWindow dialog.
 *
 * Uses dynamic import + globalThis to expose mock state across
 * both Bun and Node.js Vitest runners.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => {
  const instances: any[] = [];
  (globalThis as any).__aboutPanelMock = { instances };

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
    instances.push(this);
  };
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
  return (globalThis as any).__aboutPanelMock?.instances ?? [];
}

describe('aboutPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reload cached modules so aboutWindow starts fresh each test
    vi.resetModules();
    // Clear mock instances in-place (preserves closure link from mock factory)
    const state = (globalThis as any).__aboutPanelMock;
    if (state?.instances) state.instances.length = 0;
  });

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
    const readyCall = win.once.mock.calls.find((c: unknown[]) => c[0] === 'ready-to-show');
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
