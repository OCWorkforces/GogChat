import { app } from 'electron';
import log from 'electron-log';
import { getMenuAction } from './menuActionRegistry.js';
import { extractDeepLinkFromArgv } from './deepLinkUtils.js';
import { getMostRecentWindow } from '../utils/accountWindowManager.js';

const enforceSingleInstance = (): boolean => {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.info('Force exit from second instance');
    app.exit();
  }

  return gotTheLock;
};

const restoreFirstInstance = (_context: { accountWindowManager?: unknown }) => {
  app.on('second-instance', (_event, argv) => {
    // Someone tried to run a second instance, we should focus our window.
    // Use getMostRecentWindow() to get the current window dynamically
    const window = getMostRecentWindow();
    if (window) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.show();
      window.focus();
    }

    // Check if second instance was launched with a deep link
    const deepLinkUrl = extractDeepLinkFromArgv(argv);
    if (deepLinkUrl) {
      log.info('[SingleInstance] Received deep link from second instance');
      const action = getMenuAction('processDeepLink');
      if (action) {
        action.handler(deepLinkUrl);
      } else {
        log.warn('[SingleInstance] processDeepLink action not registered — deep link dropped');
      }
    }
  });
};

export { restoreFirstInstance, enforceSingleInstance };
