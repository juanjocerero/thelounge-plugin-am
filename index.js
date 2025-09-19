'use strict';

const fs = require('fs');
const path = require('path');

// Global state for the plugin
let Logger;
let rules = [];
 // Path to the configuration file, determined at runtime
let configFilePath = '';
// Path to the plugin's own configuration file
let pluginConfigPath = ''; 
// Holds the loaded configuration, with a default
let pluginConfig = { debug: false }; 
// Key: rule object, Value: last execution timestamp
const ruleCooldowns = new Map(); 
// Key: network.uuid, Value: { handler: function, client: object }
const activeListeners = new Map();

// Wrapper for TheLounge's logger to control debug message visibility
const PluginLogger = {
  // Errors are always critical and should be shown.
  error: (...args) => {
    if (Logger) Logger.error(...args);
  },
  // Info messages are for general plugin status and should always be shown.
  info: (...args) => {
    if (Logger) Logger.info(...args);
  },
  // Debug messages are verbose and should only be shown when debug mode is enabled.
  debug: (...args) => {
    if (pluginConfig.debug && Logger) {
      Logger.info(...args); // Debug messages are logged at the info level
    }
  },
};

/**
* A safe version of JSON.stringify that handles circular references,
* preventing crashes when logging complex objects.
*/
function safeJsonStringify(obj) {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        // Circular reference found, discard key
        return '[Circular]';
      }
      // Store value in our collection
      cache.add(value);
    }
    return value;
  }, 2);
}


/**
* Loads rules from rules.json into the global `rules` variable.
* Can optionally send feedback to a user.
*/
function loadRules(tellUser) {
  PluginLogger.debug(`[AM] Attempting to load rules from: ${configFilePath}`);
  try {
    const rulesFile = fs.readFileSync(configFilePath, 'utf8');
    rules = JSON.parse(rulesFile);
    const message = `Rules successfully reloaded. Found ${rules.length} rules.`;
    PluginLogger.info(`[AM] ${message}`);
    // Reset all cooldowns whenever rules are reloaded
    ruleCooldowns.clear();
    PluginLogger.debug('[AM] All rule cooldowns have been reset.');
    if (tellUser) {
      tellUser(message);
    }
  } catch (error) {
    let errMessage = `ERROR: Could not read rules from ${configFilePath}.`;
    if (error.code === 'ENOENT') {
      errMessage = `ERROR: Configuration file not found at ${configFilePath}.`;
    } else if (error instanceof SyntaxError) {
      errMessage = `ERROR: Failed to parse ${configFilePath}. Please check for JSON syntax errors.`;
    }
    PluginLogger.error(`[AM] ${errMessage}`, error.message);
    if (tellUser) {
      tellUser(errMessage);
    }
  }
}

/**
* Loads the plugin's configuration from config.json into the global `pluginConfig` variable.
*/
function loadPluginConfig() {
  PluginLogger.debug(`[AM] Attempting to load plugin config from: ${pluginConfigPath}`);
  try {
    const configFile = fs.readFileSync(pluginConfigPath, 'utf8');
    pluginConfig = JSON.parse(configFile);
    PluginLogger.info(`[AM] Plugin config successfully loaded. Debug mode is ${pluginConfig.debug ? 'ENABLED' : 'DISABLED'}.`);
  } catch (error) {
    let errMessage = `[AM] ERROR: Could not read plugin config from ${pluginConfigPath}. Using default values.`;
    if (error.code === 'ENOENT') {
      errMessage = `[AM] ERROR: Plugin config file not found at ${pluginConfigPath}. Using default values.`;
    } else if (error instanceof SyntaxError) {
      errMessage = `[AM] ERROR: Failed to parse ${pluginConfigPath}. Please check for JSON syntax errors. Using default values.`;
    }
    PluginLogger.error(errMessage, error.message);
  }
}

/**
* Saves the current in-memory plugin configuration (`pluginConfig`) to the `config.json` file.
* This function is critical for persisting changes made at runtime, like enabling/disabling debug mode.
*/
function savePluginConfig() {
  PluginLogger.debug(`[AM] Attempting to save plugin config to: ${pluginConfigPath}`);
  try {
    fs.writeFileSync(pluginConfigPath, JSON.stringify(pluginConfig, null, 2) + '\n');
    PluginLogger.debug(`[AM] Plugin config successfully saved to ${pluginConfigPath}.`);
  } catch (error) {
    PluginLogger.error(`[AM] CRITICAL ERROR: Failed to save plugin config to ${pluginConfigPath}. Changes may not be persisted.`, error.message);
  }
}

