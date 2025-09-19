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
    Logger.info(`[Answering Machine] Attempting to load rules from: ${configFilePath}`);
    try {
        const rulesFile = fs.readFileSync(configFilePath, 'utf8');
        rules = JSON.parse(rulesFile);
        const message = `Rules successfully reloaded. Found ${rules.length} rules.`;
        Logger.info(`[Answering Machine] ${message}`);
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
        Logger.error(`[Answering Machine] ${errMessage}`, error.message);
        if (tellUser) {
            tellUser(errMessage);
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
                "server": "freenode",
                "listen_channel": "#my-channel",
                "trigger_text": "ping",
                "response_message": "pong",
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
function createPrivmsgHandler(client, network) {
    return (data) => {
        // Aggressive logging for every message to help debug rules
        Logger.info(`[Answering Machine] Received privmsg on network '${network.name}'. Data: ${safeJsonStringify(data)}`);

        // This check incorrectly blocked all messages from the user.
        // A better loop avoidance mechanism is needed, but for now, we disable it to allow rules to fire.
        // if (data.nick === network.irc.user.nick) {
        //     return;
        // }

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
                Logger.info(`[Answering Machine] Rule triggered by '${data.nick}' in '${data.target}'. Matched rule: ${safeJsonStringify(rule)}`);

                // Determine the target for the response
                let responseTarget = rule.response_channel || data.target;
                if (responseTarget.toLowerCase() === 'nickofsender') {
                    responseTarget = data.nick;
                }

                // Find the channel object to get its ID for the `runAsUser` command.
                // Case-insensitive comparison for channel names.
                const targetChan = network.channels.find(c => c.name.toLowerCase() === responseTarget.toLowerCase());

                if (!targetChan) {
                    Logger.error(`[Answering Machine] Could not find channel '${responseTarget}' to send response. Aborting this trigger.`);
                    break; // Stop processing rules for this message if the target channel isn't found.
                }

                const command = `PRIVMSG ${responseTarget} :${rule.response_message}`;

                Logger.info(`[Answering Machine] Sending response to '${responseTarget}' (ID: ${targetChan.id}): ${rule.response_message}`);
                client.runAsUser(command, targetChan.id);
                break; // Stop processing more rules for this message
            }
        }
    };
}

const answeringMachineCommand = {
    input(client, target, command, args) {
        const [subcommand] = args;
        const network = target.network;

        // A helper function to send feedback to the user in the current window.
        // It uses the 'client' and 'target' objects passed into this 'input' function.
        const tellUser = (message) => {
            client.sendMessage(`[Answering Machine] ${message}`, target.chan);
        };

        switch ((subcommand || '').toLowerCase()) {
            case 'start': {
                if (activeListeners.has(network.uuid)) {
                    tellUser(`Listener is already active for this network (${network.name}).`);
                    return;
                }

                // Log the full network object to help admins find the correct server name for rules.json
                Logger.info(`[Answering Machine] Attaching listener for network: ${network.name} (UUID: ${network.uuid}). Full network object: ${safeJsonStringify(network)}`);
                const handler = createPrivmsgHandler(client, network);
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
                loadRules(tellUser);
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

        // Ensure the configuration directory and file exist
        ensureConfigFileExists(configDir);

        // Initial load of rules on startup (no user feedback on initial load)
        loadRules();

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
                // No user feedback on automatic reload
                loadRules();
            }
        });

        // Register the command with TheLounge
        api.Commands.add('answeringmachine', answeringMachineCommand);
        Logger.info('[Answering Machine] Command /answeringmachine registered.');
    },
};
