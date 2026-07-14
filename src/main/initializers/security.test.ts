import { app } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { FeatureSpec } from '../utils/lifecycle/featureConfigTypes.js';
import { SECURITY_FEATURES } from './security.spec.js';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { app: new EventEmitter() };
});

vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../utils/lifecycle/performanceMonitor.js', () => ({
  perfMonitor: { mark: vi.fn() },
}));

vi.mock('../utils/security/secureFlags.js', () => ({
  getDisableCertPinning: vi.fn().mockReturnValue(false),
}));

vi.mock('../features/reportExceptions.js', () => ({ default: vi.fn() }));
vi.mock('../features/mediaPermissions.js', () => ({ default: vi.fn() }));

describe('security feature initialization', () => {
  it('registers zero certificate-error listeners', async () => {
    // Given the complete declarative security initializer set
    const securityFeatures: readonly FeatureSpec[] = SECURITY_FEATURES;

    // When every security feature is initialized as one dependency batch
    await Promise.all(securityFeatures.map(async (feature) => feature.init({})));

    // Then Chromium remains the only certificate trust authority
    expect(app.listenerCount('certificate-error')).toBe(0);
  });
});
