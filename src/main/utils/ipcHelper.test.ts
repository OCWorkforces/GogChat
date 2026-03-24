/**
 * Unit tests for ipcHelper - Secure IPC handler factory module
 *
 * Covers: createSecureIPCHandler, createSecureReplyHandler, createSecureInvokeHandler,
 * createBroadcastHandler, sendToWindow, IPCHandlerManager, getIPCManager,
 * cleanupGlobalHandlers, commonValidators
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

// Mock electron first - must come before any imports that use electron
const mockGetAllWindows = vi.fn();
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeListener: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: Object.assign(
    vi.fn().mockImplementation(() => ({
      id: 1,
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn().mockReturnValue(false),
    })),
    { getAllWindows: mockGetAllWindows }
  ),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock rateLimiter
const mockIsAllowed = vi.fn();
vi.mock('./rateLimiter.js', () => ({
  getRateLimiter: () => ({
    isAllowed: mockIsAllowed,
  }),
}));

// Mock logger.ipc
vi.mock('./logger.js', () => ({
  logger: {
    ipc: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

// Mock errorHandler
vi.mock('./errorHandler.js', () => ({
  toError: (error: unknown) => {
    if (error instanceof Error) return error;
    return new Error(String(error));
  },
  toErrorMessage: (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  },
}));

describe('ipcHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsAllowed.mockReturnValue(true);
  });

  // ========================================================================
  // createSecureIPCHandler
  // ========================================================================
  describe('createSecureIPCHandler', () => {
    it('registers an IPC handler with ipcMain.on', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      expect(ipcMain.on).toHaveBeenCalledWith('test-channel', expect.any(Function));
      cleanup();
    });

    it('calls validator with incoming data', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const validator = vi.fn((data: unknown) => {
        if (typeof data !== 'string') throw new Error('Expected string');
        return data;
      });
      const handler = vi.fn();

      const _cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      // Get the registered handler
      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      // Invoke the handler with data
      registeredHandler(mockEvent, 'test-data');

      // Wait for async handler to complete
      await new Promise((r) => setImmediate(r));

      expect(validator).toHaveBeenCalledWith('test-data');
      expect(handler).toHaveBeenCalledWith('test-data', mockEvent);
    });

    it('skips handler when rate limited', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      mockIsAllowed.mockReturnValue(false);

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        rateLimit: 5,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');

      await new Promise((r) => setImmediate(r));

      expect(handler).not.toHaveBeenCalled();
      mockIsAllowed.mockReturnValue(true);
      cleanup();
    });

    it('respects custom rate limit parameter', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        rateLimit: 1,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      // First call should pass (mockIsAllowed returns true by default)
      registeredHandler(mockEvent, 'data1');
      await new Promise((r) => setImmediate(r));
      expect(handler).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('does not log when silent option is true', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');
      const { logger } = await import('./logger.js');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        silent: true,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(logger.ipc.debug).not.toHaveBeenCalled();
      cleanup();
    });

    it('logs debug message when not silent', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');
      const { logger } = await import('./logger.js');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        silent: false,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(logger.ipc.debug).toHaveBeenCalled();
      cleanup();
    });

    it('includes description in debug log when provided', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');
      const { logger } = await import('./logger.js');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        description: 'test operation',
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(logger.ipc.debug).toHaveBeenCalledWith(expect.stringContaining('test operation'));
      cleanup();
    });

    it('calls onError callback when handler throws', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const error = new Error('Handler failed');
      const handler = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        onError,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(onError).toHaveBeenCalledWith(expect.any(Error), mockEvent);
      cleanup();
    });

    it('returns cleanup function that removes the listener', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      cleanup();

      expect(ipcMain.removeListener).toHaveBeenCalledWith('test-channel', expect.any(Function));
    });

    it('handles async handler that resolves', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue(undefined);

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator: (data: unknown): string => data as string,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      registeredHandler({} as IpcMainEvent, 'test-data');

      await new Promise((r) => setImmediate(r));
      expect(handler).toHaveBeenCalled();

      cleanup();
    });
  });

  // ========================================================================
  // createSecureReplyHandler
  // ========================================================================
  describe('createSecureReplyHandler', () => {
    it('registers an IPC handler with ipcMain.on', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue('response');
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      expect(ipcMain.on).toHaveBeenCalledWith('test-channel', expect.any(Function));
      cleanup();
    });

    it('replies with success response when handler succeeds', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue('response-data');
      const validator = (data: unknown): string => data as string;
      const reply = vi.fn();

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
        replyChannel: 'test-reply',
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = { reply } as unknown as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(reply).toHaveBeenCalledWith('test-reply', {
        success: true,
        data: 'response-data',
      });
      cleanup();
    });

    it('uses default reply channel when not specified', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue('response-data');
      const validator = (data: unknown): string => data as string;
      const reply = vi.fn();

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = { reply } as unknown as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(reply).toHaveBeenCalledWith('test-channel-reply', {
        success: true,
        data: 'response-data',
      });
      cleanup();
    });

    it('replies with error when rate limited', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      mockIsAllowed.mockReturnValue(false);

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;
      const reply = vi.fn();

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
        rateLimit: 5,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = { reply } as unknown as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(reply).toHaveBeenCalledWith('test-channel-reply', {
        success: false,
        error: 'Rate limited',
      });
      expect(handler).not.toHaveBeenCalled();

      mockIsAllowed.mockReturnValue(true);
      cleanup();
    });

    it('replies with error when handler throws', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const error = new Error('Handler error');
      const handler = vi.fn().mockRejectedValue(error);
      const validator = (data: unknown): string => data as string;
      const reply = vi.fn();

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = { reply } as unknown as IpcMainEvent;

      registeredHandler(mockEvent, 'test-data');
      await new Promise((r) => setImmediate(r));

      expect(reply).toHaveBeenCalledWith('test-channel-reply', {
        success: false,
        error: 'Handler error',
      });
      cleanup();
    });

    it('calls onError callback when handler throws', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const error = new Error('Handler error');
      const handler = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const validator = (data: unknown): string => data as string;
      const reply = vi.fn();

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
        onError,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      registeredHandler({ reply } as unknown as IpcMainEvent, 'test-data');

      await new Promise((r) => setImmediate(r));

      expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
      cleanup();
    });

    it('returns cleanup function that removes the listener', async () => {
      const { createSecureReplyHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureReplyHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      cleanup();

      expect(ipcMain.removeListener).toHaveBeenCalledWith('test-channel', expect.any(Function));
    });
  });

  // ========================================================================
  // createSecureInvokeHandler
  // ========================================================================
  describe('createSecureInvokeHandler', () => {
    it('registers an IPC handler with ipcMain.handle', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue('response');
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      expect(ipcMain.handle).toHaveBeenCalledWith('test-channel', expect.any(Function));
      cleanup();
    });

    it('returns response from handler when successful', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn().mockResolvedValue('response-data');
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const mockEvent = {} as IpcMainInvokeEvent;

      const result = await registeredHandler(mockEvent, 'test-data');

      expect(result).toBe('response-data');
      expect(handler).toHaveBeenCalledWith('test-data', mockEvent);
      cleanup();
    });

    it('throws Error when rate limited', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      mockIsAllowed.mockReturnValue(false);

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator,
        handler,
        rateLimit: 5,
      });

      const registeredHandler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1];

      await expect(registeredHandler({} as IpcMainInvokeEvent, 'test-data')).rejects.toThrow(
        'Rate limited'
      );
      expect(handler).not.toHaveBeenCalled();

      mockIsAllowed.mockReturnValue(true);
      cleanup();
    });

    it('re-throws error when handler throws', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const error = new Error('Handler error');
      const handler = vi.fn().mockRejectedValue(error);
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1];

      await expect(registeredHandler({} as IpcMainInvokeEvent, 'test-data')).rejects.toThrow(
        'Handler error'
      );
      cleanup();
    });

    it('calls onError callback when handler throws', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const error = new Error('Handler error');
      const handler = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator,
        handler,
        onError,
      });

      const registeredHandler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1];

      await expect(registeredHandler({} as IpcMainInvokeEvent, 'test-data')).rejects.toThrow();

      // onError is called before re-throwing
      expect(onError).toHaveBeenCalled();

      cleanup();
    });

    it('logs debug message when not silent', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');
      const { logger } = await import('./logger.js');

      const handler = vi.fn().mockResolvedValue('response');

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator: (data: unknown): string => data as string,
        handler,
        silent: false,
      });

      const registeredHandler = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1];

      await registeredHandler({} as IpcMainInvokeEvent, 'test-data');

      expect(logger.ipc.debug).toHaveBeenCalledWith(expect.stringContaining('test-channel'));
      cleanup();
    });

    it('returns cleanup function that removes the handler', async () => {
      const { createSecureInvokeHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();

      const cleanup = createSecureInvokeHandler({
        channel: 'test-channel',
        validator: (data: unknown): string => data as string,
        handler,
      });

      cleanup();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('test-channel');
    });
  });

  // ========================================================================
  // createBroadcastHandler
  // ========================================================================
  describe('createBroadcastHandler', () => {
    it('creates a broadcast function that sends to all windows', async () => {
      const { createBroadcastHandler } = await import('./ipcHelper');
      const mockSend = vi.fn();

      const mockWindow1 = { id: 1, webContents: { send: mockSend } };
      const mockWindow2 = { id: 2, webContents: { send: mockSend } };

      mockGetAllWindows.mockReturnValue([mockWindow1, mockWindow2]);

      const broadcast = createBroadcastHandler({
        channel: 'broadcast-channel',
        validator: (data: unknown): string => data as string,
      });

      broadcast('broadcast-data');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith('broadcast-channel', 'broadcast-data');
    });

    it('validates data before broadcasting', async () => {
      const { createBroadcastHandler } = await import('./ipcHelper');
      const mockSend = vi.fn();

      const mockWindow = { id: 1, webContents: { send: mockSend } };
      mockGetAllWindows.mockReturnValue([mockWindow]);

      const validator = vi.fn((data: unknown): string => {
        if (typeof data !== 'string') throw new Error('Expected string');
        return data;
      });

      const broadcast = createBroadcastHandler({
        channel: 'broadcast-channel',
        validator,
      });

      broadcast('test-data');

      expect(validator).toHaveBeenCalledWith('test-data');
    });

    it('filters windows using optional filter function', async () => {
      const { createBroadcastHandler } = await import('./ipcHelper');
      const mockSend = vi.fn();

      const mockWindow1 = { id: 1, webContents: { send: mockSend } };
      const mockWindow2 = { id: 2, webContents: { send: mockSend } };

      mockGetAllWindows.mockReturnValue([mockWindow1, mockWindow2]);

      const broadcast = createBroadcastHandler({
        channel: 'broadcast-channel',
        validator: (data: unknown): string => data as string,
        filter: (window: { id: number }) => window.id === 1,
      });

      broadcast('broadcast-data');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('broadcast-channel', 'broadcast-data');
    });

    it('handles broadcast errors gracefully', async () => {
      const { createBroadcastHandler } = await import('./ipcHelper');
      const { logger } = await import('./logger.js');

      const mockWindow = {
        id: 1,
        webContents: {
          send: vi.fn().mockImplementation(() => {
            throw new Error('Send failed');
          }),
        },
      };
      mockGetAllWindows.mockReturnValue([mockWindow]);

      const broadcast = createBroadcastHandler({
        channel: 'broadcast-channel',
        validator: (data: unknown): string => data as string,
      });

      // Should not throw
      expect(() => broadcast('test-data')).not.toThrow();
      expect(logger.ipc.error).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // sendToWindow
  // ========================================================================
  describe('sendToWindow', () => {
    it('sends data to window webContents', async () => {
      const { sendToWindow } = await import('./ipcHelper');
      const mockSend = vi.fn();
      const mockWindow = {
        id: 1,
        webContents: { send: mockSend },
        isDestroyed: vi.fn().mockReturnValue(false),
      };

      const result = sendToWindow(
        mockWindow as unknown as import('electron').BrowserWindow,
        'channel',
        'data'
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith('channel', 'data');
    });

    it('returns false when window is null', async () => {
      const { sendToWindow } = await import('./ipcHelper');
      const { logger } = await import('./logger.js');

      const result = sendToWindow(null, 'channel', 'data');

      expect(result).toBe(false);
      expect(logger.ipc.warn).toHaveBeenCalled();
    });

    it('returns false when window is destroyed', async () => {
      const { sendToWindow } = await import('./ipcHelper');
      const { logger } = await import('./logger.js');
      const mockWindow = {
        id: 1,
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn().mockReturnValue(true),
      };

      const result = sendToWindow(
        mockWindow as unknown as import('electron').BrowserWindow,
        'channel',
        'data'
      );

      expect(result).toBe(false);
      expect(logger.ipc.warn).toHaveBeenCalled();
    });

    it('validates data before sending if validator provided', async () => {
      const { sendToWindow } = await import('./ipcHelper');
      const mockSend = vi.fn();
      const mockWindow = {
        id: 1,
        webContents: { send: mockSend },
        isDestroyed: vi.fn().mockReturnValue(false),
      };

      const validator = vi.fn((data: unknown): string => {
        if (typeof data !== 'string') throw new Error('Expected string');
        return data;
      });

      sendToWindow(
        mockWindow as unknown as import('electron').BrowserWindow,
        'channel',
        'data',
        validator
      );

      expect(validator).toHaveBeenCalledWith('data');
      expect(mockSend).toHaveBeenCalledWith('channel', 'data');
    });

    it('handles send errors gracefully', async () => {
      const { sendToWindow } = await import('./ipcHelper');
      const { logger } = await import('./logger.js');
      const mockWindow = {
        id: 1,
        webContents: {
          send: vi.fn().mockImplementation(() => {
            throw new Error('Send failed');
          }),
        },
        isDestroyed: vi.fn().mockReturnValue(false),
      };

      const result = sendToWindow(
        mockWindow as unknown as import('electron').BrowserWindow,
        'channel',
        'data'
      );

      expect(result).toBe(false);
      expect(logger.ipc.error).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // IPCHandlerManager
  // ========================================================================
  describe('IPCHandlerManager', () => {
    it('registers and cleans up handlers', async () => {
      const { IPCHandlerManager } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const manager = new IPCHandlerManager();

      manager.register({
        channel: 'channel1',
        validator: (data: unknown): string => data as string,
        handler: vi.fn(),
      });

      manager.registerReply({
        channel: 'channel2',
        validator: (data: unknown): string => data as string,
        handler: vi.fn().mockResolvedValue('response'),
      });

      manager.registerInvoke({
        channel: 'channel3',
        validator: (data: unknown): string => data as string,
        handler: vi.fn().mockResolvedValue('response'),
      });

      expect(ipcMain.on).toHaveBeenCalledTimes(2);
      expect(ipcMain.handle).toHaveBeenCalledTimes(1);

      manager.cleanup();

      expect(ipcMain.removeListener).toHaveBeenCalledTimes(2);
      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(1);
    });

    it('cleanup calls all registered cleanup functions', async () => {
      const { IPCHandlerManager } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      // Reset to clear previous call counts
      (ipcMain.on as ReturnType<typeof vi.fn>).mockClear();
      (ipcMain.handle as ReturnType<typeof vi.fn>).mockClear();

      const manager = new IPCHandlerManager();

      manager.register({
        channel: 'channel1',
        validator: (data: unknown): string => data as string,
        handler: vi.fn(),
      });

      manager.register({
        channel: 'channel2',
        validator: (data: unknown): string => data as string,
        handler: vi.fn(),
      });

      manager.cleanup();

      // Each handler should have its cleanup called
      expect(ipcMain.removeListener).toHaveBeenCalledTimes(2);
    });

    it('multiple cleanups are safe after first cleanup', async () => {
      const { IPCHandlerManager } = await import('./ipcHelper');

      const manager = new IPCHandlerManager();

      manager.register({
        channel: 'channel1',
        validator: (data: unknown): string => data as string,
        handler: vi.fn(),
      });

      manager.cleanup();
      // Second cleanup should not throw
      expect(() => manager.cleanup()).not.toThrow();
    });
  });

  // ========================================================================
  // getIPCManager / cleanupGlobalHandlers
  // ========================================================================
  describe('getIPCManager / cleanupGlobalHandlers', () => {
    it('getIPCManager returns singleton instance', async () => {
      const { getIPCManager } = await import('./ipcHelper');

      const manager1 = getIPCManager();
      const manager2 = getIPCManager();

      expect(manager1).toBe(manager2);
    });

    it('cleanupGlobalHandlers cleans up and resets singleton', async () => {
      const { getIPCManager, cleanupGlobalHandlers } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      // Get manager and register a handler
      const manager = getIPCManager();
      (ipcMain.on as ReturnType<typeof vi.fn>).mockClear();

      manager.register({
        channel: 'test-channel',
        validator: (data: unknown): string => data as string,
        handler: vi.fn(),
      });

      cleanupGlobalHandlers();

      // After cleanup, the manager should be reset
      expect(ipcMain.removeListener).toHaveBeenCalled();
    });

    it('getIPCManager returns fresh instance after cleanup', async () => {
      const { getIPCManager, cleanupGlobalHandlers } = await import('./ipcHelper');

      const manager1 = getIPCManager();
      cleanupGlobalHandlers();
      const manager2 = getIPCManager();

      // Should be different instances
      expect(manager1).not.toBe(manager2);
    });
  });

  // ========================================================================
  // commonValidators
  // ========================================================================
  describe('commonValidators', () => {
    it('isObject validates non-null objects', async () => {
      const { commonValidators } = await import('./ipcHelper');

      const result = commonValidators.isObject({ key: 'value' });
      expect(result).toEqual({ key: 'value' });
    });

    it('isObject throws for null', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isObject(null)).toThrow('Expected object');
    });

    it('isObject throws for non-object types', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isObject('string')).toThrow('Expected object');
      expect(() => commonValidators.isObject(123)).toThrow('Expected object');
      expect(() => commonValidators.isObject(true)).toThrow('Expected object');
      expect(() => commonValidators.isObject(undefined)).toThrow('Expected object');
    });

    it('isString validates strings', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(commonValidators.isString('hello')).toBe('hello');
    });

    it('isString throws for non-strings', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isString(123)).toThrow('Expected string');
      expect(() => commonValidators.isString(null)).toThrow('Expected string');
      expect(() => commonValidators.isString({})).toThrow('Expected string');
    });

    it('isNumber validates numbers', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(commonValidators.isNumber(42)).toBe(42);
      expect(commonValidators.isNumber(0)).toBe(0);
      expect(commonValidators.isNumber(-1)).toBe(-1);
    });

    it('isNumber throws for NaN', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isNumber(NaN)).toThrow('Expected valid number');
    });

    it('isNumber throws for non-numbers', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isNumber('42')).toThrow('Expected valid number');
      expect(() => commonValidators.isNumber(null)).toThrow('Expected valid number');
    });

    it('isBoolean validates booleans', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(commonValidators.isBoolean(true)).toBe(true);
      expect(commonValidators.isBoolean(false)).toBe(false);
    });

    it('isBoolean throws for non-booleans', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.isBoolean(1)).toThrow('Expected boolean');
      expect(() => commonValidators.isBoolean('true')).toThrow('Expected boolean');
      expect(() => commonValidators.isBoolean(null)).toThrow('Expected boolean');
    });

    it('noData always returns void', async () => {
      const { commonValidators } = await import('./ipcHelper');

      expect(() => commonValidators.noData('any')).not.toThrow();
      expect(() => commonValidators.noData(null)).not.toThrow();
      expect(() => commonValidators.noData(undefined)).not.toThrow();
      expect(() => commonValidators.noData({ key: 'value' })).not.toThrow();
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================
  describe('Edge cases', () => {
    it('handles null data in createSecureIPCHandler', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): Record<string, unknown> | null => {
        if (data === null) return null;
        return data as Record<string, unknown>;
      };

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Should not throw
      registeredHandler({} as IpcMainEvent, null);

      await new Promise((r) => setImmediate(r));
      cleanup();
    });

    it('handles undefined data in createSecureIPCHandler', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string | undefined => {
        if (data === undefined) return undefined;
        return data as string;
      };

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Should not throw
      registeredHandler({} as IpcMainEvent, undefined);

      await new Promise((r) => setImmediate(r));
      cleanup();
    });

    it('handles empty string data', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      registeredHandler({} as IpcMainEvent, '');

      await new Promise((r) => setImmediate(r));
      expect(handler).toHaveBeenCalledWith('', expect.anything());
      cleanup();
    });

    it('works without rateLimit (unlimited)', async () => {
      const { createSecureIPCHandler } = await import('./ipcHelper');
      const { ipcMain } = await import('electron');

      const handler = vi.fn();
      const validator = (data: unknown): string => data as string;

      const cleanup = createSecureIPCHandler({
        channel: 'test-channel',
        validator,
        handler,
        // No rateLimit specified
      });

      const registeredHandler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Should not check rate limiter when rateLimit is undefined
      registeredHandler({} as IpcMainEvent, 'test-data');

      await new Promise((r) => setImmediate(r));
      expect(handler).toHaveBeenCalled();
      cleanup();
    });
  });
});
