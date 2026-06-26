/**
 * Logger.test.ts
 *
 * Unit tests for Logger
 */

// Mock the require function to return our mock logger
const mockMagicMirrorLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  log: jest.fn()
};

// Mock the module before importing
jest.mock('../../../js/logger.js', () => mockMagicMirrorLogger, {
  virtual: true
});

import Logger from './Logger';

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the internal logger instance to force re-initialization
    (Logger as unknown as { _log: unknown })._log = null;
    // Make sure require returns our mock
    jest.doMock('../../../js/logger.js', () => mockMagicMirrorLogger);
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(Logger).toBeDefined();
      expect(typeof Logger).toBe('object');
    });
  });

  describe('info', () => {
    it('should call MagicMirror logger info method', () => {
      Logger.info('Test message');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should add module prefix to message', () => {
      Logger.info('Test message');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Test message'
      );
    });

    it('should pass additional arguments', () => {
      Logger.info('Test message', 'arg1', 'arg2', 123);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Test message',
        'arg1',
        'arg2',
        123
      );
    });

    it('should not add prefix if already present', () => {
      Logger.info('[MMM-SynInstax] Already prefixed');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Already prefixed'
      );
    });

    it('should handle non-string messages', () => {
      Logger.info(123 as unknown as string);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] 123'
      );
    });

    it('should handle object messages', () => {
      const obj = { key: 'value' };
      Logger.info(obj as unknown as string);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] [object Object]'
      );
    });
  });

  describe('error', () => {
    it('should call MagicMirror logger error method', () => {
      Logger.error('Error message');

      expect(mockMagicMirrorLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should add module prefix to message', () => {
      Logger.error('Error message');

      expect(mockMagicMirrorLogger.error).toHaveBeenCalledWith(
        '[MMM-SynInstax] Error message'
      );
    });

    it('should pass additional arguments', () => {
      const error = new Error('Test error');
      Logger.error('Error occurred', error);

      expect(mockMagicMirrorLogger.error).toHaveBeenCalledWith(
        '[MMM-SynInstax] Error occurred',
        error
      );
    });

    it('should not add prefix if already present', () => {
      Logger.error('[MMM-SynInstax] Already prefixed error');

      expect(mockMagicMirrorLogger.error).toHaveBeenCalledWith(
        '[MMM-SynInstax] Already prefixed error'
      );
    });
  });

  describe('warn', () => {
    it('should call MagicMirror logger warn method', () => {
      Logger.warn('Warning message');

      expect(mockMagicMirrorLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('should add module prefix to message', () => {
      Logger.warn('Warning message');

      expect(mockMagicMirrorLogger.warn).toHaveBeenCalledWith(
        '[MMM-SynInstax] Warning message'
      );
    });

    it('should pass additional arguments', () => {
      Logger.warn('Warning message', 'detail1', 'detail2');

      expect(mockMagicMirrorLogger.warn).toHaveBeenCalledWith(
        '[MMM-SynInstax] Warning message',
        'detail1',
        'detail2'
      );
    });

    it('should not add prefix if already present', () => {
      Logger.warn('[MMM-SynInstax] Already prefixed warning');

      expect(mockMagicMirrorLogger.warn).toHaveBeenCalledWith(
        '[MMM-SynInstax] Already prefixed warning'
      );
    });
  });

  describe('debug', () => {
    it('should call MagicMirror logger debug method', () => {
      Logger.debug('Debug message');

      expect(mockMagicMirrorLogger.debug).toHaveBeenCalledTimes(1);
    });

    it('should add module prefix to message', () => {
      Logger.debug('Debug message');

      expect(mockMagicMirrorLogger.debug).toHaveBeenCalledWith(
        '[MMM-SynInstax] Debug message'
      );
    });

    it('should pass additional arguments', () => {
      const debugData = { foo: 'bar' };
      Logger.debug('Debug message', debugData);

      expect(mockMagicMirrorLogger.debug).toHaveBeenCalledWith(
        '[MMM-SynInstax] Debug message',
        debugData
      );
    });

    it('should not add prefix if already present', () => {
      Logger.debug('[MMM-SynInstax] Already prefixed debug');

      expect(mockMagicMirrorLogger.debug).toHaveBeenCalledWith(
        '[MMM-SynInstax] Already prefixed debug'
      );
    });
  });

  describe('log', () => {
    it('should call MagicMirror logger log method', () => {
      Logger.log('Log message');

      expect(mockMagicMirrorLogger.log).toHaveBeenCalledTimes(1);
    });

    it('should add module prefix to message', () => {
      Logger.log('Log message');

      expect(mockMagicMirrorLogger.log).toHaveBeenCalledWith(
        '[MMM-SynInstax] Log message'
      );
    });

    it('should pass additional arguments', () => {
      Logger.log('Log message', 1, 2, 3);

      expect(mockMagicMirrorLogger.log).toHaveBeenCalledWith(
        '[MMM-SynInstax] Log message',
        1,
        2,
        3
      );
    });

    it('should not add prefix if already present', () => {
      Logger.log('[MMM-SynInstax] Already prefixed log');

      expect(mockMagicMirrorLogger.log).toHaveBeenCalledWith(
        '[MMM-SynInstax] Already prefixed log'
      );
    });
  });

  describe('fallback behavior', () => {
    it('should fallback to console if MagicMirror logger not available', () => {
      jest.resetModules();

      // Spy on console methods
      const consoleSpy = {
        info: jest.spyOn(console, 'info').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        debug: jest.spyOn(console, 'debug').mockImplementation(),
        log: jest.spyOn(console, 'log').mockImplementation()
      };

      // Mock require to throw error
      jest.mock(
        '../../../js/logger.js',
        () => {
          throw new Error('Logger not found');
        },
        { virtual: true }
      );

      // Should use console instead
      Logger.info('Test');
      expect(consoleSpy.info).toHaveBeenCalledWith('[MMM-SynInstax] Test');

      Logger.error('Error');
      expect(consoleSpy.error).toHaveBeenCalledWith('[MMM-SynInstax] Error');

      // Restore console
      Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple log levels in sequence', () => {
      Logger.info('Info message');
      Logger.warn('Warning message');
      Logger.error('Error message');
      Logger.debug('Debug message');
      Logger.log('Log message');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Info message'
      );
      expect(mockMagicMirrorLogger.warn).toHaveBeenCalledWith(
        '[MMM-SynInstax] Warning message'
      );
      expect(mockMagicMirrorLogger.error).toHaveBeenCalledWith(
        '[MMM-SynInstax] Error message'
      );
      expect(mockMagicMirrorLogger.debug).toHaveBeenCalledWith(
        '[MMM-SynInstax] Debug message'
      );
      expect(mockMagicMirrorLogger.log).toHaveBeenCalledWith(
        '[MMM-SynInstax] Log message'
      );
    });

    it('should handle empty strings', () => {
      Logger.info('');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] '
      );
    });

    it('should handle null message', () => {
      Logger.info(null as unknown as string);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] null'
      );
    });

    it('should handle undefined message', () => {
      Logger.info(undefined as unknown as string);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] undefined'
      );
    });

    it('should handle message with prefix in the middle', () => {
      Logger.info('Message with [MMM-SynInstax] in middle');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Message with [MMM-SynInstax] in middle'
      );
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(1000);
      Logger.info(longMessage);

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        `[MMM-SynInstax] ${longMessage}`
      );
    });

    it('should handle special characters in message', () => {
      Logger.info('Message with\nnewline\tand\ttabs');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Message with\nnewline\tand\ttabs'
      );
    });

    it('should handle unicode characters', () => {
      Logger.info('Message with émojis 🎉 and spëcial çhars');

      expect(mockMagicMirrorLogger.info).toHaveBeenCalledWith(
        '[MMM-SynInstax] Message with émojis 🎉 and spëcial çhars'
      );
    });
  });
});
