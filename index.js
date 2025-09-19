'use strict';

const fs = require('fs');
const path = require('path');

// Global state for the plugin
let Logger;
let rules = [];
let configFilePath = ''; // Path to the configuration file, determined at runtime
// Key: network.uuid, Value: { handler: function, client: object }
const activeListeners = new Map();

/**
* Loads rules from rules.json into the global `rules` variable.
* Can optionally send feedback to a user via an echo command.
*/
function loadRules(api, client, targetChanId) {
    Logger.info(`[Answering Machine] Attempting to load rules from: ${configFilePath}`);
    try {
        const rulesFile = fs.readFileSync(configFilePath, 'utf8');
        rules = JSON.parse(rulesFile);
        const message = `[Answering Machine] Rules successfully reloaded. Found ${rules.length} rules.`;
        Logger.info(message);
        if (api && client && targetChanId) {
            api.client.runAsUser(`/echo ${message}`, client.uuid, targetChanId);
        }
    } catch (error) {
        let message = `[Answering Machine] ERROR: Could not read rules from ${configFilePath}.`;
        if (error.code === 'ENOENT') {
            message = `[Answering Machine] ERROR: Configuration file not found at ${configFilePath}.`;
        } else if (error instanceof SyntaxError) {
            message = `[Answering Machine] ERROR: Failed to parse ${configFilePath}. Please check for JSON syntax errors.`;
        }
        Logger.error(message, error.message);
        if (api && client && targetChanId) {
            api.client.runAsUser(`/echo ${message}`, client.uuid, targetChanId);
        }
    }
}

/**
* Ensures the configuration directory and file exist.
* If they don't, it creates them with default values.
*/
function ensureConfigFileExists(configDir) {
    if (!fs.existsSync(configDir)) {
        Logger.info(`[Answering Machine] Creating configuration directory: ${configDir}`);
        fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(configFilePath)) {
        Logger.info(`[Answering Machine] Creating default configuration file: ${configFilePath}`);
        const defaultConfig = [
            {
                "server": "",
                "listen_channel": "",
                "trigger_text": "",
                "response_message": "",
                "response_channel": ""
            }
        ];
        fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2) + '\n');
    }
}

/**
* Creates the event handler for 'privmsg' events for a given network.
* This is where rules are checked and responses are sent.
*/
function createPrivmsgHandler(client, network, api) {
    return (data) => {
        // Aggressive logging for every message to help debug rules
        Logger.info(`[Answering Machine] Received privmsg on network '${network.name}'. Data: ${JSON.stringify(data)}`);

        // 1. Avoid loops by not responding to self
        if (data.nick === network.irc.user.nick) {
            return;
        }
        
        // 2. Iterate over rules
        for (const rule of rules) {
            const serverMatch = rule.server === network.name;
            const channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();
            const textMatch = data.message.includes(rule.trigger_text);
            
            if (serverMatch && channelMatch && textMatch) {
                Logger.info(`[Answering Machine] Rule triggered by '${data.nick}' in '${data.target}'. Matched rule: ${JSON.stringify(rule)}`);
                
                const targetChannel = rule.response_channel || data.target;
                const command = `PRIVMSG ${targetChannel} :${rule.response_message}`;
                
                Logger.info(`[Answering Machine] Sending response to '${targetChannel}': ${rule.response_message}`);
                api.client.runAsUser(command, client.uuid);
                break; // Stop processing more rules for this message
            }
        }
    };
}

const answeringMachineCommand = {
    input(client, target, command, args) {
        const [subcommand] = args;
        const network = target.network;
        const {api} = this; // Get the api object from the command context
        
        const tellUser = (message) => client.runAsUser(`/echo [Answering Machine] ${message}`, target.chan.id);
        
        switch ((subcommand || '').toLowerCase()) {
            case 'start': {
                if (activeListeners.has(network.uuid)) {
                    tellUser(`Listener is already active for this network (${network.name}).`);
                    return;
                }
                
                // Log the full network object to help admins find the correct server name for rules.json
                Logger.info(`[Answering Machine] Attaching listener for network: ${network.name} (UUID: ${network.uuid}). Full network object: ${JSON.stringify(network, null, 2)}`);
                const handler = createPrivmsgHandler(client, network, api);
                network.irc.on('privmsg', handler);
                activeListeners.set(network.uuid, { handler, client });
                
                tellUser(`Listener started for network: ${network.name}.`);
                Logger.info(`[Answering Machine] Listener started for ${client.client.name} on ${network.name}.`);
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
                Logger.info(`[Answering Machine] Listener stopped for ${client.client.name} on ${network.name}.`);
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
                loadRules(api, client, target.chan.id);
                return;
            }
            
            default: {
                tellUser("Usage: /answeringmachine <start|stop|status|reload>");
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

        Logger.info('[Answering Machine] Plugin loaded.');

        // Determine the configuration path
        const configDir = path.join(api.Config.getPersistentStorageDir(), 'answering-machine');
        configFilePath = path.join(configDir, 'rules.json');
        Logger.info(`[Answering Machine] Using configuration file: ${configFilePath}`);

        // Give the command object a reference to the API
        answeringMachineCommand.api = api;
        
        // Ensure the configuration directory and file exist
        ensureConfigFileExists(configDir);

        // Initial load of rules on startup
        loadRules(api);

        // Watch for changes in the configuration file
        Logger.info(`[Answering Machine] Watching for file changes on: ${configFilePath}`);
        fs.watchFile(configFilePath, { interval: 5007 }, (curr, prev) => {
            if (curr.mtimeMs === 0) {
                // File was likely deleted or is temporarily unavailable
                Logger.info('[Answering Machine] Watched file is not accessible or has been deleted.');
                return;
            }
            if (curr.mtime !== prev.mtime) {
                Logger.info(`[Answering Machine] Change detected in ${configFilePath}. Reloading rules...`);
                loadRules(api);
            }
        });

        // Register the command with TheLounge
        api.Commands.add('answeringmachine', answeringMachineCommand);
        Logger.info('[Answering Machine] Command /answeringmachine registered.');

        // Unwatch file on shutdown (optional but good practice)
        // The api.onShutdown hook is commented out because TheLounge does not support it directly.
        // api.onShutdown(() => {
        //     Logger.info('[Answering Machine] Shutting down, unwatching configuration file.');
        //     fs.unwatchFile(configFilePath);
        // });
    },
};
