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
    // Get a reference to the in-memory rules. This is a fast operation.
    // The rules are kept fresh by a file watcher in index.js that calls ruleManager.loadRules() on change.
    const rules = ruleManager.getRules();
    const ruleCooldowns = ruleManager.getRuleCooldowns();

    PluginLogger.debug(`[AM] Received privmsg on network '${network.name}'. Data: ${safeJsonStringify(data)}`);

    for (const rule of rules) {
      const serverMatch = rule.server === network.name;
      const channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();

      if (!serverMatch || !channelMatch) {
        continue;
      }

      let matchResult = null;

      // 1. Variable Substitution for the trigger
      const ownNick = network.nick;
      const triggerPattern = rule.trigger_pattern ? rule.trigger_pattern.replace(/{{me}}/g, ownNick) : null;
      const triggerText = rule.trigger_text ? rule.trigger_text.replace(/{{me}}/g, ownNick) : null;

      // 2. Matching Logic
      if (triggerPattern) {
        try {
          const regex = new RegExp(triggerPattern, rule.trigger_flags || '');
          matchResult = data.message.match(regex);
        } catch (e) {
          PluginLogger.error(`[AM] Invalid regex for rule: ${safeJsonStringify(rule)}`, e.message);
          continue; // Skip this rule
        }
      } else if (triggerText) {
        if (data.message.includes(triggerText)) {
          matchResult = [data.message]; // Create a dummy match result for consistency
        }
      }

      if (matchResult) {
        PluginLogger.debug(`[AM] Rule triggered by '${data.nick}' in '${data.target}'. Matched rule: ${safeJsonStringify(rule)}`);

        const now = Date.now();
        const cooldownSeconds = rule.cooldown_seconds === undefined ? 5 : rule.cooldown_seconds;
        const cooldownMs = cooldownSeconds * 1000;
        const lastExecuted = ruleCooldowns.get(rule);

        if (lastExecuted && (now - lastExecuted < cooldownMs)) {
          PluginLogger.debug(`[AM] Rule for '${rule.trigger_text || rule.trigger_pattern}' is on cooldown. Skipping.`);
          continue;
        }

        const responseTarget = rule.response_channel || data.target;
        const targetChan = network.channels.find(c => c.name.toLowerCase() === responseTarget.toLowerCase());

        if (!targetChan) {
          PluginLogger.error(`[AM] Could not find channel '${responseTarget}' to send response. Aborting this trigger.`);
          continue;
        }

        ruleCooldowns.set(rule, now);

        // 3. Response Generation
        let responseMessage = rule.response_message.replace(/{{sender}}/g, data.nick);

        // Substitute capture groups ($1, $2, ...) using a single-pass replacer function for robustness.
        if (matchResult.length > 1) {
          responseMessage = responseMessage.replace(/\$(\d)/g, (match, groupNumber) => {
            const index = parseInt(groupNumber, 10);
            // Ensure the captured group number is valid and exists in the matchResult array.
            if (index > 0 && index < matchResult.length && matchResult[index]) {
              return matchResult[index];
            }
            // If the placeholder is invalid (e.g., $99), return the original placeholder text.
            return match;
          });
        }

        PluginLogger.debug(`[AM] Sending response to '${responseTarget}' (ID: ${targetChan.id}): ${responseMessage}`);
        client.runAsUser(responseMessage, targetChan.id);
        break; // Stop processing further rules for this message
      }
    }
  };
}

module.exports = {
  createPrivmsgHandler,
  safeJsonStringify,
};
