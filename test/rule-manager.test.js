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

  describe('mergeRules', () => {
    const existingRule1 = { server: 'TestNet', listen_channel: '#a', trigger_text: 'ping', response_text: 'pong1' };
    const existingRule2 = { server: 'TestNet', listen_channel: '#b', trigger_text: 'hello', response_text: 'world' };

    it('should add new rules that do not exist', () => {
        const existingRules = [existingRule1];
        const newRule = existingRule2;
        const { mergedRules, added, overwritten } = ruleManager.mergeRules(existingRules, [newRule]);

        expect(mergedRules.length).toBe(2);
        expect(added).toBe(1);
        expect(overwritten).toBe(0);
        expect(mergedRules).toContain(existingRule1);
        expect(mergedRules).toContain(newRule);
    });

    it('should overwrite an existing rule with the same identifier', () => {
        const existingRules = [existingRule1, existingRule2];
        const overwritingRule = { server: 'TestNet', listen_channel: '#a', trigger_text: 'ping', response_text: 'pong2' };
        const { mergedRules, added, overwritten } = ruleManager.mergeRules(existingRules, [overwritingRule]);

        expect(mergedRules.length).toBe(2);
        expect(added).toBe(0);
        expect(overwritten).toBe(1);
        // Check that the new rule is present and the old one is gone
        const mergedRule = mergedRules.find(r => r.listen_channel === '#a');
        expect(mergedRule.response_text).toBe('pong2');
    });

    it('should handle a mix of adding and overwriting', () => {
        const existingRules = [existingRule1];
        const newRules = [
            { server: 'TestNet', listen_channel: '#a', trigger_text: 'ping', response_text: 'pong2' }, // Overwrite
            { server: 'OtherNet', listen_channel: '#c', trigger_text: 'test', response_text: '123' } // Add
        ];
        const { mergedRules, added, overwritten } = ruleManager.mergeRules(existingRules, newRules);

        expect(mergedRules.length).toBe(2);
        expect(added).toBe(1);
        expect(overwritten).toBe(1);
    });

    it('should add all rules if existing rules array is empty', () => {
        const newRules = [existingRule1, existingRule2];
        const { mergedRules, added, overwritten } = ruleManager.mergeRules([], newRules);

        expect(mergedRules.length).toBe(2);
        expect(added).toBe(2);
        expect(overwritten).toBe(0);
    });

    it('should do nothing if new rules array is empty', () => {
        const existingRules = [existingRule1, existingRule2];
        const { mergedRules, added, overwritten } = ruleManager.mergeRules(existingRules, []);

        expect(mergedRules.length).toBe(2);
        expect(added).toBe(0);
        expect(overwritten).toBe(0);
        expect(mergedRules).toEqual(existingRules);
    });
  });

  describe('saveRules', () => {
    beforeEach(() => {
        // We need to ensure the config path is set by calling init first.
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('[]');
        ruleManager.init(configDir);
    });

    it('should call fs.writeFileSync with the correct path and content', () => {
        const rulesToSave = [
            { server: 'TestNet', listen_channel: '#a', trigger_text: 'ping', response_text: 'pong' }
        ];
        const expectedJsonString = JSON.stringify(rulesToSave, null, 2) + '\n';

        ruleManager.saveRules(rulesToSave);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
            rulesFilePath,
            expectedJsonString,
            'utf8'
        );
        expect(PluginLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully saved rules'));
    });

    it('should log an error if fs.writeFileSync fails', () => {
        const error = new Error('Disk full');
        fs.writeFileSync.mockImplementation(() => {
            throw error;
        });

        ruleManager.saveRules([]);

        expect(PluginLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('CRITICAL: Failed to save rules'),
            error
        );
    });
  });
});
