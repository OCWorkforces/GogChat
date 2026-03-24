import { setUpdateNotification, checkForUpdates } from 'electron-update-notifier';
import store from '../config.js';
import { createTrackedInterval, createTrackedTimeout } from '../utils/resourceCleanup.js';

let interval: ReturnType<typeof setInterval> | null = null;

export default () => {
  if (interval) clearInterval(interval);

  const shouldCheckForUpdates = () => {
    return store.get('app.autoCheckForUpdates');
  };

  // Runs once at startup
  createTrackedTimeout(
    () => {
      if (shouldCheckForUpdates()) {
        setUpdateNotification();
      }
    },
    5000,
    'appUpdates-initial-check'
  );

  interval = createTrackedInterval(
    () => {
      if (shouldCheckForUpdates()) {
        void checkForUpdates();
      }
    },
    1000 * 60 * 60 * 24,
    'appUpdates-daily-check'
  );
};
