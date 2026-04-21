/**
 * Unit tests for registerShutdown.ts — graceful app shutdown handler
 *
 * Covers:
 * - registerShutdownHandler(): before-quit registration, async cleanup sequence
 * - Error handling: individual cleanup failures don't prevent app.exit()
 * - Diagnostics + singleton destruction are delegated (mocked here)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──── Hoisted mocks (available inside vi.mock factories) ───────────────────
const {
  mockAppOn,
  mockAppExit,
  mockLog,
  mockDestroyAccountWindowManager,
  mockDestroyAllSingletons,
  mockLogShutdownDiagnostics,
} = vi.hoisted(() => ({
  mockAppOn: vi.fn(),
  mockAppExit: vi.fn(),
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockDestroyAccountWindowManager: vi.fn(),
  mockDestroyAllSingletons: vi.fn(),
  mockLogShutdownDiagnostics: vi.fn(),
}));

// ──── Module mocks ─────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    on: mockAppOn,
    exit: mockAppExit,
  },
}));

vi.mock('electron-log', () => ({
  default: mockLog,
}));

vi.mock('../utils/accountWindowManager.js', () => ({
  destroyAccountWindowManager: mockDestroyAccountWindowManager,
}));

vi.mock('./singletonDestroyers.js', () => ({
  destroyAllSingletons: mockDestroyAllSingletons,
}));

vi.mock('./shutdownDiagnostics.js', () => ({
  logShutdownDiagnostics: mockLogShutdownDiagnostics,
}));

// ──── Import under test ────────────────────────────────────────────────────
import { registerShutdownHandler } from './registerShutdown';
import type { FeatureManager } from '../utils/featureManager.js';

// ──── Helpers ──────────────────────────────────────────────────────────────

function createMockFeatureManager(
  overrides: Partial<{ cleanup: () => Promise<void> }> = {}
): FeatureManager {
  return {
    cleanup: overrides.cleanup ?? vi.fn().mockResolvedValue(undefined),
    getSummary: vi.fn().mockReturnValue({
      total: 10,
      initialized: 8,
      failed: 1,
      pending: 1,
      totalTime: 500,
    }),
  } as unknown as FeatureManager;
}

async function fireBeforeQuit(): Promise<void> {
  expect(mockAppOn).toHaveBeenCalledWith('before-quit', expect.any(Function));
  const handler = mockAppOn.mock.calls.find(
    (call: unknown[]) => call[0] === 'before-quit'
  )![1] as (event: { preventDefault: () => void }) => void;

  const event = { preventDefault: vi.fn() };
  handler(event);

  await vi.waitFor(() => {
    expect(mockAppExit).toHaveBeenCalled();
  });
}

// ──── Tests ────────────────────────────────────────────────────────────────

describe('registerShutdownHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should register a before-quit handler on app', () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    expect(mockAppOn).toHaveBeenCalledTimes(1);
    expect(mockAppOn).toHaveBeenCalledWith('before-quit', expect.any(Function));
  });

  it('should call event.preventDefault() when before-quit fires', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    const handler = mockAppOn.mock.calls[0]![1] as (event: { preventDefault: () => void }) => void;
    const event = { preventDefault: vi.fn() };
    handler(event);

    await vi.waitFor(() => {
      expect(mockAppExit).toHaveBeenCalled();
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('should call featureManager.cleanup()', async () => {
    const cleanupSpy = vi.fn().mockResolvedValue(undefined);
    const fm = createMockFeatureManager({ cleanup: cleanupSpy });
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('should call destroyAccountWindowManager after feature cleanup', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockDestroyAccountWindowManager).toHaveBeenCalledTimes(1);
  });

  it('should call destroyAllSingletons', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockDestroyAllSingletons).toHaveBeenCalledTimes(1);
  });

  it('should call logShutdownDiagnostics with the featureManager', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLogShutdownDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockLogShutdownDiagnostics).toHaveBeenCalledWith(fm);
  });

  it('should call app.exit() in finally block', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockAppExit).toHaveBeenCalledTimes(1);
    expect(mockAppExit).toHaveBeenCalledWith();
  });

  // ─── Error handling ───────────────────────────────────────────────────

  it('should still call app.exit() when featureManager.cleanup() throws', async () => {
    const cleanupSpy = vi.fn().mockRejectedValue(new Error('cleanup boom'));
    const fm = createMockFeatureManager({ cleanup: cleanupSpy });
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Error during shutdown cleanup:',
      expect.any(Error)
    );
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  it('should continue cleanup when destroyAccountWindowManager throws', async () => {
    mockDestroyAccountWindowManager.mockImplementation(() => {
      throw new Error('account window boom');
    });
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Account window manager cleanup failed:',
      expect.any(Error)
    );
    // Singletons should still be destroyed after account window manager fails
    expect(mockDestroyAllSingletons).toHaveBeenCalledTimes(1);
    expect(mockLogShutdownDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  it('should log error and still call app.exit() when destroyAllSingletons throws', async () => {
    mockDestroyAllSingletons.mockImplementation(() => {
      throw new Error('singleton boom');
    });
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Singleton destruction failed:',
      expect.any(Error)
    );
    // Diagnostics should still run after singleton destruction fails
    expect(mockLogShutdownDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  // ─── Shutdown logging ──────────────────────────────────────────────────

  it('should log shutdown banner start and end', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] ========== Application Shutdown ==========');
    expect(mockLog.info).toHaveBeenCalledWith(
      '[Main] ====================================================='
    );
  });

  it('should log feature cleanup start and completion', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Cleaning up feature resources...');
    expect(mockLog.info).toHaveBeenCalledWith('[Main] Feature cleanup completed');
  });

  it('should log account window manager cleanup success', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Account window manager cleaned up');
  });

  it('should log singleton instances destroyed', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Singleton instances destroyed');
  });
});
