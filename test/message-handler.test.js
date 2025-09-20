'use strict';

const { createPrivmsgHandler, safeJsonStringify } = require('../src/message-handler');
const ruleManager = require('../src/rule-manager');
const { PluginLogger } = require('../src/logger');

// Mock dependencies
jest.mock('../src/rule-manager');
jest.mock('../src/logger');

describe('safeJsonStringify', () => {
	it('should handle circular references without crashing', () => {
	  const obj = {};
	  obj.a = { b: obj }; // Create a circular reference
	  const json = safeJsonStringify(obj);
	  // Check that the output contains the placeholder for circular references
	  expect(json).toContain('[Circular]');
	});
  });

describe('createPrivmsgHandler', () => {
  let client;
  let network;
  let data;

  beforeEach(() => {
    jest.clearAllMocks();
    client = { runAsUser: jest.fn() };
    network = {
      name: 'TestServer',
      nick: 'MyBot',
      channels: [{ name: '#general', id: 1 }],
    };
    data = { nick: 'User1', target: '#general', message: '' };
    ruleManager.getRules.mockReturnValue([]);
    ruleManager.getRuleCooldowns.mockReturnValue(new Map());
  });

  it('should not respond if no rules match', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'non-matching text',
      response_text: 'should not be sent',
    }]);
    data.message = 'this is a test message';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).not.toHaveBeenCalled();
  });

  it('should handle simple text matching (as a regex)', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'hello bot',
      response_text: 'hello user',
    }]);
    data.message = 'well hello bot, how are you?';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledWith('hello user', 1);
  });

  it('should handle case-insensitive matching with trigger_flags', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'help',
      trigger_flags: 'i',
      response_text: 'help is on the way',
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
      response_text: 'pong, {{sender}}!',
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
      trigger_text: '^MyBot: status$',
      response_text: 'I am here',
    }]);
    data.message = 'MyBot: status';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledWith('I am here', 1);
  });

  it('should substitute capture groups ($1, $2) in response', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'order (\\w+) and (\\w+)',
      response_text: 'Ordering $1 and $2 for {{sender}}.',
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
      trigger_text: 'invalid[regex',
      response_text: 'should not trigger',
    }]);
    data.message = 'this is a message';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).not.toHaveBeenCalled();
    expect(PluginLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[AM] Invalid regex in rule:'),
      expect.any(String)
    );
  });

  it('should respect cooldown', () => {
    const rule = {
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'repeat',
      response_text: 'first!',
      cooldown_seconds: 10,
    };
    ruleManager.getRules.mockReturnValue([rule]);
    ruleManager.getRuleCooldowns.mockReturnValue(new Map());
    data.message = 'repeat';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
  });

  it('should ignore rules for a different server', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'AnotherServer', // Mismatched server
      listen_channel: '#general',
      trigger_text: 'ping',
      response_text: 'pong',
    }]);
    data.message = 'ping';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).not.toHaveBeenCalled();
  });

  it('should ignore rules for a different channel', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#other-channel', // Mismatched channel
      trigger_text: 'ping',
      response_text: 'pong',
    }]);
    data.message = 'ping';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).not.toHaveBeenCalled();
  });

  it('should send response to a specified response_channel', () => {
    network.channels.push({ name: '#responses', id: 2 });
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'question',
      response_text: 'answer',
      response_channel: '#responses',
    }]);
    data.message = 'question';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledWith('answer', 2); // Should be sent to channel ID 2
  });

  it('should log an error if response_channel does not exist', () => {
    ruleManager.getRules.mockReturnValue([{
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'question',
      response_text: 'answer',
      response_channel: '#non-existent-channel',
    }]);
    data.message = 'question';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).not.toHaveBeenCalled();
    expect(PluginLogger.error).toHaveBeenCalledWith(
      "[AM] Could not find channel '#non-existent-channel' to send response."
    );
  });

  it('should use the default cooldown of 5 seconds if not specified', () => {
    const rule = {
      server: 'TestServer',
      listen_channel: '#general',
      trigger_text: 'repeat',
      response_text: 'first!',
      // cooldown_seconds is omitted
    };
    ruleManager.getRules.mockReturnValue([rule]);
    const cooldowns = new Map();
    ruleManager.getRuleCooldowns.mockReturnValue(cooldowns);
    data.message = 'repeat';
    const handler = createPrivmsgHandler(client, network);

    // First call should work
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
    expect(cooldowns.has(rule)).toBe(true);

    // Second immediate call should be ignored
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
  });

  it('should only execute the first matching rule', () => {
    ruleManager.getRules.mockReturnValue([
      {
        server: 'TestServer',
        listen_channel: '#general',
        trigger_text: 'ping',
        response_text: 'pong1',
      },
      {
        server: 'TestServer',
        listen_channel: '#general',
        trigger_text: 'ping',
        response_text: 'pong2',
      },
    ]);
    data.message = 'ping all';
    const handler = createPrivmsgHandler(client, network);
    handler(data);
    expect(client.runAsUser).toHaveBeenCalledTimes(1);
    expect(client.runAsUser).toHaveBeenCalledWith('pong1', 1);
  });

  it('should not crash if trigger_text or response_text are missing', () => {
    ruleManager.getRules.mockReturnValue([
      { server: 'TestServer', listen_channel: '#general', response_text: 'a' }, // Missing trigger
      { server: 'TestServer', listen_channel: '#general', trigger_text: 'b' },   // Missing response
    ]);
    data.message = 'test';
    const handler = createPrivmsgHandler(client, network);
    expect(() => handler(data)).not.toThrow();
    expect(client.runAsUser).not.toHaveBeenCalled();
  });
});
