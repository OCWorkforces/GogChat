import {BrowserWindow, dialog, HandlerDetails, shell} from 'electron';
import log from "electron-log";
import {WHITELISTED_HOSTS, URL_PATTERNS, TIMING} from '../../shared/constants';
import {validateExternalURL, isWhitelistedHost} from '../../shared/validators';

let guardAgainstExternalLinks = true;
const RE_GUARD_IN_MINUTES = TIMING.EXTERNAL_LINKS_REGUARD / (60 * 1000);
let interval: NodeJS.Timeout;

const ACTION_DENIED = {
  action: 'deny' as const
};

const ACTION_ALLOWED = {
  action: 'allow' as const
};

/**
 * Extract hostname from URL safely
 */
function extractHostname(url: string): string {
  try {
    return (new URL(url)).hostname;
  } catch (error) {
    log.warn('[ExternalLinks] Failed to parse URL hostname:', url);
    return '';
  }
}

/**
 * Check if URL is a valid HTTP/HTTPS URL
 */
function isValidHttpURL(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

/**
 * Check if URL should be opened externally
 */
function shouldOpenExternally(url: string, currentHost: string): boolean {
  const hostname = extractHostname(url);

  // Check if it's a download URL
  if (url.includes(URL_PATTERNS.DOWNLOAD)) {
    return true;
  }

  // Check if it's Gmail but not Chat
  const isGMailUrl = hostname === 'mail.google.com' &&
    !url.startsWith(URL_PATTERNS.CHAT_PREFIX);

  if (isGMailUrl) {
    return true;
  }

  // Check if not whitelisted
  if (!isWhitelistedHost(url, currentHost)) {
    return true;
  }

  return false;
}

export default (window: BrowserWindow) => {
  const handleRedirect = (details: HandlerDetails): typeof ACTION_DENIED | typeof ACTION_ALLOWED => {
    const url = details.url;

    // ✅ SECURITY: Validate URL protocol first
    if (!isValidHttpURL(url)) {
      log.warn('[ExternalLinks] Blocked non-HTTP URL:', url);
      return ACTION_DENIED;
    }

    // If guard is disabled, allow everything (temporary auth fix mode)
    if (!guardAgainstExternalLinks) {
      log.debug('[ExternalLinks] Guard disabled, allowing:', url);
      return ACTION_ALLOWED;
    }

    try {
      const currentHost = extractHostname(window.webContents.getURL());

      // Check if should open externally
      if (shouldOpenExternally(url, currentHost)) {
        setImmediate(() => {
          try {
            // ✅ SECURITY: Sanitize URL before opening
            const sanitizedURL = validateExternalURL(url);
            shell.openExternal(sanitizedURL);
            log.info('[ExternalLinks] Opened external URL:', sanitizedURL);
          } catch (error) {
            log.error('[ExternalLinks] Failed to open external URL:', error);
          }
        });

        return ACTION_DENIED;
      }

      // Allow navigation within whitelisted hosts
      log.debug('[ExternalLinks] Allowing whitelisted navigation:', url);
      return ACTION_ALLOWED;

    } catch (error) {
      log.error('[ExternalLinks] Error handling redirect:', error);
      return ACTION_DENIED;
    }
  };

  window.webContents.setWindowOpenHandler(handleRedirect);
};

const toggleExternalLinksGuard = (window: BrowserWindow) => {
  const actionLabel = guardAgainstExternalLinks ? 'Disable' : 'Enable';

  dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Confirm',
    message: 'Facing issues during authentication?',
    detail: `You can disable the external links security feature temporarily.\nDont forget to enable it back.\nIf you don't, it will be enabled automatically in ${RE_GUARD_IN_MINUTES} minutes.`,
    buttons: [`${actionLabel} Guard`, 'Close'],
    cancelId: 1,
    defaultId: 1,
  })
    .then(({response}) => {
      if (response === 0) {
        guardAgainstExternalLinks = !guardAgainstExternalLinks;

        stopReGuardTimer();

        if (!guardAgainstExternalLinks) {
          startReGuardTimer()
        }

        logGuardStatus();
      }
    })
}

const logGuardStatus = () => {
  log.debug(`External links guard is set to: ${guardAgainstExternalLinks}`)
}

const stopReGuardTimer = () => {
  clearInterval(interval);
}

const startReGuardTimer = () => {
  interval = setInterval(() => {
    guardAgainstExternalLinks = true;
    logGuardStatus();
  }, 1000 * 60 * RE_GUARD_IN_MINUTES)
}

export {toggleExternalLinksGuard}
