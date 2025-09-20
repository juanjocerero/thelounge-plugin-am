'use strict';

const fs = require('fs');
const path = require('path');
const { PluginLogger } = require('./logger');

// Default state
let rules = [];
let configFilePath = '';
const ruleCooldowns = new Map(); // Key: rule object, Value: last execution timestamp

function init(configDir) {
  configFilePath = path.join(configDir, 'rules.json');
  PluginLogger.info(`[AM] Using rules file: ${configFilePath}`);
  ensureConfigFileExists();
  loadRules();
}

/**
 * Ensures the rules.json file exists, creating it with defaults if not.
 */
function ensureConfigFileExists() {
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
 * Returns the current array of rules.
 * @returns {Array<object>}
 */
function getRules() {
  return rules;
}

/**
 * Returns the path to the rules.json file.
 * @returns {string}
 */
function getRulesPath() {
  return configFilePath;
}

/**
 * Returns the map of rule cooldowns.
 * @returns {Map<object, number>}
 */
function getRuleCooldowns() {
    return ruleCooldowns;
}

module.exports = {
  init,
  loadRules,
  getRules,
  getRulesPath,
  getRuleCooldowns,
};
