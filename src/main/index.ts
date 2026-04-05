import { app, BrowserWindow } from 'electron';
import { perfMonitor } from './utils/performanceMonitor.js';

import { enforceSingleInstance } from './features/singleInstance.js';
import { setupDeepLinkListener } from './features/deepLinkHandler.js';
import { registerCleanupTask } from './utils/trackedResources.js';

import { getFeatureManager } from './utils/featureManager.js';
import { getMostRecentWindow } from './utils/accountWindowManager.js';
import windowWrapper from './windowWrapper.js';

import { registerAllFeatures } from './initializers/registerFeatures.js';
import { registerShutdownHandler } from './initializers/registerShutdown.js';
import { registerAppReady } from './initializers/registerAppReady.js';

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;

// Initialize performance monitoring
perfMonitor.mark('app-start', 'App initialization started');

// ===== Feature Registration =====
const featureManager = getFeatureManager();

// Delegate feature registration to initializer module
registerAllFeatures(featureManager, {
  setTrayIcon: () => {},
  registerCleanupTask,
});

if (enforceSingleInstance()) {
  // Register deep link listener BEFORE app.ready (macOS fires open-url early)
  setupDeepLinkListener();

  // Delegate app.whenReady() logic to initializer module
  registerAppReady({
    featureManager,
    windowFactory: { createWindow: windowWrapper },
    setMainWindow: (win) => {
      mainWindow = win;
    },
    getMainWindow: () => mainWindow,
  });
}

// ===== Shutdown Handler =====
// Delegate shutdown handling to initializer module
registerShutdownHandler({ featureManager });

app.setAppUserModelId('com.electron.google-chat');

app.on('window-all-closed', () => {
  app.exit();
});

app.on('activate', () => {
  // Always get fresh window reference — mainWindow may be stale after account switches
  const windowToShow = getMostRecentWindow() ?? mainWindow;
  if (windowToShow && !windowToShow.isDestroyed()) {
    if (windowToShow.isMinimized()) {
      windowToShow.restore();
    }
    windowToShow.show();
    windowToShow.focus();
  }
});