/**
* Ensures the configuration directory and file exist.
* If they don't, it creates them with default values.
*/
function ensureConfigFileExists(configDir) {
  if (!fs.existsSync(configDir)) {
    PluginLogger.info(`[AM] Creating configuration directory: ${configDir}`);
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  if (!fs.existsSync(configFilePath)) {
    PluginLogger.info(`[AM] Creating default rules file: ${configFilePath}`);
    const defaultConfig = [
      {
        "server": "freenode",
        "listen_channel": "#my-channel",
        "trigger_text": "ping",
        "response_message": "pong",
        "response_channel": "",
        "cooldown_seconds": 5
      }
    ];
    fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2) + '\n');
  }
}

/**
* Ensures the plugin's own configuration file (`config.json`) exists.
* If it doesn't, it creates one with default values.
*/
function ensurePluginConfigExists() {
  if (!fs.existsSync(pluginConfigPath)) {
    PluginLogger.info(`[AM] Creating default plugin config file: ${pluginConfigPath}`);
    const defaultConfig = {
      "debug": false
    };
    fs.writeFileSync(pluginConfigPath, JSON.stringify(defaultConfig, null, 2) + '\n');
  }
}

/**
* Creates the event handler for 'privmsg' events for a given network.
* This is where rules are checked and responses are sent.
*/
function createPrivmsgHandler(client, network) {
  return (data) => {
    // Aggressive logging for every message to help debug rules
    PluginLogger.debug(`[AM] Received privmsg on network '${network.name}'. Data: ${safeJsonStringify(data)}`);
    
    // Iterate over rules
    for (const rule of rules) {
      // 1. Check if the rule is for the correct server
      const serverMatch = rule.server === network.name;
      
      // 2. Check if the message is in the correct channel (or is a PM)
      let channelMatch = false;
      if (rule.listen_channel.toLowerCase() === 'privatemessages') {
        // If rule is for PMs, check if the message target is the user's own nick
        channelMatch = data.target.toLowerCase() === network.irc.user.nick.toLowerCase();
      } else {
        // Otherwise, check for a standard channel name match
        channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();
      }
      
      // 3. Check if the trigger text is in the message
      const textMatch = data.message.includes(rule.trigger_text);
      
      if (serverMatch && channelMatch && textMatch) {
        PluginLogger.debug(`[AM] Rule triggered by '${data.nick}' in '${data.target}'. Matched rule: ${safeJsonStringify(rule)}`);
        
        // 4. Cooldown check
        const now = Date.now();
        const cooldownSeconds = rule.cooldown_seconds === undefined ? 5 : rule.cooldown_seconds;
        const cooldownMs = cooldownSeconds * 1000;
        const lastExecuted = ruleCooldowns.get(rule);
        
        if (lastExecuted && (now - lastExecuted < cooldownMs)) {
          PluginLogger.debug(`[AM] Rule for '${rule.trigger_text}' is on cooldown. Skipping.`);
          continue; // Skip this rule and check the next one
        }
        
        // Determine the target for the response
        let responseTarget = rule.response_channel || data.target;
        if (responseTarget.toLowerCase() === 'nickofsender') {
          responseTarget = data.nick;
        }
        
        // Find the channel object to get its ID for the `runAsUser` command.
        // Case-insensitive comparison for channel names.
        const targetChan = network.channels.find(c => c.name.toLowerCase() === responseTarget.toLowerCase());
        
        if (!targetChan) {
          PluginLogger.error(`[AM] Could not find channel '${responseTarget}' to send response. Aborting this trigger.`);
          continue; // Use continue instead of break to not block other rules
        }
        
        // Set the cooldown timestamp *before* sending the message
        ruleCooldowns.set(rule, now);
        
        const command = `${rule.response_message}`;
        
        PluginLogger.debug(`[AM] Sending response to '${responseTarget}' (ID: ${targetChan.id}): ${rule.response_message}`);
        client.runAsUser(command, targetChan.id);
        break; // Stop processing more rules for this message
      }
    }
  };
}

