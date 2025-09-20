'use strict';

const { createPrivmsgHandler } = require('../src/message-handler');
const ruleManager = require('../src/rule-manager');
const { PluginLogger } = require('../src/logger');

// Mock dependencies
jest.mock('../src/rule-manager');
jest.mock('../src/logger');

describe('createPrivmsgHandler', () => {
  let client;
  let network;
  let data;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    client = {
      runAsUser: jest.fn(),
    };

    network = {
      name: 'TestServer',
      nick: 'MyBot',
      channels: [
        { name: '#general', id: 1 },
        { name: '#bots', id: 2 },
      ],
    };

    data = {
      nick: 'User1',
      target: '#general',
      message: '',
    };

    // Mock ruleManager getters
    ruleManager.getRules.mockReturnValue([]);
    ruleManager.getRuleCooldowns.mockReturnValue(new Map());
  });

  it('should not respond if no rules match', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'non-matching text',
      response_message: 'should not be sent',
    }]);
    data.message = 'this is a test message';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).not.toHaveBeenCalled();
  });

  it('should handle simple trigger_text (backwards compatibility)', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'hello bot',
      response_message: 'hello user',
    }]);
    data.message = 'well hello bot, how are you?';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('hello user', 1);
  });

  it('should handle trigger_pattern with regex', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_pattern: 'level (\\d+)',
      response_message: 'level detected',
    }]);
    data.message = 'user reached level 5';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('level detected', 1);
  });

  it('should handle trigger_pattern with case-insensitive flag', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_pattern: 'help',
      trigger_flags: 'i',
      response_message: 'help is on the way',
    }]);
    data.message = 'I need HELP';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('help is on the way', 1);
  });

  it('should substitute {{sender}} variable', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'ping',
      response_message: 'pong, {{sender}}!',
    }]);
    data.message = 'ping';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('pong, User1!', 1);
  });

  it('should substitute {{me}} variable in trigger_text', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: '{{me}}: status',
      response_message: 'I am here',
    }]);
    data.message = 'MyBot: status';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('I am here', 1);
  });

  it('should substitute {{me}} variable in trigger_pattern', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_pattern: '^({{me}}):\\s+good'
      ,
      trigger_flags: 'i',
      response_message: 'thanks',
    }]);
    data.message = 'mybot: good job';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('thanks', 1);
  });

  it('should substitute capture groups ($1, $2) in response', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_pattern: 'order (\\w+) and (\\w+)',
      response_message: 'Ordering $1 and $2 for {{sender}}.',
    }]);
    data.message = 'order pizza and soda';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).toHaveBeenCalledWith('Ordering pizza and soda for User1.', 1);
  });

  it('should not crash and should log an error on invalid regex', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_pattern: 'invalid[regex',
      response_message: 'should not trigger',
    }]);
    data.message = 'this is a message';

    const handler = createPrivmsgHandler(client, network);
    handler(data);

    expect(client.runAsUser).not.toHaveBeenCalled();
    expect(PluginLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[AM] Invalid regex for rule:'),
      expect.any(String)
    );
  });

  it('should respect cooldown', () => {
    const rule = {
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'repeat',
      response_message: 'first!',
      cooldown_seconds: 10,
    };
    const cooldowns = new Map();
    ruleManager.getRules.mockReturnValue([rule]);
    ruleManager.getRuleCooldowns.mockReturnValue(cooldowns);
    data.message = 'repeat';

    const handler = createPrivmsgHandler(client, network);
    
    // First call, should work
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
    expect(client.runAsUser).toHaveBeenCalledWith('first!', 1);

    // Second call, should be on cooldown
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1); // Still 1, not called again
  });
});
