import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { extractDeepLinkFromArgv, processDeepLink } from './deepLinkHandler.js';

const enforceSingleInstance = (): boolean => {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.info('Force exit from second instance');
    app.exit();
  }

  return gotTheLock;
};

const restoreFirstInstance = (window: BrowserWindow) => {
  app.on('second-instance', (_event, argv) => {
    // Someone tried to run a second instance, we should focus our window.
    if (window) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.show();
    }

    // Check if second instance was launched with a deep link
    const deepLinkUrl = extractDeepLinkFromArgv(argv);
    if (deepLinkUrl) {
      log.info('[SingleInstance] Received deep link from second instance');
      processDeepLink(deepLinkUrl);
    }
  });
};

export { restoreFirstInstance, enforceSingleInstance };
