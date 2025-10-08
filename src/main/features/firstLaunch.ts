import log from "electron-log";
import { isFirstAppLaunch } from '../utils/platform';
import store from '../config';

export default () => {
  if (isFirstAppLaunch(store)) {
    log.debug("First launch")
  }
}
