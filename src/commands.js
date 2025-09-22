'use strict';

const { PluginLogger } = require('./logger');
const pluginConfigManager = require('./plugin-config');
const ruleManager = require('./rule-manager');
const { validateRules } = require('./rule-validator');
const { createPrivmsgHandler, safeJsonStringify } = require('./message-handler');

// Key: network.uuid, Value: { handler: function, client: object }
const activeListeners = new Map();

/**
* Sends a detailed, multi-line help message to the user.
* @param {function(string)} tellUser - The function to use for sending messages to the user.
*/
function sendHelpMessage(tellUser) {
  tellUser("--- TheLounge Answering Machine Help ---");
  tellUser("Usage: /am <command> [args...]");
  tellUser(" "); // Spacer for readability
  tellUser("General commands:");
  tellUser("  start          - Activates the listener for the current network.");
  tellUser("  stop           - Deactivates the listener for the current network.");
  tellUser("  status         - Shows if the listener is active or inactive for this network.");
  tellUser("  reload         - Manually reloads rules from the rules.json file.");
  tellUser(" ");
  tellUser("Debugging commands:");
  tellUser("  debug status   - Shows if debug mode is currently ENABLED or DISABLED.");
  tellUser("  debug enable   - Enables verbose logging.");
  tellUser("  debug disable  - Disables verbose logging.");
}

/**
* Displays the active rules for a given network to the user.
* @param {object} network - The TheLounge network object.
* @param {function(string)} tellUser - The function to send messages to the user.
*/
function displayRulesForNetwork(network, tellUser) {
  const allRules = ruleManager.getRules();
  const networkRules = allRules.filter(rule => rule.server === network.name);

  if (networkRules.length === 0) {
    tellUser(`No active rules found for this server (${network.name}).`);
    return;
  }

  tellUser(`Active rules for this server (${network.name}):`);
  networkRules.forEach((rule, index) => {
    let responsePart = `-> "${rule.response_text}"`;
    if (rule.response_channel && rule.response_channel !== rule.listen_channel) {
      responsePart = `-> ${rule.response_channel}: "${rule.response_text}"`;
    }

    const options = [];
    if (typeof rule.cooldown_seconds === 'number') {
      options.push(`cooldown: ${rule.cooldown_seconds}s`);
    }
    if (typeof rule.delay_seconds === 'number' && rule.delay_seconds > 0) {
      options.push(`delay: ${rule.delay_seconds}s`);
    }
    const optionsPart = options.length > 0 ? ` (${options.join(', ')})` : '';

    tellUser(`${index + 1}. [${rule.listen_channel}] "${rule.trigger_text}" ${responsePart}${optionsPart}`);
  });
}

