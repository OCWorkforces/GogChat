/**
 * IPC transport types: handlers, validated messages, rate limits, responses, payload map.
 */

import type { NotificationData, PasskeyFailureData } from './domain.js';

/**
 * IPC event handler type
 */
export type IPCHandler<T = unknown> = (
  event: Electron.IpcMainEvent,
  data: T
) => void | Promise<void>;

/**
 * Validated IPC message wrapper
 */
export interface ValidatedIPCMessage<T> {
  channel: string;
  data: T;
  timestamp: number;
  valid: boolean;
  error?: string;
}

/**
 * Rate limit tracking data
 */
export interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: number;
}

/**
 * Typed response wrapper for IPC reply/invoke handlers.
 * Discriminated union — check `success` before accessing `data` or `error`.
 *
 * @example
 *   const response: IPCResponse<number> = { success: true, data: 42 };
 *   if (response.success) { console.log(response.data); } // number
 *   else { console.error(response.error); } // string
 */
export type IPCResponse<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Maps each IPC channel string to its expected payload type.
 * Use this to enforce handler signature alignment with channel contracts.
 *
 * @example
 *   type Payload = IPCChannelPayloadMap[typeof IPC_CHANNELS.UNREAD_COUNT]; // number
 */
export interface IPCChannelPayloadMap {
  // renderer → main
  unreadCount: number;
  faviconChanged: string;
  notificationShow: NotificationData;
  notificationClicked: void;
  checkIfOnline: void;
  passkeyAuthFailed: PasskeyFailureData;
  // main → renderer
  searchShortcut: void;
  onlineStatus: boolean;
}
