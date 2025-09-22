'use strict';

const fs = require('fs');
const path = require('path');
const { PluginLogger } = require('./logger');

const DEFAULT_CONFIG = { debug: false, enableFetch: false, fetchWhitelist: [] };

// Default state
let pluginConfig = { ...DEFAULT_CONFIG };
let pluginConfigPath = '';

/**
 * Initializes the plugin configuration module.
 * @param {string} configDir - The base directory for configuration files.
 */
function init(configDir) {
  pluginConfigPath = path.join(configDir, 'config.json');
  PluginLogger.info(`[AM] Using plugin config file: ${pluginConfigPath}`);
  ensurePluginConfigExists();
  loadPluginConfig();
}

/**
 * Loads the plugin's configuration from config.json.
 */
function loadPluginConfig() {
  PluginLogger.debug(`[AM] Attempting to load plugin config from: ${pluginConfigPath}`);
  try {
    const configFile = fs.readFileSync(pluginConfigPath, 'utf8');
    pluginConfig = JSON.parse(configFile);
    PluginLogger.info(`[AM] Plugin config successfully loaded.`);
  } catch (error) {
    let errMessage = `[AM] ERROR: Could not read plugin config from ${pluginConfigPath}. Using default values.`;
    if (error.code === 'ENOENT') {
      errMessage = `[AM] ERROR: Plugin config file not found at ${pluginConfigPath}. Using default values.`;
    } else if (error instanceof SyntaxError) {
      errMessage = `[AM] ERROR: Failed to parse ${pluginConfigPath}. Please check for JSON syntax errors. Using default values.`;
    }
    PluginLogger.error(errMessage, error.message);
    pluginConfig = { ...DEFAULT_CONFIG };
  }
}

/**
 * Saves the current in-memory plugin configuration to config.json.
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
 * Ensures the config.json file exists, creating it with defaults if not.
 */
function ensurePluginConfigExists() {
  if (!fs.existsSync(pluginConfigPath)) {
    PluginLogger.info(`[AM] Creating default plugin config file: ${pluginConfigPath}`);
    const defaultConfig = { ...DEFAULT_CONFIG };
    fs.writeFileSync(pluginConfigPath, JSON.stringify(defaultConfig, null, 2) + '\n');
  }
}

/**
 * Returns the current plugin configuration object.
 * @returns {object}
 */
function getPluginConfig() {
  return pluginConfig;
}

/**
 * Returns the path to the plugin's config file.
 * @returns {string}
 */
function getPluginConfigPath() {
    return pluginConfigPath;
}

module.exports = {
  init,
  loadPluginConfig,
  savePluginConfig,
  getPluginConfig,
  getPluginConfigPath,
};
