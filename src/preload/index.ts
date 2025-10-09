/**
 * Preload script entry point
 * With contextIsolation enabled, this script creates a secure bridge between
 * main and renderer processes using Electron's contextBridge API
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { GChatBridgeAPI } from '../shared/types.js';
import { IPC_CHANNELS } from '../shared/constants.js';
import {
  validateUnreadCount,
  validateFaviconURL,
  validatePasskeyFailureData,
  validateMessageData,
} from '../shared/validators.js';

/**
 * Expose secure API to renderer process via window.gchat
 * This API is the ONLY way renderer can communicate with main process
 */
const api: GChatBridgeAPI = {
  // Send messages to main process (with validation)
  sendUnreadCount: (count: number) => {
    try {
      const validated = validateUnreadCount(count);
      ipcRenderer.send(IPC_CHANNELS.UNREAD_COUNT, validated);
    } catch (error) {
      console.error('[Google Chat API] Invalid unread count:', error);
    }
  },

  sendFaviconChanged: (href: string) => {
    try {
      const validated = validateFaviconURL(href);
      ipcRenderer.send(IPC_CHANNELS.FAVICON_CHANGED, validated);
    } catch (error) {
      console.error('[Google Chat API] Invalid favicon URL:', error);
    }
  },

  sendNotificationClicked: () => {
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_CLICKED);
  },

  checkIfOnline: () => {
    ipcRenderer.send(IPC_CHANNELS.CHECK_IF_ONLINE);
  },

  reportPasskeyFailure: (errorType: string) => {
    try {
      const validated = validatePasskeyFailureData(errorType);
      ipcRenderer.send(IPC_CHANNELS.PASSKEY_AUTH_FAILED, validated);
    } catch (error) {
      console.error('[Google Chat API] Invalid passkey failure data:', error);
    }
  },

  sendMessageData: (messageData: unknown) => {
    try {
      const validated = validateMessageData(messageData);
      ipcRenderer.send(IPC_CHANNELS.MESSAGE_CAPTURED, validated);
    } catch (error) {
      console.error('[Google Chat API] Invalid message data:', error);
    }
  },

  // Receive messages from main process (returns unsubscribe function)
  onSearchShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.SEARCH_SHORTCUT, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_SHORTCUT, listener);
    };
  },

  onOnlineStatus: (callback: (online: boolean) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (_event: any, online: boolean) => callback(online);
    ipcRenderer.on(IPC_CHANNELS.ONLINE_STATUS, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ONLINE_STATUS, listener);
    };
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('gchat', api);

// Now load feature-specific preload scripts
// These will use the window.gchat API we just exposed
import './faviconChanged.js';
import './offline.js';
import './passkeyMonitor.js';
import './searchShortcut.js';
import './unreadCount.js';
import './messageObserver.js';
// Note: overrideNotifications needs special handling - loaded separately
