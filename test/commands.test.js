'use strict';

// Mock dependencies using the factory parameter to provide a mock implementation
const mockPrivmsgHandler = jest.fn();
jest.mock('../src/message-handler', () => ({
  createPrivmsgHandler: jest.fn(() => mockPrivmsgHandler),
  safeJsonStringify: jest.fn((obj) => JSON.stringify(obj)),
}));

const mockPluginConfig = { debug: false };
jest.mock('../src/plugin-config', () => ({
  getPluginConfig: jest.fn(() => mockPluginConfig),
  savePluginConfig: jest.fn(),
}));

jest.mock('../src/rule-manager', () => ({
  loadRules: jest.fn(),
}));

const { answeringMachineCommand } = require('../src/commands');

describe('Answering Machine Command (/am)', () => {
  let client;
  let target;
  let network;

  beforeEach(() => {
    // Clear mock usage history and reset module state before each test
    jest.clearAllMocks();
    // Reset the activeListeners map by re-requiring the module.
    // This is safe now because the mocks are defined at the top level.
    jest.resetModules();
    const commandsModule = require('../src/commands');
    Object.assign(answeringMachineCommand, commandsModule.answeringMachineCommand);

    // Reset our manual mock state
    mockPluginConfig.debug = false;

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
});