/**
* Sends a detailed, multi-line help message to the user, explaining each command.
* @param {function(string)} tellUser - The function to use for sending messages to the user.
*/
function sendHelpMessage(tellUser) {
  tellUser("--- TheLounge Answering Machine Help ---");
  tellUser("Usage: /am <command> [args...]");
  tellUser(" "); // Spacer for readability
  tellUser("General Commands:");
  tellUser("  start          - Activates the listener for the current network.");
  tellUser("  stop           - Deactivates the listener for the current network.");
  tellUser("  status         - Shows if the listener is active or inactive for this network.");
  tellUser("  reload         - Manually reloads rules from the rules.json file.");
  tellUser(" ");
  tellUser("Debugging Commands:");
  tellUser("  debug status   - Shows if debug mode is currently ENABLED or DISABLED.");
  tellUser("  debug enable   - Enables verbose logging. Change is saved to config.json.");
  tellUser("  debug disable  - Disables verbose logging. Change is saved to config.json.");
}

const answeringMachineCommand = {
  input(client, target, command, args) {
    const [subcommand] = args;
    const network = target.network;
    
    // A helper function to send feedback to the user in the current window.
    // It uses the 'client' and 'target' objects passed into this 'input' function.
    const tellUser = (message) => {
      client.sendMessage(`[AM] ${message}`, target.chan);
    };
    
    switch ((subcommand || '').toLowerCase()) {
      case 'start': {
        if (activeListeners.has(network.uuid)) {
          tellUser(`Listener is already active for this network (${network.name}).`);
          return;
        }
        
        // Log the full network object to help admins find the correct server name for rules.json
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
        loadRules(tellUser);
        return;
      }
      
      case 'debug': {
        const [debugSubCommand] = args.slice(1);
        switch ((debugSubCommand || '').toLowerCase()) {
          case 'enable': {
            if (pluginConfig.debug) {
              tellUser('Debug mode is already ENABLED.');
            } else {
              pluginConfig.debug = true;
              savePluginConfig();
              tellUser('Debug mode has been ENABLED. The change has been saved.');
            }
            break;
          }
          case 'disable': {
            if (!pluginConfig.debug) {
              tellUser('Debug mode is already DISABLED.');
            } else {
              pluginConfig.debug = false;
              savePluginConfig();
              tellUser('Debug mode has been DISABLED. The change has been saved.');
            }
            break;
          }
          case 'status': {
            tellUser(`Debug mode is currently ${pluginConfig.debug ? 'ENABLED' : 'DISABLED'}.`);
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
  onServerStart(api) {
    // Make the logger available globally
    Logger = api.Logger;
    
    PluginLogger.info('[AM] Plugin loaded.');
    
    // Determine the configuration paths
    const configDir = path.join(api.Config.getPersistentStorageDir(), 'config');
    configFilePath = path.join(configDir, 'rules.json');
    pluginConfigPath = path.join(configDir, 'config.json'); // Path for plugin's own config
    PluginLogger.info(`[AM] Using rules file: ${configFilePath}`);
    PluginLogger.info(`[AM] Using plugin config file: ${pluginConfigPath}`);
    
    // Ensure the configuration directory and files exist
    ensureConfigFileExists(configDir);
    ensurePluginConfigExists();
    
    // Initial load of rules and config on startup
    loadPluginConfig();
    loadRules();
    
    // Watch for changes in the configuration files
    PluginLogger.info(`[AM] Watching for file changes on: ${configFilePath}`);
    fs.watchFile(configFilePath, { interval: 5007 }, (curr, prev) => {
      if (curr.mtimeMs === 0) {
        // File was likely deleted or is temporarily unavailable
        PluginLogger.info('[AM] Watched rules file is not accessible or has been deleted.');
        return;
      }
      if (curr.mtime !== prev.mtime) {
        PluginLogger.info(`[AM] Change detected in ${configFilePath}. Reloading rules...`);
        // No user feedback on automatic reload
        loadRules();
      }
    });
    
    PluginLogger.info(`[AM] Watching for file changes on: ${pluginConfigPath}`);
    fs.watchFile(pluginConfigPath, { interval: 5007 }, (curr, prev) => {
      if (curr.mtimeMs === 0) {
        PluginLogger.info('[AM] Watched plugin config file is not accessible or has been deleted.');
        return;
      }
      if (curr.mtime !== prev.mtime) {
        PluginLogger.info(`[AM] Change detected in ${pluginConfigPath}. Reloading plugin configuration...`);
        loadPluginConfig();
      }
    });
    
    // Register the command with TheLounge
    api.Commands.add('am', answeringMachineCommand);
    PluginLogger.info('[AM] Command /am registered.');
  },
};
