/**
 * Unit tests for registerFeatures — top-level feature registration orchestrator
 *
 * Covers: registerAllFeatures() delegates to registerSecurityFeatures,
 * registerUIFeatures, registerDeferredFeatures in order, and logs completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ──────────────────────

const { mockLogInfo, mockRegisterSecurity, mockRegisterUI, mockRegisterDeferred } = vi.hoisted(
  () => ({
    mockLogInfo: vi.fn(),
    mockRegisterSecurity: vi.fn(),
    mockRegisterUI: vi.fn(),
    mockRegisterDeferred: vi.fn(),
  })
);

vi.mock('electron-log', () => ({
  default: {
    info: mockLogInfo,
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./registerSecurityFeatures.js', () => ({
  registerSecurityFeatures: mockRegisterSecurity,
}));

vi.mock('./registerUIFeatures.js', () => ({
  registerUIFeatures: mockRegisterUI,
}));

vi.mock('./registerDeferredFeatures.js', () => ({
  registerDeferredFeatures: mockRegisterDeferred,
}));

import { registerAllFeatures } from './registerFeatures';
import type { FeatureManager } from '../utils/featureManager.js';

describe('registerFeatures', () => {
  const mockFeatureManager = {
    registerAll: vi.fn(),
    register: vi.fn(),
  } as unknown as FeatureManager;

  const mockCallbacks = {
    setTrayIcon: vi.fn(),
    registerCleanupTask: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call registerSecurityFeatures with featureManager', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSecurity).toHaveBeenCalledTimes(1);
    expect(mockRegisterSecurity).toHaveBeenCalledWith(mockFeatureManager);
  });

  it('should call registerUIFeatures with featureManager', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterUI).toHaveBeenCalledTimes(1);
    expect(mockRegisterUI).toHaveBeenCalledWith(mockFeatureManager);
  });

  it('should call registerDeferredFeatures with featureManager and callbacks', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterDeferred).toHaveBeenCalledTimes(1);
    expect(mockRegisterDeferred).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call sub-registrars in order: security → ui → deferred', () => {
    const callOrder: string[] = [];
    mockRegisterSecurity.mockImplementation(() => callOrder.push('security'));
    mockRegisterUI.mockImplementation(() => callOrder.push('ui'));
    mockRegisterDeferred.mockImplementation(() => callOrder.push('deferred'));

    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(callOrder).toEqual(['security', 'ui', 'deferred']);
  });

  it('should log completion message after all registrations', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockLogInfo).toHaveBeenCalledWith('[Features] All features registered');
  });

  it('should log completion AFTER all sub-registrars are called', () => {
    const callOrder: string[] = [];
    mockRegisterSecurity.mockImplementation(() => callOrder.push('security'));
    mockRegisterUI.mockImplementation(() => callOrder.push('ui'));
    mockRegisterDeferred.mockImplementation(() => callOrder.push('deferred'));
    mockLogInfo.mockImplementation((msg: string) => {
      if (msg === '[Features] All features registered') {
        callOrder.push('log');
      }
    });

    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(callOrder).toEqual(['security', 'ui', 'deferred', 'log']);
  });

  it('should pass the same featureManager reference to all sub-registrars', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSecurity.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterUI.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterDeferred.mock.calls[0]![0]).toBe(mockFeatureManager);
  });

  it('should only pass callbacks to registerDeferredFeatures (not security/ui)', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    // Security gets only featureManager
    expect(mockRegisterSecurity).toHaveBeenCalledWith(mockFeatureManager);
    expect(mockRegisterSecurity.mock.calls[0]).toHaveLength(1);

    // UI gets only featureManager
    expect(mockRegisterUI).toHaveBeenCalledWith(mockFeatureManager);
    expect(mockRegisterUI.mock.calls[0]).toHaveLength(1);

    // Deferred gets both
    expect(mockRegisterDeferred).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
    expect(mockRegisterDeferred.mock.calls[0]).toHaveLength(2);
  });
});
