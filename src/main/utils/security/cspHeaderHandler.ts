import type { BrowserWindow } from 'electron';
import log from 'electron-log';

/**
 * Hostnames whose CSP frame-ancestors and X-Frame-Options headers are
 * benign false-positives when embedded inside chat.google.com.
 * Also used by windowWrapper.ts to suppress matching console messages
 * and subframe load failures.
 */
export const BENIGN_CSP_BLOCKED_HOSTS = new Set(['accounts.google.com', 'ogs.google.com']);

/** Safe hostname extractor — returns null on malformed URLs. */
export function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Strip COEP/COOP headers that block cross-origin embedding in GogChat.
 * We intentionally do NOT wholesale replace Google's own CSP — doing so
 * (especially with a nonce) causes 'unsafe-inline' to be silently ignored
 * per the CSP3 spec, which blocks all of GogChat's inline scripts.
 * However, we surgically remove frame-ancestors from CSP on responses from
 * BENIGN_CSP_BLOCKED_HOSTS. These hosts set frame-ancestors to
 * studio.workspace.google.com, which causes ERR_BLOCKED_BY_RESPONSE when
 * embedded inside chat.google.com. Removing the directive allows the
 * subframes to load without affecting any other CSP protections.
 */
export function installHeaderFix(window: BrowserWindow): void {
  const ses = window.webContents.session;
  ses.webRequest.onHeadersReceived(
    {
      urls: [
        '*://*.google.com/*',
        '*://*.gstatic.com/*',
        '*://*.googleapis.com/*',
        '*://*.googleusercontent.com/*',
      ],
    },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['cross-origin-embedder-policy'];
      delete responseHeaders['cross-origin-opener-policy'];
      delete responseHeaders['Cross-Origin-Embedder-Policy'];
      delete responseHeaders['Cross-Origin-Opener-Policy'];

      // Strip frame-ancestors from CSP for benign hosts to prevent
      // subframe load failures (ERR_BLOCKED_BY_RESPONSE)
      const requestHostname = getHostname(details.url);
      if (requestHostname !== null && BENIGN_CSP_BLOCKED_HOSTS.has(requestHostname)) {
        for (const key of ['content-security-policy', 'Content-Security-Policy']) {
          const csp = responseHeaders[key];
          if (Array.isArray(csp)) {
            responseHeaders[key] = csp
              .map((policy) => policy.replace(/frame-ancestors\s+[^;]*;?/g, '').trim())
              .filter(Boolean);
            if (responseHeaders[key].length === 0) {
              delete responseHeaders[key];
            }
          }
        }

        // Also strip X-Frame-Options for these hosts. Since we removed
        // frame-ancestors from CSP, the ALLOW-FROM directive is the only
        // remaining framing restriction — and it's deprecated/ignored by
        // Chromium, causing noisy console warnings with no security benefit.
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
      }

      callback({ responseHeaders });
    }
  );
  log.debug('[Security] COEP/COOP header stripping installed');
}
