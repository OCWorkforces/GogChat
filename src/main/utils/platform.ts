/**
 * Platform detection and utilities
 * Replaces electron-util to reduce bundle size
 */

import { app, shell } from 'electron';
import os from 'os';
import type Store from 'electron-store';
import type { StoreType } from '../../shared/types';

/**
 * Platform detection
 */
export const platform = {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  name: process.platform,
};

/**
 * Enforce macOS app location
 * Ensures the app is running from /Applications on macOS
 */
export function enforceMacOSAppLocation(): void {
  if (!platform.isMac || app.isPackaged === false) {
    return;
  }

  const appPath = app.getAppPath();
  const isInApplications = appPath.startsWith('/Applications/');

  if (!isInApplications) {
    const message = 'This app needs to be in your Applications folder to work correctly.';

    // Show dialog in renderer if available, otherwise log
    void import('electron').then(({ dialog }) => {
      void dialog.showMessageBox({
        type: 'error',
        message,
        detail: 'Please move the app to your Applications folder and reopen it.',
        buttons: ['OK'],
      });
    });

    app.quit();
  }
}

/**
 * Open GitHub issue with pre-filled information
 * @param options - Issue configuration
 */
export function openNewGitHubIssue(options: {
  repoUrl: string;
  body?: string;
  title?: string;
  labels?: string[];
}): void {
  const { repoUrl, body = '', title = '', labels = [] } = options;

  // Construct GitHub issue URL
  const baseUrl = `${repoUrl}/issues/new`;
  const params = new URLSearchParams();

  if (title) params.append('title', title);
  if (body) params.append('body', body);
  if (labels.length > 0) params.append('labels', labels.join(','));

  const issueUrl = `${baseUrl}?${params.toString()}`;

  void shell.openExternal(issueUrl);
}

/**
 * Collect system debug information
 * @returns System information string
 */
export function debugInfo(): string {
  const info: string[] = [];

  // App information
  info.push(`App: ${app.getName()} ${app.getVersion()}`);
  info.push(`Electron: ${process.versions.electron}`);
  info.push(`Chrome: ${process.versions.chrome}`);
  info.push(`Node: ${process.versions.node}`);
  info.push(`V8: ${process.versions.v8}`);

  // System information
  info.push(`Platform: ${os.platform()} ${os.release()}`);
  info.push(`Arch: ${os.arch()}`);
  info.push(`Locale: ${app.getLocale()}`);

  // Memory information
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  info.push(
    `Memory: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)}GB free / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB total`
  );

  return info.join('\n');
}

/**
 * Check if this is the first app launch
 * Uses electron-store to persist first launch state
 * @param store - electron-store instance
 * @returns true if first launch
 */
export function isFirstAppLaunch(store: Store<StoreType>): boolean {
  const key = 'firstLaunchComplete';

  if (store.get(key)) {
    return false;
  }

  store.set(key, true);
  return true;
}

/**
 * Get app path with proper handling for packaged apps
 * @returns App path
 */
export function getAppPath(): string {
  return app.getAppPath();
}

/**
 * Check if app is packaged (production)
 * @returns true if packaged
 */
export function isPackaged(): boolean {
  return app.isPackaged;
}

/**
 * Check if running in development mode
 * @returns true if development
 */
export function isDevelopment(): boolean {
  return !app.isPackaged;
}
