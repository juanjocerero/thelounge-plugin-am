'use strict';

const fs = require('fs');
const path = require('path');

// Global state for the plugin
let rules = [];
// Key: network.uuid, Value: { handler: function, client: object }
const activeListeners = new Map();

/**
 * Loads rules from rules.json into the global `rules` variable.
 * Can optionally send feedback to a user via an echo command.
 */
function loadRules(api, client, targetChanId) {
    try {
        const rulesPath = path.join(__dirname, 'rules.json');
        const rulesFile = fs.readFileSync(rulesPath, 'utf8');
        rules = JSON.parse(rulesFile);
        const message = `[Answering Machine] Rules successfully loaded. ${rules.length} rules found.`;
        console.info(message);
        if (api && client && targetChanId) {
            api.client.runAsUser(`/echo ${message}`, client.uuid, targetChanId);
        }
    } catch (error) {
        const message = `[Answering Machine] ERROR: Could not read or parse rules.json.`;
        console.error(message, error);
        if (api && client && targetChanId) {
             api.client.runAsUser(`/echo ${message}`, client.uuid, targetChanId);
        }
    }
}

/**
 * Creates the event handler for 'privmsg' events for a given network.
 * This is where rules are checked and responses are sent.
 */
function createPrivmsgHandler(client, network, api) {
    return (data) => {
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
                console.log(`[Answering Machine] Rule triggered by '${data.nick}' in '${data.target}'.`);

                const targetChannel = rule.response_channel || data.target;
                const command = `PRIVMSG ${targetChannel} :${rule.response_message}`;

                console.log(`[Answering Machine] Sending response to '${targetChannel}': ${rule.response_message}`);
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

                const handler = createPrivmsgHandler(client, network, api);
                network.irc.on('privmsg', handler);
                activeListeners.set(network.uuid, { handler, client });

                tellUser(`Listener started for network: ${network.name}.`);
                console.log(`[Answering Machine] Listener started for ${client.name} on ${network.name}.`);
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
                console.log(`[Answering Machine] Listener stopped for ${client.name} on ${network.name}.`);
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

        clientManager.on('network:new', (data) => {
            console.log(`[answering-machine] Attaching to new network for user '${data.client.name}'.`);
            attachListener(data.client, data.network, rules, api);
        });

        clientManager.on('client:new', (client) => {
            console.log(`[answering-machine] New client detected: '${client.name}'. Attaching listeners to its networks.`);
            for (const network of client.networks) {
                attachListener(client, network, rules, api);
            }
        });
    }
};
