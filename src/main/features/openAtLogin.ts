import AutoLaunch from 'auto-launch';
import { app, BrowserWindow } from 'electron';
import store from '../config.js';
import environment from '../../environment.js';
import { registerMenuAction } from '../utils/menuActionRegistry.js';
let autoLaunchInstance: AutoLaunch;

const autoLaunch = (): AutoLaunch => {
  if (autoLaunchInstance) {
    return autoLaunchInstance;
  }

  autoLaunchInstance = new AutoLaunch({
    name: app.getName(),
    isHidden: true,
    mac: {
      useLaunchAgent: true,
    },
  });

  return autoLaunchInstance;
};

export default ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
  if (environment.isDev) return;

  autoLaunchInstance = autoLaunch();

  if (!store.get('app.autoLaunchAtLogin')) {
    void autoLaunchInstance.disable();
    return;
  }

  if (app.commandLine.hasSwitch('hidden') && mainWindow) {
    mainWindow.hide();
  }

  void autoLaunchInstance.isEnabled().then((isEnabled) => {
    if (!isEnabled) {
      void autoLaunchInstance.enable();
    }
  });
};

// Register autoLaunch action in menu registry for appMenu consumption
// This replaces the direct feature→feature import boundary violation
registerMenuAction('autoLaunch', { label: 'Get AutoLaunch instance', handler: () => autoLaunchInstance });

export { autoLaunch };
