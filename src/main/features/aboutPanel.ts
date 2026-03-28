import { app, BrowserWindow } from 'electron';
import os from 'os';
import { getPackageInfo } from '../utils/packageInfo.js';
import { registerMenuAction } from '../utils/menuActionRegistry.js';
let aboutWindow: BrowserWindow | null = null;

const focusAboutWindow = (window: BrowserWindow): void => {
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
};

export default function showAboutPanel(mainWindow: BrowserWindow): void {
  // If About window already exists, focus it instead of creating a new one
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    focusAboutWindow(aboutWindow);
    return;
  }

  const packageJson = getPackageInfo();
  const platform = [os.type(), os.release(), os.arch()].join(', ');

  app.setAboutPanelOptions({
    applicationName: packageJson.productName,
    applicationVersion: packageJson.version,
    copyright: `Developed by ${packageJson.author}`,
    version: platform,
  });

  app.showAboutPanel();

  // Find the newly created About panel and track it
  setImmediate(() => {
    const allWindows = BrowserWindow.getAllWindows();
    aboutWindow = allWindows.find((win) => win.id !== mainWindow.id && !win.isDestroyed()) ?? null;

    if (aboutWindow) {
      aboutWindow.setAlwaysOnTop(true, 'floating');

      // Clear reference when window is closed
      aboutWindow.once('closed', () => {
        aboutWindow = null;
      });
    }
  });
}

// Register about panel action in menu registry for appMenu consumption
// This replaces the direct feature→feature import boundary violation
registerMenuAction('aboutPanel', { label: 'Show About Panel', handler: showAboutPanel });
