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
const ruleManager = require('../src/rule-manager');

describe('Rule Manager', () => {
  const configDir = '/fake/dir';
  const rulesFilePath = path.join(configDir, 'rules.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    it('should create a default rules.json if one does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockReturnValue('[]');

      ruleManager.init(configDir);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        rulesFilePath,
        expect.stringContaining('"server": "Libera.Chat"')
      );
      expect(fs.readFileSync).toHaveBeenCalledWith(rulesFilePath, 'utf8');
    });

    it('should not create a rules.json if it already exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[]');

      ruleManager.init(configDir);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('loadRules', () => {
    beforeEach(() => {
      // We must call init to set the config path for loadRules to use.
      // We mock existsSync and readFileSync to control the init behavior.
      fs.existsSync.mockReturnValue(true);
    });

    it('should load and parse rules correctly from a valid file', () => {
      const mockRules = [{ server: 'Test', trigger_text: 'ping', response_text: 'pong' }];
      fs.readFileSync.mockReturnValue(JSON.stringify(mockRules));

      ruleManager.init(configDir); // init calls loadRules internally

      expect(ruleManager.getRules()).toEqual(mockRules);
      expect(PluginLogger.info).toHaveBeenCalledWith(expect.stringContaining('Rules successfully reloaded. Found 1 rules.'));
    });

    it('should clear cooldowns when rules are reloaded', () => {
      const cooldowns = ruleManager.getRuleCooldowns();
      cooldowns.set({ rule: 'some_rule' }, Date.now());
      expect(cooldowns.size).toBe(1);

      fs.readFileSync.mockReturnValue('[]');
      ruleManager.init(configDir); // init calls loadRules

      expect(ruleManager.getRuleCooldowns().size).toBe(0);
      expect(PluginLogger.debug).toHaveBeenCalledWith('[AM] All rule cooldowns have been reset.');
    });

    it('should call the tellUser callback on successful load', () => {
      fs.readFileSync.mockReturnValue('[]');
      const tellUser = jest.fn();

      ruleManager.init(configDir); // Necessary to set path
      ruleManager.loadRules(tellUser);

      expect(tellUser).toHaveBeenCalledWith('Rules successfully reloaded. Found 0 rules.');
    });

    it('should handle JSON syntax errors gracefully', () => {
      fs.readFileSync.mockReturnValue('{ "invalid_json": }');
      const tellUser = jest.fn();

      ruleManager.init(configDir); // This will fail to load
      ruleManager.loadRules(tellUser); // Call again to check tellUser

      expect(PluginLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'), expect.any(String));
      expect(tellUser).toHaveBeenCalledWith(expect.stringContaining('ERROR: Failed to parse'));
    });

    it('should handle file not found errors gracefully', () => {
      const error = new Error("File not found");
      error.code = 'ENOENT';
      fs.readFileSync.mockImplementation(() => { throw error; });
      const tellUser = jest.fn();

      ruleManager.init(configDir); // This will fail to load
      ruleManager.loadRules(tellUser); // Call again to check tellUser

      expect(PluginLogger.error).toHaveBeenCalledWith(expect.stringContaining('Configuration file not found'), expect.any(String));
      expect(tellUser).toHaveBeenCalledWith(expect.stringContaining('ERROR: Configuration file not found'));
    });
  });
});
