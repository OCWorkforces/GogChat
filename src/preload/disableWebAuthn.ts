/**
 * Disable WebAuthn/U2F to prevent authentication stuck issues
 *
 * Problem: GogChat tries to use U2F/WebAuthn for 2FA when it detects
 * browser support. However, Electron doesn't properly handle U2F prompts,
 * causing the app to get stuck at "checking your identity" screen.
 *
 * Solution: Remove navigator.credentials API to make Google think the browser
 * doesn't support WebAuthn. This forces Google to offer alternative 2FA methods
 * (Authenticator codes, SMS, etc.) that work properly in Electron.
 *
 * Reference: https://github.com/ankurk91/google-chat-electron/issues/16
 */

// Delete navigator.credentials to disable WebAuthn/U2F
// This must run before Google's auth scripts execute
if (typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      writable: false,
      configurable: false,
    });
    console.log('[Preload] WebAuthn/U2F disabled via property override');
  } catch (e: unknown) {
    console.warn('[Preload] Failed to disable WebAuthn/U2F:', e);
  }
}
