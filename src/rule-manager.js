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
        "trigger_flags": "i",
        "response_text": "pong, {{sender}}!",
        "response_channel": "",
        "cooldown_seconds": 5,
        "delay_seconds": 0
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

/**
 * Merges a new set of rules into an existing set.
 * Rules are identified as unique by the combination of server, listen_channel, and trigger_text.
 * If a new rule has the same identifier as an existing one, it overwrites it. Otherwise, it's added.
 * @param {Array<object>} existingRules - The current array of rules.
 * @param {Array<object>} newRules - The new array of rules to merge.
 * @returns {{mergedRules: Array<object>, added: number, overwritten: number}}
 */
function mergeRules(existingRules, newRules) {
  let added = 0;
  let overwritten = 0;

  const createRuleKey = (rule) => `${rule.server}|${rule.listen_channel}|${rule.trigger_text}`;

  const rulesMap = new Map();
  for (const rule of existingRules) {
    rulesMap.set(createRuleKey(rule), rule);
  }

  for (const newRule of newRules) {
    const key = createRuleKey(newRule);
    if (rulesMap.has(key)) {
      overwritten++;
    } else {
      added++;
    }
    // Add or overwrite the rule in the map.
    rulesMap.set(key, newRule);
  }

  const mergedRules = Array.from(rulesMap.values());

  return { mergedRules, added, overwritten };
}

/**
 * Saves a given array of rules to the rules.json file.
 * @param {Array<object>} rulesToSave - The array of rules to write to disk.
 */
function saveRules(rulesToSave) {
  try {
    PluginLogger.debug(`[AM] Saving ${rulesToSave.length} rules to ${configFilePath}`);
    const jsonContent = JSON.stringify(rulesToSave, null, 2) + '\n';
    fs.writeFileSync(configFilePath, jsonContent, 'utf8');
    PluginLogger.info(`[AM] Successfully saved rules to ${configFilePath}.`);
  } catch (error) {
    PluginLogger.error(`[AM] CRITICAL: Failed to save rules to ${configFilePath}.`, error);
  }
}

module.exports = {
  init,
  loadRules,
  getRules,
  getRulesPath,
  getRuleCooldowns,
  mergeRules,
  saveRules,
};
