/**
 * Unit tests for registerDeferredFeatures — orchestrator that delegates to sub-registrars
 *
 * Covers: registerDeferredFeatures() calls all 3 sub-registrars with correct arguments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ──────────────────────

const { mockRegisterSystem, mockRegisterWindow, mockRegisterNetwork } = vi.hoisted(() => ({
  mockRegisterSystem: vi.fn(),
  mockRegisterWindow: vi.fn(),
  mockRegisterNetwork: vi.fn(),
}));

vi.mock('./registerDeferredSystemFeatures.js', () => ({
  registerDeferredSystemFeatures: mockRegisterSystem,
}));

vi.mock('./registerDeferredWindowFeatures.js', () => ({
  registerDeferredWindowFeatures: mockRegisterWindow,
}));

vi.mock('./registerDeferredNetworkFeatures.js', () => ({
  registerDeferredNetworkFeatures: mockRegisterNetwork,
}));

import { registerDeferredFeatures } from './registerDeferredFeatures';
import type { FeatureManager } from '../utils/featureManager.js';

describe('registerDeferredFeatures', () => {
  const mockFeatureManager = {
    registerAll: vi.fn(),
    register: vi.fn(),
    updateContext: vi.fn(),
  } as unknown as FeatureManager;

  const mockCallbacks = {
    setTrayIcon: vi.fn(),
    registerCleanupTask: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call registerDeferredSystemFeatures with featureManager and callbacks', () => {
    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSystem).toHaveBeenCalledTimes(1);
    expect(mockRegisterSystem).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call registerDeferredWindowFeatures with featureManager and callbacks', () => {
    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterWindow).toHaveBeenCalledTimes(1);
    expect(mockRegisterWindow).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call registerDeferredNetworkFeatures with featureManager and callbacks', () => {
    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterNetwork).toHaveBeenCalledTimes(1);
    expect(mockRegisterNetwork).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call all three sub-registrars in order', () => {
    const callOrder: string[] = [];
    mockRegisterSystem.mockImplementation(() => callOrder.push('system'));
    mockRegisterWindow.mockImplementation(() => callOrder.push('window'));
    mockRegisterNetwork.mockImplementation(() => callOrder.push('network'));

    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(callOrder).toEqual(['system', 'window', 'network']);
  });

  it('should propagate the exact same featureManager reference to all sub-registrars', () => {
    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSystem.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterWindow.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterNetwork.mock.calls[0]![0]).toBe(mockFeatureManager);
  });

  it('should propagate the exact same callbacks reference to all sub-registrars', () => {
    registerDeferredFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSystem.mock.calls[0]![1]).toBe(mockCallbacks);
    expect(mockRegisterWindow.mock.calls[0]![1]).toBe(mockCallbacks);
    expect(mockRegisterNetwork.mock.calls[0]![1]).toBe(mockCallbacks);
  });
});
