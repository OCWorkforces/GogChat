/**
 * Unit tests for logging utilities
 * Tests scoped loggers and logging configuration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopedLogger, LogLevel, logger, configureLogging, getLogPath } from './logger';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    transports: {
      console: { level: 'info' },
      file: {
        level: 'info',
        getFile: () => ({ path: '/fake/log/path.log' }),
      },
    },
  },
}));

describe('LogLevel', () => {
  it('should have correct enum values', () => {
    expect(LogLevel.ERROR).toBe('error');
    expect(LogLevel.WARN).toBe('warn');
    expect(LogLevel.INFO).toBe('info');
    expect(LogLevel.DEBUG).toBe('debug');
  });
});

describe('ScopedLogger', () => {
  let scopedLogger: ScopedLogger;
  let electronLog: any;

  beforeEach(async () => {
    // Re-import to get fresh mocks
    const loggerModule = await import('electron-log');
    electronLog = loggerModule.default;

    // Clear all mocks
    vi.clearAllMocks();

    scopedLogger = new ScopedLogger('TestScope');
  });

  describe('error', () => {
    it('should log error messages with scope prefix', () => {
      scopedLogger.error('Test error message');

      expect(electronLog.error).toHaveBeenCalledWith('[TestScope] Test error message');
    });

    it('should support additional arguments', () => {
      scopedLogger.error('Error with data', { foo: 'bar' }, 123);

      expect(electronLog.error).toHaveBeenCalledWith(
        '[TestScope] Error with data',
        { foo: 'bar' },
        123
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages with scope prefix', () => {
      scopedLogger.warn('Test warning');

      expect(electronLog.warn).toHaveBeenCalledWith('[TestScope] Test warning');
    });

    it('should support additional arguments', () => {
      scopedLogger.warn('Warning', 'extra', 'data');

      expect(electronLog.warn).toHaveBeenCalledWith('[TestScope] Warning', 'extra', 'data');
    });
  });

  describe('info', () => {
    it('should log info messages with scope prefix', () => {
      scopedLogger.info('Information message');

      expect(electronLog.info).toHaveBeenCalledWith('[TestScope] Information message');
    });

    it('should support additional arguments', () => {
      scopedLogger.info('Info', { metadata: true });

      expect(electronLog.info).toHaveBeenCalledWith('[TestScope] Info', { metadata: true });
    });
  });

  describe('debug', () => {
    it('should log debug messages with scope prefix', () => {
      scopedLogger.debug('Debug information');

      expect(electronLog.debug).toHaveBeenCalledWith('[TestScope] Debug information');
    });

    it('should support additional arguments', () => {
      scopedLogger.debug('Debug', 1, 2, 3);

      expect(electronLog.debug).toHaveBeenCalledWith('[TestScope] Debug', 1, 2, 3);
    });
  });

  describe('logError', () => {
    it('should log structured error with timestamp and scope', () => {
      const errorEntry = {
        level: 'error' as const,
        message: 'Something went wrong',
        stack: 'Error: at line 42',
        meta: { userId: '123' },
      };

      scopedLogger.logError(errorEntry);

      expect(electronLog.error).toHaveBeenCalledWith(
        '[TestScope] ERROR: Something went wrong',
        'Error: at line 42',
        { userId: '123' }
      );
    });

    it('should handle missing stack trace', () => {
      const errorEntry = {
        level: 'warn' as const,
        message: 'Warning message',
      };

      scopedLogger.logError(errorEntry);

      expect(electronLog.error).toHaveBeenCalledWith('[TestScope] WARN: Warning message', '', {});
    });

    it('should handle missing metadata', () => {
      const errorEntry = {
        level: 'info' as const,
        message: 'Info message',
        stack: 'Stack trace',
      };

      scopedLogger.logError(errorEntry);

      expect(electronLog.error).toHaveBeenCalledWith(
        '[TestScope] INFO: Info message',
        'Stack trace',
        {}
      );
    });
  });

  describe('child', () => {
    it('should create child logger with nested scope', () => {
      const childLogger = scopedLogger.child('ChildScope');

      childLogger.info('Child message');

      expect(electronLog.info).toHaveBeenCalledWith('[TestScope:ChildScope] Child message');
    });

    it('should support multiple nesting levels', () => {
      const child1 = scopedLogger.child('Level1');
      const child2 = child1.child('Level2');

      child2.debug('Deeply nested');

      expect(electronLog.debug).toHaveBeenCalledWith('[TestScope:Level1:Level2] Deeply nested');
    });
  });
});

describe('Pre-configured loggers', () => {
  let electronLog: any;

  beforeEach(async () => {
    const loggerModule = await import('electron-log');
    electronLog = loggerModule.default;
    vi.clearAllMocks();
  });

  it('should have security logger', () => {
    logger.security.error('Security violation');

    expect(electronLog.error).toHaveBeenCalledWith('[Security] Security violation');
  });

  it('should have performance logger', () => {
    logger.performance.warn('Slow operation');

    expect(electronLog.warn).toHaveBeenCalledWith('[Performance] Slow operation');
  });

  it('should have IPC logger', () => {
    logger.ipc.info('IPC message received');

    expect(electronLog.info).toHaveBeenCalledWith('[IPC] IPC message received');
  });

  it('should have main logger', () => {
    logger.main.debug('App started');

    expect(electronLog.debug).toHaveBeenCalledWith('[Main] App started');
  });

  it('should have config logger', () => {
    logger.config.info('Config loaded');

    expect(electronLog.info).toHaveBeenCalledWith('[Config] Config loaded');
  });

  it('should have window logger', () => {
    logger.window.info('Window created');

    expect(electronLog.info).toHaveBeenCalledWith('[Window] Window created');
  });

  it('should create feature loggers dynamically', () => {
    const featureLogger = logger.feature('MyFeature');
    featureLogger.info('Feature initialized');

    expect(electronLog.info).toHaveBeenCalledWith('[Feature:MyFeature] Feature initialized');
  });
});

describe('configureLogging', () => {
  let electronLog: any;

  beforeEach(async () => {
    const loggerModule = await import('electron-log');
    electronLog = loggerModule.default;
    vi.clearAllMocks();
  });

  it('should set debug level in development mode', () => {
    configureLogging(true);

    expect(electronLog.transports.console.level).toBe('debug');
    expect(electronLog.transports.file.level).toBe('debug');
  });

  it('should set production levels in non-dev mode', () => {
    configureLogging(false);

    expect(electronLog.transports.console.level).toBe('warn');
    expect(electronLog.transports.file.level).toBe('info');
  });

  it('should log configuration message', () => {
    configureLogging(true);

    expect(electronLog.info).toHaveBeenCalledWith('[Logger] Logging configured', { isDev: true });
  });
});

describe('getLogPath', () => {
  it('should return log file path', () => {
    const path = getLogPath();

    expect(path).toBe('/fake/log/path.log');
  });
});
