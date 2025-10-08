import {app, dialog, clipboard, BrowserWindow} from 'electron';
import os from 'os';
import {getIconCache} from '../utils/iconCache';
import {getPackageInfo} from '../utils/packageInfo';

// The default Electron AboutWindow does not load app icon from asar
// So let's create a custom dialog instead
export default async (window: BrowserWindow) => {
  const packageJson = getPackageInfo();
  const detail = getDetails();

  detail.unshift(`Developed by - ${packageJson.author}\n`)
  detail.push(`\nLicensed under - ${packageJson.license}`)

  const { response } = await dialog.showMessageBox(window, {
    type: 'info',
    title: 'About',
    message: 'GChat',
    detail: packageJson.description + "\n\n" + detail.join('\n'),
    buttons: ['Copy', 'Ok'],
    cancelId: 1,
    defaultId: 1,
    icon: getIconCache().getIcon('resources/icons/normal/64.png')
  });
  if (response === 0) {
    clipboard.writeText(getDetails().join('\n'));
  }
}

const getDetails = () => {
  return [
    'App Version: ' + app.getVersion(),
    'Electron version: ' + process.versions.electron,
    'Chrome version: ' + process.versions.chrome,
    'Platform: ' + [os.type(), os.release(), os.arch()].join(', '),
    'OS: ' + os.version(),
    'Locale: ' + app.getLocale()
  ]
}
