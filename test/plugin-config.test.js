'use strict';

jest.mock('fs');
const fs = require('fs');

jest.mock('../src/logger', () => ({
  PluginLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
const { PluginLogger } = require('../src/logger');

const path = require('path');
const pluginConfigManager = require('../src/plugin-config');

describe('Plugin Config Manager', () => {
  const configDir = '/fake/config';
  const configFilePath = path.join(configDir, 'config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    // Manually reset the internal state of the singleton module before each test.
    // This is done by setting the exported config object back to its default.
    const config = pluginConfigManager.getPluginConfig();
    for (const key in config) {
        delete config[key];
    }
    config.debug = false;
  });

  describe('init', () => {
    it('should create a default config.json if one does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockReturnValue(JSON.stringify({ debug: false }));

      pluginConfigManager.init(configDir);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        configFilePath,
        JSON.stringify({ debug: false }, null, 2) + '\n'
      );
    });

    it('should load the config from an existing file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ debug: true, other: 'value' }));

      pluginConfigManager.init(configDir);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(pluginConfigManager.getPluginConfig()).toEqual({ debug: true, other: 'value' });
    });
  });

  describe('loadPluginConfig', () => {
    it('should load and parse the config file correctly', () => {
      const mockConfig = { debug: true, setting: 'abc' };
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      pluginConfigManager.init(configDir);

      expect(pluginConfigManager.getPluginConfig()).toEqual(mockConfig);
      expect(PluginLogger.info).toHaveBeenCalledWith(expect.stringContaining('Plugin config successfully loaded. Debug mode is ENABLED'));
    });

    it('should use default config on JSON syntax error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ "debug": true, }'); // Invalid JSON

      pluginConfigManager.init(configDir);

      expect(PluginLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
        expect.any(String)
      );
      expect(pluginConfigManager.getPluginConfig()).toEqual({ debug: false });
    });

    it('should use default config on file not found error', () => {
      fs.existsSync.mockReturnValue(true);
      const error = new Error('Not found');
      error.code = 'ENOENT';
      fs.readFileSync.mockImplementation(() => { throw error; });

      pluginConfigManager.init(configDir);

      expect(PluginLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Plugin config file not found'),
        expect.any(String)
      );
      expect(pluginConfigManager.getPluginConfig()).toEqual({ debug: false });
    });
  });

  describe('savePluginConfig', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{}');
      pluginConfigManager.init(configDir);
    });

    it('should save the current config to the file', () => {
      const config = pluginConfigManager.getPluginConfig();
      config.debug = true;
      config.saved = true;

      pluginConfigManager.savePluginConfig();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        configFilePath,
        JSON.stringify({ debug: true, saved: true }, null, 2) + '\n'
      );
    });

    it('should log an error if saving fails', () => {
      const error = new Error('Disk full');
      fs.writeFileSync.mockImplementation(() => { throw error; });

      pluginConfigManager.savePluginConfig();

      expect(PluginLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL ERROR: Failed to save plugin config'),
        'Disk full'
      );
    });
  });
});
