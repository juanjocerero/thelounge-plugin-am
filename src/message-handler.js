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
    const rules = ruleManager.getRules();
    const ruleCooldowns = ruleManager.getRuleCooldowns();

    PluginLogger.debug(`[AM] Received privmsg on network '${network.name}'. Data: ${safeJsonStringify(data)}`);

    for (const rule of rules) {
      if (rule.server !== network.name || rule.listen_channel.toLowerCase() !== data.target.toLowerCase()) {
        continue;
      }

      // If a rule has no trigger, it's invalid and should be skipped.
      if (!rule.trigger_text) {
        continue;
      }

      // Always treat trigger_text as a regex. First, substitute {{me}} variable.
      const triggerText = (rule.trigger_text || '').replace(/{{me}}/g, network.nick);

      try {
        const regex = new RegExp(triggerText, rule.trigger_flags || '');
        const matchResult = data.message.match(regex);

        if (matchResult) {
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
            PluginLogger.error(`[AM] Could not find channel '${responseTarget}' to send response.`);
            continue;
          }

          ruleCooldowns.set(rule, now);

          // Prepare response logic
          const sendResponse = () => {
            // Generate response, substituting {{sender}} and capture groups ($1, $2, ...)
            let responseText = (rule.response_text || '').replace(/{{sender}}/g, data.nick);
            if (matchResult.length > 1) {
              responseText = responseText.replace(/\$(\d)/g, (match, groupNumber) => {
                const index = parseInt(groupNumber, 10);
                if (index > 0 && index < matchResult.length && matchResult[index]) {
                  return matchResult[index];
                }
                return match;
              });
            }

            PluginLogger.debug(`[AM] Sending response to '${responseTarget}' (ID: ${targetChan.id}): ${responseText}`);
            client.runAsUser(responseText, targetChan.id);
          };

          const delaySeconds = rule.delay_seconds || 0;

          if (delaySeconds > 0) {
            PluginLogger.debug(`[AM] Delaying response by ${delaySeconds} seconds.`);
            setTimeout(sendResponse, delaySeconds * 1000);
          } else {
            sendResponse();
          }

          break; // Stop processing further rules for this message
        }
      } catch (e) {
        PluginLogger.error(`[AM] Invalid regex in rule: ${safeJsonStringify(rule)}`, e.message);
        continue; // Skip this rule and check the next one
      }
    }
  };
}

module.exports = {
  createPrivmsgHandler,
  safeJsonStringify,
};
