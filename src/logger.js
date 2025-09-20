
'use strict';

/**
 * This module provides a logging wrapper around TheLounge's logger.
 * It is initialized with a config provider to allow for conditional debug logging.
 */

let Logger; // TheLounge's logger instance, set on init
let configProvider; // A module that provides getPluginConfig(), e.g., plugin-config.js

const PluginLogger = {
  /**
   * Initializes the logger.
   * @param {object} loggerInstance - TheLounge's logger instance.
   * @param {object} cfgProvider - A module with a getPluginConfig() method.
   */
  init: (loggerInstance, cfgProvider) => {
    Logger = loggerInstance;
    configProvider = cfgProvider;
  },

  // Errors are always critical and should be shown.
  error: (...args) => {
    if (Logger) Logger.error(...args);
  },

  // Info messages are for general plugin status and should always be shown.
  info: (...args) => {
    if (Logger) Logger.info(...args);
  },

  // Debug messages are verbose and only shown when debug mode is enabled in the config.
  debug: (...args) => {
    if (configProvider && configProvider.getPluginConfig().debug && Logger) {
      Logger.info(...args); // Debug messages are logged at the info level
    }
  },
};

module.exports = {
  PluginLogger,
};
