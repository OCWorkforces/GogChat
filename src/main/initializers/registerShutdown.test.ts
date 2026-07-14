import { beforeEach, describe, expect, it, vi } from 'vitest';

type BeforeQuitEvent = { preventDefault: () => void };
type BeforeQuitListener = (event: BeforeQuitEvent) => void;
type WindowAllClosedListener = () => void;

const mocks = vi.hoisted(() => {
  const beforeQuitListeners: BeforeQuitListener[] = [];
  const windowAllClosedListeners: WindowAllClosedListener[] = [];

  return {
    app: {
      on: vi.fn((event: string, listener: BeforeQuitListener | WindowAllClosedListener): void => {
        if (event === 'before-quit') beforeQuitListeners.push(listener as BeforeQuitListener);
        if (event === 'window-all-closed') {
          windowAllClosedListeners.push(listener as WindowAllClosedListener);
        }
      }),
      exit: vi.fn(),
      quit: vi.fn(),
    },
    beforeQuitListeners,
    windowAllClosedListeners,
    cleanupAll: vi.fn().mockResolvedValue(undefined),
    cleanupResources: vi.fn().mockResolvedValue(undefined),
    getSharedFeatureContext: vi.fn().mockReturnValue({}),
    destroyAccountWindowManager: vi.fn(),
    destroyAllSingletons: vi.fn(),
    logShutdownDiagnostics: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../utils/lifecycle/featureRunner.js', () => ({ cleanupAll: mocks.cleanupAll }));
vi.mock('../utils/lifecycle/featureContextStore.js', () => ({
  getSharedFeatureContext: mocks.getSharedFeatureContext,
}));
vi.mock('../utils/lifecycle/resourceCleanup.js', () => ({
  getCleanupManager: () => ({ cleanup: mocks.cleanupResources }),
}));
vi.mock('../utils/account/accountWindowManager.js', () => ({
  destroyAccountWindowManager: mocks.destroyAccountWindowManager,
}));
vi.mock('./singletonDestroyers.js', () => ({ destroyAllSingletons: mocks.destroyAllSingletons }));
vi.mock('./shutdownDiagnostics.js', () => ({
  logShutdownDiagnostics: mocks.logShutdownDiagnostics,
}));

import { registerShutdownHandler } from './registerShutdown.js';

function getBeforeQuitListener(): BeforeQuitListener {
  const listener = mocks.beforeQuitListeners[0];
  if (!listener) throw new Error('before-quit listener was not registered');
  return listener;
}

function getWindowAllClosedListener(): WindowAllClosedListener {
  const listener = mocks.windowAllClosedListeners[0];
  if (!listener) throw new Error('window-all-closed listener was not registered');
  return listener;
}

async function waitForShutdown(): Promise<void> {
  await vi.waitFor(() => expect(mocks.app.exit).toHaveBeenCalledTimes(1));
}

function recordShutdownOrder(order: string[]): void {
  mocks.cleanupAll.mockImplementation(async () => {
    order.push('features');
  });
  mocks.cleanupResources.mockImplementation(async () => {
    order.push('global');
  });
  mocks.destroyAccountWindowManager.mockImplementation(() => {
    order.push('accounts');
  });
  mocks.logShutdownDiagnostics.mockImplementation(async () => {
    order.push('diagnostics');
  });
  mocks.destroyAllSingletons.mockImplementation(() => {
    order.push('singletons');
  });
  mocks.app.exit.mockImplementation(() => {
    order.push('exit');
  });
}

describe('registerShutdownHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.beforeQuitListeners.length = 0;
    mocks.windowAllClosedListeners.length = 0;
    mocks.cleanupAll.mockResolvedValue(undefined);
    mocks.cleanupResources.mockResolvedValue(undefined);
    mocks.logShutdownDiagnostics.mockResolvedValue(undefined);
    mocks.app.exit.mockImplementation(() => undefined);
    mocks.app.quit.mockImplementation(() => undefined);
  });

  it('runs global cleanup in the ordered shutdown sequence', async () => {
    const order: string[] = [];
    recordShutdownOrder(order);

    registerShutdownHandler();
    const event = { preventDefault: vi.fn() };
    getBeforeQuitListener()(event);

    await waitForShutdown();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.cleanupResources).toHaveBeenCalledWith({
      includeGlobalResources: true,
      logDetails: true,
    });
    expect(order).toEqual(['features', 'global', 'accounts', 'diagnostics', 'singletons', 'exit']);
  });

  it('continues through every remaining stage when feature cleanup rejects', async () => {
    const order: string[] = [];
    recordShutdownOrder(order);
    mocks.cleanupAll.mockImplementation(async () => {
      order.push('features');
      throw new Error('feature cleanup failed');
    });

    registerShutdownHandler();
    getBeforeQuitListener()({ preventDefault: vi.fn() });

    await waitForShutdown();

    expect(order).toEqual(['features', 'global', 'accounts', 'diagnostics', 'singletons', 'exit']);
    expect(mocks.app.exit).toHaveBeenCalledOnce();
  });

  it('continues through every remaining stage when global cleanup rejects', async () => {
    const order: string[] = [];
    recordShutdownOrder(order);
    mocks.cleanupResources.mockImplementation(async () => {
      order.push('global');
      throw new Error('global cleanup failed');
    });

    registerShutdownHandler();
    getBeforeQuitListener()({ preventDefault: vi.fn() });

    await waitForShutdown();

    expect(order).toEqual(['features', 'global', 'accounts', 'diagnostics', 'singletons', 'exit']);
    expect(mocks.app.exit).toHaveBeenCalledOnce();
  });

  it('runs cleanup and exits only once when before-quit repeats', async () => {
    registerShutdownHandler();
    const event = { preventDefault: vi.fn() };
    const listener = getBeforeQuitListener();

    listener(event);
    listener(event);

    await waitForShutdown();

    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(mocks.cleanupAll).toHaveBeenCalledOnce();
    expect(mocks.cleanupResources).toHaveBeenCalledOnce();
    expect(mocks.destroyAccountWindowManager).toHaveBeenCalledOnce();
    expect(mocks.logShutdownDiagnostics).toHaveBeenCalledOnce();
    expect(mocks.destroyAllSingletons).toHaveBeenCalledOnce();
    expect(mocks.app.exit).toHaveBeenCalledOnce();
  });

  it('routes window-all-closed through orderly shutdown', async () => {
    const order: string[] = [];
    recordShutdownOrder(order);
    mocks.app.quit.mockImplementation(() => {
      getBeforeQuitListener()({ preventDefault: vi.fn() });
    });

    registerShutdownHandler();
    getWindowAllClosedListener()();

    await waitForShutdown();

    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(order).toEqual(['features', 'global', 'accounts', 'diagnostics', 'singletons', 'exit']);
    expect(mocks.app.exit).toHaveBeenCalledOnce();
  });
});
