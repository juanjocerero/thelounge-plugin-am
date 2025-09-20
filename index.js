'use strict';

const fs = require('fs');
const path = require('path');
const { PluginLogger } = require('./src/logger');
const pluginConfigManager = require('./src/plugin-config');
const ruleManager = require('./src/rule-manager');
const { answeringMachineCommand } = require('./src/commands');

module.exports = {
  onServerStart(api) {
    // 1. Initialize logger, injecting the config manager as its provider.
    // This must be done first so other modules can log during their initialization.
    PluginLogger.init(api.Logger, pluginConfigManager);
    PluginLogger.info('[AM] Plugin loaded.');

    // 2. Determine config path and ensure it exists.
    const configDir = path.join(api.Config.getPersistentStorageDir(), 'config');
    if (!fs.existsSync(configDir)) {
      PluginLogger.info(`[AM] Creating configuration directory: ${configDir}`);
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 3. Initialize managers.
    pluginConfigManager.init(configDir);
    ruleManager.init(configDir);

    // 3. Watch for changes in configuration files.
    const rulesPath = ruleManager.getRulesPath();
    PluginLogger.info(`[AM] Watching for file changes on: ${rulesPath}`);
    fs.watchFile(rulesPath, { interval: 5007 }, (curr, prev) => {
      if (curr.mtimeMs === 0) {
        PluginLogger.info('[AM] Watched rules file is not accessible or has been deleted.');
        return;
      }
      if (curr.mtime !== prev.mtime) {
        PluginLogger.info(`[AM] Change detected in ${rulesPath}. Reloading rules...`);
        ruleManager.loadRules();
      }
    });
    
    const pluginConfigPath = pluginConfigManager.getPluginConfigPath();
    PluginLogger.info(`[AM] Watching for file changes on: ${pluginConfigPath}`);
    fs.watchFile(pluginConfigPath, { interval: 5007 }, (curr, prev) => {
      if (curr.mtimeMs === 0) {
        PluginLogger.info('[AM] Watched plugin config file is not accessible or has been deleted.');
        return;
      }
      if (curr.mtime !== prev.mtime) {
        PluginLogger.info(`[AM] Change detected in ${pluginConfigPath}. Reloading plugin configuration...`);
        pluginConfigManager.loadPluginConfig();
      }
    });

    // 4. Register the command with TheLounge.
    api.Commands.add('am', answeringMachineCommand);
    PluginLogger.info('[AM] Command /am registered.');
  },
};