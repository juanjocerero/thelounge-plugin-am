'use strict';

const { PluginLogger } = require('./logger');
const pluginConfigManager = require('./plugin-config');
const ruleManager = require('./rule-manager');
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
};
