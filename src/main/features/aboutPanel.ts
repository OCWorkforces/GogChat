import { app, BrowserWindow } from 'electron';
import os from 'os';
import { getPackageInfo } from '../utils/packageInfo';

export default async (window: BrowserWindow) => {
  const packageJson = getPackageInfo();
  const platform = [os.type(), os.release(), os.arch()].join(', ');

  app.setAboutPanelOptions({
    applicationName: 'GChat',
    applicationVersion: app.getVersion(),
    copyright: `Developed by ${packageJson.author}`,
    version: platform,
  });

  app.showAboutPanel();
};