const answeringMachineCommand = {
  input(client, target, _command, args) {
    const [subcommand] = args;
    const network = target.network;
    
    const tellUser = (message) => {
      client.sendMessage(`[AM] ${message}`, target.chan);
    };
    
    switch ((subcommand || '').toLowerCase()) {
      case 'start': {
        if (activeListeners.has(network.uuid)) {
          tellUser(`Listener is already active for this network (${network.name}).`);
          return;
        }
        
        PluginLogger.debug(`[AM] Attaching listener for network: ${network.name} (UUID: ${network.uuid}). Full network object: ${safeJsonStringify(network)}`);
        const handler = createPrivmsgHandler(client, network);
        network.irc.on('privmsg', handler);
        activeListeners.set(network.uuid, { handler, client });
        
        tellUser(`Listener started for network: ${network.name}.`);
        PluginLogger.info(`[AM] Listener started for ${client.client.name} on ${network.name}.`);
        return;
      }
      
      case 'stop': {
        if (!activeListeners.has(network.uuid)) {
          tellUser(`Listener is not active for this network (${network.name}).`);
          return;
        }
        
        const { handler } = activeListeners.get(network.uuid);
        network.irc.removeListener('privmsg', handler);
        activeListeners.delete(network.uuid);
        
        tellUser(`Listener stopped for network: ${network.name}.`);
        PluginLogger.info(`[AM] Listener stopped for ${client.client.name} on ${network.name}.`);
        return;
      }
      
      case 'status': {
        if (activeListeners.has(network.uuid)) {
          tellUser(`Listener is ACTIVE for network: ${network.name}.`);
        } else {
          tellUser(`Listener is INACTIVE for network: ${network.name}.`);
        }
        return;
      }
      
      case 'reload': {
        ruleManager.loadRules(tellUser);
        return;
      }

      case 'rules': {
        if (!activeListeners.has(network.uuid)) {
          tellUser(`Listener is not active for this network (${network.name}). Use '/am start' to activate it.`);
          return;
        }
        displayRulesForNetwork(network, tellUser);
        break;
      }
      
      case 'debug': {
        const [debugSubCommand] = args.slice(1);
        const config = pluginConfigManager.getPluginConfig();
        switch ((debugSubCommand || '').toLowerCase()) {
          case 'enable': {
            if (config.debug) {
              tellUser('Debug mode is already ENABLED.');
            } else {
              config.debug = true;
              pluginConfigManager.savePluginConfig();
              tellUser('Debug mode has been ENABLED. The change has been saved.');
            }
            break;
          }
          case 'disable': {
            if (!config.debug) {
              tellUser('Debug mode is already DISABLED.');
            } else {
              config.debug = false;
              pluginConfigManager.savePluginConfig();
              tellUser('Debug mode has been DISABLED. The change has been saved.');
            }
            break;
          }
          case 'status': {
            tellUser(`Debug mode is currently ${config.debug ? 'ENABLED' : 'DISABLED'}.`);
            break;
          }
          default: {
            sendHelpMessage(tellUser);
            break;
          }
        }
        return;
      }
      
      case 'fetch': {
        const [fetchSubCommand] = args.slice(1);
        const config = pluginConfigManager.getPluginConfig();
        switch ((fetchSubCommand || '').toLowerCase()) {
          case 'enable': {
            if (config.enableFetch) {
              tellUser('Remote rule fetching is already ENABLED.');
            } else {
              config.enableFetch = true;
              pluginConfigManager.savePluginConfig();
              tellUser('Remote rule fetching has been ENABLED. The change has been saved.');
            }
            break;
          }
          case 'disable': {
            if (!config.enableFetch) {
              tellUser('Remote rule fetching is already DISABLED.');
            } else {
              config.enableFetch = false;
              pluginConfigManager.savePluginConfig();
              tellUser('Remote rule fetching has been DISABLED. The change has been saved.');
            }
            break;
          }
          case 'status': {
            tellUser(`Remote rule fetching is currently ${config.enableFetch ? 'ENABLED' : 'DISABLED'}.`);
            break;
          }
          default: {
            (async () => {
              const url = fetchSubCommand;
              if (!url) {
                tellUser('Usage: /am fetch <URL>');
                return;
              }
              // 1. Check if the feature is enabled
              if (!config.enableFetch) {
                tellUser('Error: Remote rule fetching is disabled. Use \'/am fetch enable\' to activate it.');
                return;
              }

              // 2. Check if the whitelist is configured
              if (!config.fetchWhitelist || config.fetchWhitelist.length === 0) {
                tellUser('Error: The domain whitelist is empty. Use \'/am whitelist add <domain>\' to add a trusted domain.');
                return;
              }

              // 3. Validate URL and check against whitelist
              let urlHostname;
              try {
                urlHostname = new URL(url).hostname;
              } catch (e) {
                tellUser(`Error: Invalid URL provided: "${url}"`);
                return;
              }

              if (!config.fetchWhitelist.includes(urlHostname)) {
                tellUser(`Error: The domain '${urlHostname}' is not in the whitelist.`);
                return;
              }

              tellUser(`Fetching rules from whitelisted domain: ${urlHostname}...`);
              
              try {
                const response = await fetch(url);
                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }
                const textBody = await response.text();

                let newRules;
                try {
                  newRules = JSON.parse(textBody);
                } catch (jsonError) {
                  tellUser(`Error: Failed to parse JSON from ${url}. Please check the file for syntax errors.`);
                  PluginLogger.error(`[AM] JSON parse error for ${url}:`, jsonError);
                  return;
                }

                const validationResult = validateRules(newRules);
                if (!validationResult.isValid) {
                  tellUser(`Error: The fetched rules are invalid. ${validationResult.error}`);
                  return;
                }

                tellUser('Validation successful. Merging rules...');
                
                const existingRules = ruleManager.getRules();
                const { mergedRules, added, overwritten } = ruleManager.mergeRules(existingRules, newRules);
                ruleManager.saveRules(mergedRules);

                tellUser(`Fetch complete: ${added} rules added, ${overwritten} rules overwritten.`);
                displayRulesForNetwork(network, tellUser);

              } catch (fetchError) {
                tellUser(`Error: Failed to fetch rules from ${url}.`);
                PluginLogger.error(`[AM] Fetch error for ${url}:`, fetchError);
              }
            })();
            break;
          }
        }
        return;
      }
      
      case 'whitelist': {
        const [whitelistSubCommand, domain] = args.slice(1);
        const config = pluginConfigManager.getPluginConfig();

        // Ensure whitelist exists to prevent errors from a manually corrupted config
        if (!Array.isArray(config.fetchWhitelist)) {
          config.fetchWhitelist = [];
        }

        switch ((whitelistSubCommand || 'list').toLowerCase()) {
          case 'add': {
            if (!domain) {
              tellUser('Usage: /am whitelist add <domain>');
              break;
            }
            const lowerDomain = domain.toLowerCase();
            if (config.fetchWhitelist.includes(lowerDomain)) {
              tellUser(`Domain '${lowerDomain}' is already in the whitelist.`);
            } else {
              config.fetchWhitelist.push(lowerDomain);
              pluginConfigManager.savePluginConfig();
              tellUser(`Domain '${lowerDomain}' has been ADDED to the whitelist. The change has been saved.`);
            }
            break;
          }
          case 'remove': {
            if (!domain) {
              tellUser('Usage: /am whitelist remove <domain>');
              break;
            }
            const lowerDomain = domain.toLowerCase();
            const index = config.fetchWhitelist.indexOf(lowerDomain);
            if (index === -1) {
              tellUser(`Domain '${lowerDomain}' is not in the whitelist.`);
            } else {
              config.fetchWhitelist.splice(index, 1);
              pluginConfigManager.savePluginConfig();
              tellUser(`Domain '${lowerDomain}' has been REMOVED from the whitelist. The change has been saved.`);
            }
            break;
          }
          case 'list':
          default: {
            if (config.fetchWhitelist.length === 0) {
              tellUser('The fetch domain whitelist is currently empty.');
            } else {
              tellUser('Current fetch domain whitelist:');
              config.fetchWhitelist.forEach(d => tellUser(`- ${d}`));
            }
            break;
          }
        }
        return;
      }

      default: {
        sendHelpMessage(tellUser);
        return;
      }
    }
  },
  allowDisconnected: false,
};

module.exports = {
  answeringMachineCommand,
  activeListeners, // Export for testing purposes
};
