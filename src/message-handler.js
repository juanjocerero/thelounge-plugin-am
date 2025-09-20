'use strict';

const { PluginLogger } = require('./logger');
const ruleManager = require('./rule-manager');

/**
* A safe version of JSON.stringify that handles circular references.
*/
function safeJsonStringify(obj) {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular]';
      }
      cache.add(value);
    }
    return value;
  }, 2);
}

/**
* Creates the event handler for 'privmsg' events for a given network.
*/
function createPrivmsgHandler(client, network) {
  return (data) => {
    // Fetch fresh rules and cooldowns on every message to ensure they are not stale.
    const rules = ruleManager.getRules();
    const ruleCooldowns = ruleManager.getRuleCooldowns();

    PluginLogger.debug(`[AM] Received privmsg on network '${network.name}'. Data: ${safeJsonStringify(data)}`);
    
    for (const rule of rules) {
      const serverMatch = rule.server === network.name;
      const channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();
      const textMatch = data.message.includes(rule.trigger_text);
      
      if (serverMatch && channelMatch && textMatch) {
        PluginLogger.debug(`[AM] Rule triggered by '${data.nick}' in '${data.target}'. Matched rule: ${safeJsonStringify(rule)}`);
        
        const now = Date.now();
        const cooldownSeconds = rule.cooldown_seconds === undefined ? 5 : rule.cooldown_seconds;
        const cooldownMs = cooldownSeconds * 1000;
        const lastExecuted = ruleCooldowns.get(rule);
        
        if (lastExecuted && (now - lastExecuted < cooldownMs)) {
          PluginLogger.debug(`[AM] Rule for '${rule.trigger_text}' is on cooldown. Skipping.`);
          continue;
        }
        
        const responseTarget = rule.response_channel || data.target;
        const targetChan = network.channels.find(c => c.name.toLowerCase() === responseTarget.toLowerCase());
        
        if (!targetChan) {
          PluginLogger.error(`[AM] Could not find channel '${responseTarget}' to send response. Aborting this trigger.`);
          continue;
        }
        
        ruleCooldowns.set(rule, now);
        
        /**
         * The naming of this variable assumes the plugin is always sending messages to public channels.
         * Since /say is the default command, this works. However, if in the future we add 
         * the possibility of using other commands, like sending a private message, we should
         * rewrite this block of code to properly react to those.
         * Reference documentation: https://en.wikipedia.org/wiki/List_of_IRC_commands
         */
        const responseMessage = `${rule.response_message}`;
        
        PluginLogger.debug(`[AM] Sending response to '${responseTarget}' (ID: ${targetChan.id}): ${rule.response_message}`);
        client.runAsUser(responseMessage, targetChan.id);
        break;
      }
    }
  };
}

module.exports = {
  createPrivmsgHandler,
  safeJsonStringify,
};
