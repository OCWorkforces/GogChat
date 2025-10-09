import log from 'electron-log';
import { isFirstAppLaunch } from '../utils/platform.js';
import store from '../config.js';

export default () => {
  if (isFirstAppLaunch(store)) {
    log.debug('First launch');
  }
};
