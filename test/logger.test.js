'use strict';

const { PluginLogger } = require('../src/logger');

describe('PluginLogger', () => {
  let mockLogger;
  let mockConfigProvider;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    mockConfigProvider = {
      getPluginConfig: jest.fn(),
    };
    // Initialize the logger with our mocks
    PluginLogger.init(mockLogger, mockConfigProvider);
  });

  it('should always log info messages', () => {
    PluginLogger.info('This is an info message');
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('This is an info message');
  });

  it('should always log error messages', () => {
    PluginLogger.error('This is an error message');
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith('This is an error message');
  });

  describe('debug logging', () => {
    it('should log debug messages when debug mode is ENABLED', () => {
      // Arrange: set debug mode to true
      mockConfigProvider.getPluginConfig.mockReturnValue({ debug: true });

      // Act
      PluginLogger.debug('This is a debug message');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('This is a debug message');
    });

    it('should NOT log debug messages when debug mode is DISABLED', () => {
      // Arrange: set debug mode to false
      mockConfigProvider.getPluginConfig.mockReturnValue({ debug: false });

      // Act
      PluginLogger.debug('This is a debug message');

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should not crash if the config provider is not available', () => {
        PluginLogger.init(mockLogger, null); // Simulate missing provider
        expect(() => PluginLogger.debug('test')).not.toThrow();
        expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should not crash if the logger instance is not available', () => {
        mockConfigProvider.getPluginConfig.mockReturnValue({ debug: true }); // Ensure config is valid
        PluginLogger.init(null, mockConfigProvider);
        expect(() => {
            PluginLogger.info('test');
            PluginLogger.error('test');
            PluginLogger.debug('test');
        }).not.toThrow();
    });
  });
});
