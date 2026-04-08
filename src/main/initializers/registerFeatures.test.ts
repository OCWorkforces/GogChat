/**
 * Unit tests for registerFeatures — top-level feature registration orchestrator
 *
 * Covers: registerAllFeatures() delegates to registerSecurityFeatures,
 * registerUIFeatures, and the 3 deferred sub-registrars in order, and logs completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ──────────────────────

const {
  mockLogInfo,
  mockRegisterSecurity,
  mockRegisterUI,
  mockRegisterDeferredSystem,
  mockRegisterDeferredWindow,
  mockRegisterDeferredNetwork,
} = vi.hoisted(() => ({
  mockLogInfo: vi.fn(),
  mockRegisterSecurity: vi.fn(),
  mockRegisterUI: vi.fn(),
  mockRegisterDeferredSystem: vi.fn(),
  mockRegisterDeferredWindow: vi.fn(),
  mockRegisterDeferredNetwork: vi.fn(),
}));

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

vi.mock('./registerDeferredSystemFeatures.js', () => ({
  registerDeferredSystemFeatures: mockRegisterDeferredSystem,
}));

vi.mock('./registerDeferredWindowFeatures.js', () => ({
  registerDeferredWindowFeatures: mockRegisterDeferredWindow,
}));

vi.mock('./registerDeferredNetworkFeatures.js', () => ({
  registerDeferredNetworkFeatures: mockRegisterDeferredNetwork,
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

  it('should call registerDeferredSystemFeatures with featureManager and callbacks', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterDeferredSystem).toHaveBeenCalledTimes(1);
    expect(mockRegisterDeferredSystem).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call registerDeferredWindowFeatures with featureManager and callbacks', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterDeferredWindow).toHaveBeenCalledTimes(1);
    expect(mockRegisterDeferredWindow).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call registerDeferredNetworkFeatures with featureManager and callbacks', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterDeferredNetwork).toHaveBeenCalledTimes(1);
    expect(mockRegisterDeferredNetwork).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
  });

  it('should call sub-registrars in order: security → ui → deferredSystem → deferredWindow → deferredNetwork', () => {
    const callOrder: string[] = [];
    mockRegisterSecurity.mockImplementation(() => callOrder.push('security'));
    mockRegisterUI.mockImplementation(() => callOrder.push('ui'));
    mockRegisterDeferredSystem.mockImplementation(() => callOrder.push('deferredSystem'));
    mockRegisterDeferredWindow.mockImplementation(() => callOrder.push('deferredWindow'));
    mockRegisterDeferredNetwork.mockImplementation(() => callOrder.push('deferredNetwork'));

    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(callOrder).toEqual([
      'security',
      'ui',
      'deferredSystem',
      'deferredWindow',
      'deferredNetwork',
    ]);
  });

  it('should log completion message after all registrations', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockLogInfo).toHaveBeenCalledWith('[Features] All features registered');
  });

  it('should log completion AFTER all sub-registrars are called', () => {
    const callOrder: string[] = [];
    mockRegisterSecurity.mockImplementation(() => callOrder.push('security'));
    mockRegisterUI.mockImplementation(() => callOrder.push('ui'));
    mockRegisterDeferredSystem.mockImplementation(() => callOrder.push('deferredSystem'));
    mockRegisterDeferredWindow.mockImplementation(() => callOrder.push('deferredWindow'));
    mockRegisterDeferredNetwork.mockImplementation(() => callOrder.push('deferredNetwork'));
    mockLogInfo.mockImplementation((msg: string) => {
      if (msg === '[Features] All features registered') {
        callOrder.push('log');
      }
    });

    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(callOrder).toEqual([
      'security',
      'ui',
      'deferredSystem',
      'deferredWindow',
      'deferredNetwork',
      'log',
    ]);
  });

  it('should pass the same featureManager reference to all sub-registrars', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterSecurity.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterUI.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterDeferredSystem.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterDeferredWindow.mock.calls[0]![0]).toBe(mockFeatureManager);
    expect(mockRegisterDeferredNetwork.mock.calls[0]![0]).toBe(mockFeatureManager);
  });

  it('should only pass callbacks to deferred sub-registrars (not security/ui)', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    // Security gets only featureManager
    expect(mockRegisterSecurity).toHaveBeenCalledWith(mockFeatureManager);
    expect(mockRegisterSecurity.mock.calls[0]).toHaveLength(1);

    // UI gets only featureManager
    expect(mockRegisterUI).toHaveBeenCalledWith(mockFeatureManager);
    expect(mockRegisterUI.mock.calls[0]).toHaveLength(1);

    // Deferred sub-registrars get both
    expect(mockRegisterDeferredSystem).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
    expect(mockRegisterDeferredSystem.mock.calls[0]).toHaveLength(2);

    expect(mockRegisterDeferredWindow).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
    expect(mockRegisterDeferredWindow.mock.calls[0]).toHaveLength(2);

    expect(mockRegisterDeferredNetwork).toHaveBeenCalledWith(mockFeatureManager, mockCallbacks);
    expect(mockRegisterDeferredNetwork.mock.calls[0]).toHaveLength(2);
  });

  it('should propagate the exact same callbacks reference to all deferred sub-registrars', () => {
    registerAllFeatures(mockFeatureManager, mockCallbacks);

    expect(mockRegisterDeferredSystem.mock.calls[0]![1]).toBe(mockCallbacks);
    expect(mockRegisterDeferredWindow.mock.calls[0]![1]).toBe(mockCallbacks);
    expect(mockRegisterDeferredNetwork.mock.calls[0]![1]).toBe(mockCallbacks);
  });
});
