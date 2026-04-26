/**
 * IPC transport types: handlers, validated messages, rate limits, responses, payload map.
 */

import type { NotificationData, PasskeyFailureData } from './domain.js';
import type { IPCChannelName, IPC_CHANNELS } from '../constants.js';

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
  channel: IPCChannelName;
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
  [IPC_CHANNELS.UNREAD_COUNT]: number;
  [IPC_CHANNELS.FAVICON_CHANGED]: string;
  [IPC_CHANNELS.NOTIFICATION_SHOW]: NotificationData;
  [IPC_CHANNELS.NOTIFICATION_CLICKED]: void;
  [IPC_CHANNELS.CHECK_IF_ONLINE]: void;
  [IPC_CHANNELS.PASSKEY_AUTH_FAILED]: PasskeyFailureData;
  // main → renderer
  [IPC_CHANNELS.SEARCH_SHORTCUT]: void;
  [IPC_CHANNELS.ONLINE_STATUS]: boolean;
}
