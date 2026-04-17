/**
 * Preload contextBridge API surface exposed on window.gogchat.
 */

/**
 * Context Bridge API exposed to renderer
 */
export interface GogChatBridgeAPI {
  // Send messages to main process
  sendUnreadCount: (count: number) => void;
  sendFaviconChanged: (href: string) => void;
  sendNotificationClicked: () => void;
  checkIfOnline: () => void;
  reportPasskeyFailure: (errorType: string) => void;

  // Receive messages from main process
  onSearchShortcut: (callback: () => void) => () => void;
  onOnlineStatus: (callback: (online: boolean) => void) => () => void;
}

/**
 * Extended window interface with our custom API
 */
declare global {
  interface Window {
    gogchat: GogChatBridgeAPI;
  }
}
