/**
 * Cache Warmer
 *
 * Idle-time cache warming utilities. Schedules and executes warming of
 * commonly accessed data (icons, etc.) during and after critical app init.
 *
 * Also encapsulates the deferred-phase orchestration (deferred features,
 * perf summary, optional dev profiling/export, and idle warming scheduling)
 * so the app-ready orchestrator stays lean.
 */

import { app, type BrowserWindow } from 'electron';
import log from 'electron-log';
import path from 'path';
import { perfMonitor } from './performanceMonitor.js';
import { getIconCache } from './iconCache.js';
import { createTrackedTimeout } from './resourceCleanup.js';
import { compareStorePerformance } from './configProfiler.js';
import type { FeatureManager } from './featureManager.js';

/** Delay (ms) before idle cache warming fires after deferred features load. */
const IDLE_WARM_DELAY_MS = 8000;

/**
 * Additional icons preloaded during idle to reduce later UI latency.
 *
 * DISJOINTNESS INVARIANT: Must be the disjoint complement of INITIAL_ICON_PATHS
 * in iconCache.ts. Together they form the complete preload set — no overlap,
 * no gaps. Adding a path here requires removing it from INITIAL_ICON_PATHS.
 */
const ADDITIONAL_ICON_PATHS = [
  'resources/icons/normal/32.png',
  'resources/icons/normal/64.png',
  'resources/icons/normal/256.png',
  'resources/icons/offline/16.png',
  'resources/icons/offline/32.png',
  'resources/icons/badge/16.png',
  'resources/icons/badge/32.png',
  // Unread tray icon variants — swapped at runtime when messages arrive
  'resources/icons/tray/iconUnreadTemplate.png',
  'resources/icons/tray/iconUnreadTemplate@2x.png',
] as const;

/**
 * Warm the initial icon cache (called during the blocking critical path,
 * before the UI phase). Sets the 'icons-cached' perf mark.
 */
export function warmInitialIcons(): void {
  getIconCache().warmCache();
  perfMonitor.mark('icons-cached', 'Icons pre-loaded');
}

/**
 * Options for runDeferredPhase.
 */
export interface DeferredPhaseOptions {
  featureManager: FeatureManager;
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
}

/**
 * Run the deferred-phase initialization body.
 *
 * - Verifies main window availability
 * - Triggers deferred feature initialization
 * - Logs perf summary
 * - In dev mode: runs optional config profiling and exports perf metrics
 * - Schedules idle cache warming via tracked timeout
 */
export async function runDeferredPhase(options: DeferredPhaseOptions): Promise<void> {
  const { featureManager, getMainWindow, isDev } = options;

  const currentMainWindow = getMainWindow();
  if (!currentMainWindow) {
    log.error('[Main] Main window not available for deferred features');
    return;
  }

  log.debug('[Main] Loading non-critical features with dynamic imports');
  perfMonitor.mark('deferred-features-start', 'Starting deferred feature loading');

  // Initialize deferred features (parallel with dynamic imports)
  await featureManager.initializePhase('deferred');

  perfMonitor.mark('all-features-loaded', 'All features initialized', true);
  log.info('[Main] All features initialized');

  // Log performance summary
  perfMonitor.logSummary();

  // Dev-only post-deferred side effects
  runDevPostDeferred(isDev);

  // ⚡ OPTIMIZATION: Warm caches on idle (after all features loaded)
  scheduleIdleCacheWarming();
}

/**
 * Run dev-only post-deferred side effects: optional config profiling and
 * performance metrics export. No-op when isDev is false.
 */
export function runDevPostDeferred(isDev: boolean): void {
  if (!isDev) return;

  if (process.env['ENABLE_CONFIG_PROFILING'] === 'true') {
    log.info('[Main] Running config store performance analysis...');
    compareStorePerformance();
  }

  // Export performance metrics to JSON
  perfMonitor.exportToJSON(path.join(app.getPath('userData'), 'performance-metrics.json'));
}

/**
 * Schedule idle cache warming via a tracked timeout.
 *
 * ⚡ OPTIMIZATION: Preloads commonly accessed data after all features loaded.
 */
export function scheduleIdleCacheWarming(): void {
  createTrackedTimeout(
    () => {
      warmCachesOnIdle();
    },
    IDLE_WARM_DELAY_MS,
    'idle-cache-warming'
  );
}

/**
 * Warm various caches during idle time.
 * ⚡ OPTIMIZATION: Preloads commonly accessed data to improve responsiveness.
 */
export function warmCachesOnIdle(): void {
  try {
    log.debug('[Main] Starting idle cache warming...');

    const iconCache = getIconCache();

    let warmed = 0;
    ADDITIONAL_ICON_PATHS.forEach((iconPath) => {
      const icon = iconCache.getIcon(iconPath);
      if (!icon.isEmpty()) {
        warmed++;
      }
    });

    log.info(
      `[Main] Cache warming complete - ${warmed}/${ADDITIONAL_ICON_PATHS.length} additional icons loaded`
    );

    // Log final cache statistics
    const stats = iconCache.getStats();
    log.debug(
      `[Main] Icon cache stats - Size: ${stats.size}/${stats.maxSize}, Total accesses: ${stats.totalAccesses}, Most accessed: ${stats.mostAccessed}`
    );
  } catch (error: unknown) {
    log.error('[Main] Failed to warm caches:', error);
  }
}
