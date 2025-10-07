import log from "electron-log";
import { isFirstAppLaunch } from 'electron-util/main';

export default () => {
  if (isFirstAppLaunch()) {
    log.debug("First launch")
  }
}
