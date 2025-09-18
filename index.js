'use strict';

const fs = require('fs');
const path = require('path');

function attachListener(client, network, rules, api) {
    console.log(`[answering-machine] Attaching listener to network '${network.name}' for user '${client.name}'.`);

    network.irc.on('privmsg', (data) => {
        // 1. Evitar bucles: no responder a uno mismo
        if (data.nick === network.irc.user.nick) {
            return;
        }

        // 2. Iterar sobre las reglas
        for (const rule of rules) {
            const serverMatch = rule.server === network.name;
            const channelMatch = rule.listen_channel.toLowerCase() === data.target.toLowerCase();
            const textMatch = data.message.includes(rule.trigger_text);

            if (serverMatch && channelMatch && textMatch) {
                console.log(`[answering-machine] Rule triggered! By user '${data.nick}' on '${data.target}'.`);

                const targetChannel = rule.response_channel || data.target;
                const command = `PRIVMSG ${targetChannel} :${rule.response_message}`;

                console.log(`[answering-machine] Sending response to '${targetChannel}': ${rule.response_message}`);

                api.client.runAsUser(command, client.uuid);
                break; // Salimos del bucle para no procesar más reglas en este mensaje
            }
        }
    });
}

module.exports = {
    onServerStart: function(api) {
        console.info('[answering-machine] Plugin loaded. Running onServerStart.');

        let rules = [];
        try {
            const rulesPath = path.join(__dirname, 'rules.json');
            console.info(`[answering-machine] Loading rules from: ${rulesPath}`);
            const rulesFile = fs.readFileSync(rulesPath, 'utf8');
            rules = JSON.parse(rulesFile);
            console.info(`[answering-machine] Rules file loaded successfully. Found ${rules.length} rules.`);
        } catch (error) {
            console.error(`[answering-machine] Error reading or parsing rules.json. The plugin won't work.`, error);
            return; // Detenemos la ejecución si no hay reglas
        }

        const clientManager = api.clientManager;
        const clients = clientManager.clients;

        console.log(`[answering-machine] Found ${clients.length} connected clients. Attaching listeners...`);

        for (const client of clients) {
            console.log(`[answering-machine] Processing existing client: '${client.name}'`);
            for (const network of client.networks) {
                attachListener(client, network, rules, api);
            }
        }

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
