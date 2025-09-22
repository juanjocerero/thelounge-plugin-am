'use strict';

// Mock dependencies using the factory parameter to provide a mock implementation
const mockPrivmsgHandler = jest.fn();
jest.mock('../src/message-handler', () => ({
  createPrivmsgHandler: jest.fn(() => mockPrivmsgHandler),
  safeJsonStringify: jest.fn((obj) => JSON.stringify(obj)),
}));

const mockPluginConfig = { debug: false, enableFetch: false, fetchWhitelist: [] };
jest.mock('../src/plugin-config', () => ({
  getPluginConfig: jest.fn(() => mockPluginConfig),
  savePluginConfig: jest.fn(),
}));

jest.mock('../src/rule-manager', () => ({
  loadRules: jest.fn(),
  getRules: jest.fn(() => []),
  mergeRules: jest.fn(),
  saveRules: jest.fn(),
}));

const { createPrivmsgHandler, safeJsonStringify } = require('../src/message-handler');

// Mock the rule-validator module
jest.mock('../src/rule-validator', () => ({
  validateRules: jest.fn(),
}));

const { validateRules } = require('../src/rule-validator');

// Mock the global fetch API
global.fetch = jest.fn();

const { answeringMachineCommand, activeListeners } = require('../src/commands');

describe('Answering Machine Command (/am)', () => {
  let client;
  let target;
  let network;

  beforeEach(() => {
    // Clear mock usage history before each test
    jest.clearAllMocks();
    // Manually reset the state of the command module instead of using jest.resetModules()
    activeListeners.clear();

    // Reset our manual mock state
    mockPluginConfig.debug = false;
    mockPluginConfig.enableFetch = false;
    mockPluginConfig.fetchWhitelist = [];


    // Mock the TheLounge client environment
    client = {
      client: { name: 'TestClient' },
      sendMessage: jest.fn(),
    };
    network = {
      uuid: 'network-uuid-123',
      name: 'TestNet',
      irc: {
        on: jest.fn(),
        removeListener: jest.fn(),
      },
    };
    target = {
      chan: 1,
      network: network,
    };
  });

  const runCommand = (args) => {
    answeringMachineCommand.input(client, target, '/am', args);
  };

  it('should show help for no subcommand', () => {
    runCommand([]);
    expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('--- TheLounge Answering Machine Help ---'), 1);
  });

  describe('start', () => {
    it('should start the listener for an inactive network', () => {
      runCommand(['start']);
      expect(network.irc.on).toHaveBeenCalledWith('privmsg', mockPrivmsgHandler);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener started for network: TestNet'), 1);
    });

    it('should not start the listener if already active', () => {
      runCommand(['start']); // First start
      runCommand(['start']); // Second start
      expect(network.irc.on).toHaveBeenCalledTimes(1);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener is already active'), 1);
    });
  });

  describe('stop', () => {
    it('should stop the listener for an active network', () => {
      runCommand(['start']); // Start it first
      runCommand(['stop']);
      expect(network.irc.removeListener).toHaveBeenCalledWith('privmsg', mockPrivmsgHandler);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener stopped for network: TestNet'), 1);
    });

    it('should not stop the listener if not active', () => {
      runCommand(['stop']);
      expect(network.irc.removeListener).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener is not active'), 1);
    });
  });

  describe('status', () => {
    it('should report ACTIVE for an active listener', () => {
      runCommand(['start']);
      runCommand(['status']);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener is ACTIVE'), 1);
    });

    it('should report INACTIVE for an inactive listener', () => {
      runCommand(['status']);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener is INACTIVE'), 1);
    });
  });

  describe('reload', () => {
    it('should call ruleManager.loadRules with a tellUser function', () => {
      const ruleManager = require('../src/rule-manager');
      runCommand(['reload']);
      expect(ruleManager.loadRules).toHaveBeenCalledWith(expect.any(Function));
      // Test the callback
      const tellUserCallback = ruleManager.loadRules.mock.calls[0][0];
      tellUserCallback('Reloaded.');
      expect(client.sendMessage).toHaveBeenCalledWith('[AM] Reloaded.', 1);
    });
  });

  describe('debug', () => {
    it('status: should report when debug is DISABLED', () => {
      mockPluginConfig.debug = false;
      runCommand(['debug', 'status']);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode is currently DISABLED'), 1);
    });

    it('status: should report when debug is ENABLED', () => {
      mockPluginConfig.debug = true;
      runCommand(['debug', 'status']);
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode is currently ENABLED'), 1);
    });

    it('enable: should enable debug mode', () => {
      mockPluginConfig.debug = false;
      runCommand(['debug', 'enable']);
      expect(mockPluginConfig.debug).toBe(true);
      expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode has been ENABLED'), 1);
    });

    it('enable: should do nothing if already enabled', () => {
      mockPluginConfig.debug = true;
      runCommand(['debug', 'enable']);
      expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode is already ENABLED'), 1);
    });

    it('disable: should disable debug mode', () => {
      mockPluginConfig.debug = true;
      runCommand(['debug', 'disable']);
      expect(mockPluginConfig.debug).toBe(false);
      expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode has been DISABLED'), 1);
    });

    it('disable: should do nothing if already disabled', () => {
      mockPluginConfig.debug = false;
      runCommand(['debug', 'disable']);
      expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Debug mode is already DISABLED'), 1);
    });
  });

  describe('fetch (admin)', () => {
    it('status: should report when fetch is DISABLED', () => {
        runCommand(['fetch', 'status']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching is currently DISABLED'), 1);
    });

    it('status: should report when fetch is ENABLED', () => {
        mockPluginConfig.enableFetch = true;
        runCommand(['fetch', 'status']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching is currently ENABLED'), 1);
    });

    it('enable: should enable fetch mode', () => {
        runCommand(['fetch', 'enable']);
        expect(mockPluginConfig.enableFetch).toBe(true);
        expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching has been ENABLED'), 1);
    });

    it('enable: should do nothing if already enabled', () => {
        mockPluginConfig.enableFetch = true;
        runCommand(['fetch', 'enable']);
        expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching is already ENABLED'), 1);
    });

    it('disable: should disable fetch mode', () => {
        mockPluginConfig.enableFetch = true;
        runCommand(['fetch', 'disable']);
        expect(mockPluginConfig.enableFetch).toBe(false);
        expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching has been DISABLED'), 1);
    });

    it('disable: should do nothing if already disabled', () => {
        mockPluginConfig.enableFetch = false;
        runCommand(['fetch', 'disable']);
        expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Remote rule fetching is already DISABLED'), 1);
    });
  });

  describe('whitelist', () => {
    it('list: should report an empty whitelist', () => {
        runCommand(['whitelist', 'list']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('whitelist is currently empty'), 1);
    });

    it('list: should list all domains in the whitelist', () => {
        mockPluginConfig.fetchWhitelist = ['example.com', 'test.org'];
        runCommand(['whitelist', 'list']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Current fetch domain whitelist:'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('- example.com'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('- test.org'), 1);
    });

    it('add: should add a new domain to the whitelist', () => {
        runCommand(['whitelist', 'add', 'example.com']);
        expect(mockPluginConfig.fetchWhitelist).toContain('example.com');
        expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('has been ADDED'), 1);
    });

    it('add: should not add a duplicate domain', () => {
        mockPluginConfig.fetchWhitelist = ['example.com'];
        runCommand(['whitelist', 'add', 'example.com']);
        expect(mockPluginConfig.fetchWhitelist.length).toBe(1);
        expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('is already in the whitelist'), 1);
    });

    it('add: should show usage if no domain is provided', () => {
        runCommand(['whitelist', 'add']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Usage: /am whitelist add <domain>'), 1);
    });

    it('remove: should remove an existing domain', () => {
        mockPluginConfig.fetchWhitelist = ['example.com', 'test.org'];
        runCommand(['whitelist', 'remove', 'example.com']);
        expect(mockPluginConfig.fetchWhitelist).not.toContain('example.com');
        expect(mockPluginConfig.fetchWhitelist).toContain('test.org');
        expect(require('../src/plugin-config').savePluginConfig).toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('has been REMOVED'), 1);
    });

    it('remove: should do nothing if domain is not in the list', () => {
        mockPluginConfig.fetchWhitelist = ['test.org'];
        runCommand(['whitelist', 'remove', 'example.com']);
        expect(mockPluginConfig.fetchWhitelist.length).toBe(1);
        expect(require('../src/plugin-config').savePluginConfig).not.toHaveBeenCalled();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('is not in the whitelist'), 1);
    });

    it('remove: should show usage if no domain is provided', () => {
        runCommand(['whitelist', 'remove']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Usage: /am whitelist remove <domain>'), 1);
    });
  });

  describe('/am rules', () => {
    const ruleManager = require('../src/rule-manager');

    it('should report an error if the listener is not active', () => {
        runCommand(['rules']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Listener is not active'), 1);
    });

    it('should report when no rules are found for the current server', () => {
        runCommand(['start']); // Activate listener
        ruleManager.getRules.mockReturnValue([]);
        runCommand(['rules']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('No active rules found for this server (TestNet)'), 1);
    });

    it('should not show rules for other servers', () => {
        runCommand(['start']);
        const otherServerRule = { server: 'OtherNet', listen_channel: '#a', trigger_text: 'a', response_text: 'b' };
        ruleManager.getRules.mockReturnValue([otherServerRule]);
        runCommand(['rules']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('No active rules found for this server (TestNet)'), 1);
    });

    it('should display a single, simple rule correctly', () => {
        runCommand(['start']);
        const rule = { server: 'TestNet', listen_channel: '#general', trigger_text: 'help', response_text: 'read the docs' };
        ruleManager.getRules.mockReturnValue([rule]);
        runCommand(['rules']);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('1. [#general] "help" -> "read the docs"'), 1);
    });

    it('should display multiple complex rules with correct formatting', () => {
        runCommand(['start']);
        const rules = [
            { server: 'TestNet', listen_channel: '#a', trigger_text: 't1', response_text: 'r1', response_channel: 'user', cooldown_seconds: 10 },
            { server: 'TestNet', listen_channel: '#b', trigger_text: 't2', response_text: 'r2', delay_seconds: 5 },
            { server: 'TestNet', listen_channel: '#c', trigger_text: 't3', response_text: 'r3', cooldown_seconds: 30, delay_seconds: 3 }
        ];
        ruleManager.getRules.mockReturnValue(rules);
        runCommand(['rules']);

        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Active rules for this server (TestNet):'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('1. [#a] "t1" -> user: "r1" (cooldown: 10s)'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('2. [#b] "t2" -> "r2" (delay: 5s)'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('3. [#c] "t3" -> "r3" (cooldown: 30s, delay: 3s)'), 1);
    });
  });

  describe('/am fetch <URL>', () => {
    const { validateRules } = require('../src/rule-validator');
    const ruleManager = require('../src/rule-manager');
    const validUrl = 'https://example.com/rules.json';

    // Helper to wait for the async IIFE in the command to finish
    const waitForAsync = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
        // Reset mocks before each fetch test
        global.fetch.mockClear();
        validateRules.mockClear();
        ruleManager.getRules.mockClear();
        ruleManager.mergeRules.mockClear();
        ruleManager.saveRules.mockClear();
    });

    it('should fail if fetch is disabled', async () => {
        mockPluginConfig.enableFetch = false;
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: Remote rule fetching is disabled'), 1);
    });

    it('should fail if whitelist is empty', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = [];
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: The domain whitelist is empty'), 1);
    });

    it('should fail if domain is not in whitelist', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['another.com'];
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining("Error: The domain 'example.com' is not in the whitelist"), 1);
    });

    it('should fail for an invalid URL', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        runCommand(['fetch', 'not-a-valid-url']);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: Invalid URL provided'), 1);
    });

    it('should handle network errors during fetch', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        global.fetch.mockRejectedValue(new Error('Network Failure'));
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: Failed to fetch rules'), 1);
    });

    it('should handle non-OK HTTP responses', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        global.fetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: Failed to fetch rules'), 1);
    });

    it('should handle invalid JSON responses', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('this is not json') });
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: Failed to parse JSON'), 1);
    });

    it('should fail if rule validation fails', async () => {
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('[]') });
        validateRules.mockReturnValue({ isValid: false, error: 'Test validation error' });
        runCommand(['fetch', validUrl]);
        await waitForAsync();
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Error: The fetched rules are invalid. Test validation error'), 1);
    });

    it('should complete the full success path', async () => {
        // Arrange
        mockPluginConfig.enableFetch = true;
        mockPluginConfig.fetchWhitelist = ['example.com'];
        const newRules = [{ server: 'TestNet', listen_channel: '#new', trigger_text: 'new', response_text: 'rule' }];
        global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(JSON.stringify(newRules)) });
        validateRules.mockReturnValue({ isValid: true });
        ruleManager.mergeRules.mockReturnValue({ mergedRules: newRules, added: 1, overwritten: 0 });

        // Simulate the two states of getRules: before and after the fetch/save.
        ruleManager.getRules
            .mockReturnValueOnce([]) // First call for existingRules
            .mockReturnValue(newRules); // Subsequent calls for displayRulesForNetwork

        // Act
        runCommand(['fetch', validUrl]);
        await waitForAsync();

        // Assert
        expect(ruleManager.mergeRules).toHaveBeenCalledWith([], newRules);
        expect(ruleManager.saveRules).toHaveBeenCalledWith(newRules);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Fetch complete: 1 rules added, 0 rules overwritten.'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Active rules for this server (TestNet):'), 1);
        expect(client.sendMessage).toHaveBeenCalledWith(expect.stringContaining('1. [#new] "new" -> "rule"'), 1);
    });
  });
});
