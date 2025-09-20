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
 * Loads rules from rules.json.
 * @param {function(string)} tellUser - Optional callback to send feedback to a user.
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
 * Ensures the rules.json file exists, creating it with defaults if not.
 */
function ensureConfigFileExists() {
  if (!fs.existsSync(configFilePath)) {
    PluginLogger.info(`[AM] Creating default rules file: ${configFilePath}`);
    const defaultConfig = [
      {
        "server": "Libera.Chat",
        "listen_channel": "#lounge-testing",
        "trigger_text": "ping",
        "response_message": "pong, {{sender}}!",
        "response_channel": "",
        "cooldown_seconds": 5
      },
      {
        "//_comment": "This is an example of an advanced rule. Remove the //_comment key to enable it.",
        "server": "MyServer",
        "listen_channel": "#bots",
        "trigger_pattern": "^tell me about (.+)",
        "trigger_flags": "i",
        "response_message": "I think $1 is very interesting, {{sender}}.",
        "cooldown_seconds": 10
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
