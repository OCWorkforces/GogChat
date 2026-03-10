import { app, BrowserWindow } from 'electron';
import os from 'os';
import { getPackageInfo } from '../utils/packageInfo.js';

export default (mainWindow: BrowserWindow) => {
  const packageJson = getPackageInfo();
  const platform = [os.type(), os.release(), os.arch()].join(', ');

  app.setAboutPanelOptions({
    applicationName: 'Google Chat',
    applicationVersion: app.getVersion(),
    copyright: `Developed by ${packageJson.author}`,
    version: platform,
  });

  app.showAboutPanel();

  // Set the About panel to always on top after it's shown
  // Find the About panel by excluding the main window
  setImmediate(() => {
    const allWindows = BrowserWindow.getAllWindows();
    const aboutWindow = allWindows.find(
      (win) => win.id !== mainWindow.id && !win.isDestroyed(),
    );
    if (aboutWindow) {
      aboutWindow.setAlwaysOnTop(true, 'floating');
    }
  });
};
