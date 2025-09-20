# TheLounge Answering Machine [AM] Plugin

[![NPM version](https://img.shields.io/npm/v/thelounge-plugin-am.svg)](https://www.npmjs.com/package/thelounge-plugin-am)

A plugin for TheLounge that provides "answering machine" (AM) functionality, automatically replying to messages based on a configurable set of rules.

## Installation

Install the plugin via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-am
```

After installation, make sure to restart TheLounge for the plugin to be loaded.

## Usage

The plugin provides the `/am` command to control its behavior on a per-network basis.

### Commands

*   `/am start`
    *   Starts the listener for the current IRC network. It will begin monitoring messages and responding according to the rules in `rules.json`. You **must** specify the exact name you defined in TheLounge for the Network: for example, not `irc.libera.chat` but `Libera.Chat` if you named it that way.

*   `/am stop`
    *   Stops the listener for the current IRC network.

*   `/am status`
    *   Shows whether the listener is currently `ACTIVE` or `INACTIVE` for the current network.

*   `/am reload`
    *   Manually reloads the rules from the `rules.json` file. Note: This is generally not needed, as the plugin reloads rules automatically when the file is changed.

*   `/am debug status`
    *   Shows whether debug mode is currently `ENABLED` or `DISABLED`.

*   `/am debug enable`
    *   Enables verbose logging and saves the setting.

*   `/am debug disable`
    *   Disables verbose logging and saves the setting.

## Configuration

Configuration is handled via a `rules.json` file that is automatically created by the plugin. If one exists already, it is respected.

### `rules.json` structure

The file should contain an array of rule objects. Each rule object defines a trigger and a corresponding response.

```json
[
  {
    "server": "freenode",
    "listen_channel": "#my-channel",
    "trigger_text": "ping",
    "response_message": "pong",
    "response_channel": "",
    "cooldown_seconds": 5
  }
]
```

### Rule properties

*   `server` (string): The name of the network/server where this rule applies (e.g., "freenode", "MyCustomServer").
*   `listen_channel` (string): The channel name (e.g., `#my-project`) where the plugin should listen for triggers.
*   `trigger_text` (string): The text that must be included in a message to trigger the response.
*   `response_message` (string): The message that the plugin will send in response.
*   `response_channel` (string, optional): The channel or user to which the response should be sent. If not provided, the response is sent to the `listen_channel`.
*   `cooldown_seconds` (number, optional): The number of seconds the rule must wait before it can be triggered again. This is useful to prevent flooding. If not specified, it defaults to **5 seconds**.

### File location

The plugin manages its configuration in a file located inside TheLounge's persistent storage directory, which is typically:

*   `/etc/thelounge/packages/thelounge-plugin-answering-machine/config/rules.json` for system-wide installations (e.g., via Debian/Ubuntu packages).
*   `/var/opt/thelounge/packages/thelounge-plugin-answering-machine/config/rules.json` for the official Docker image.

If you look at the logs for the service created by TheLounge you can see the exact location of the file, which the plugin logs for you.

The plugin will create a default empty `rules.json` file on its first run if they don't already exist.

### Deploying inside a Docker container
If you want to use the plugin inside a Docker image, here is a suggested `docker-compose.yml`: 
```
services:
  thelounge:
    image: ghcr.io/thelounge/thelounge:latest
    container_name: thelounge
    ports:
      - "9000:9000"
    restart: unless-stopped
    volumes:
      - thelounge:/var/opt/thelounge
      - ./config.js:/var/opt/thelounge/config.js
      - ./post-install.sh:/var/opt/thelounge/post-install.sh
      - ./rules.json:/var/opt/thelounge/packages/thelounge-plugin-am/config/rules.json
volumes:
  thelounge:
```
This way, you can provide a custom `rules.json` when instancing the container. 
You can use `post-install.sh` to install the plugin:
```
#!/bin/sh
export THELOUNGE_HOME=/var/opt/thelounge

echo "--- Running post-install.sh ---"
echo "Installing thelounge-plugin-am..."

thelounge install thelounge-plugin-am

echo "--- Finished running post-install.sh ---"
```

Just make sure to `chmod +x` your `post-install.sh` before starting the container.
Do note that you need to provide a `config.json` file for your container and create a user for it.
This file is different from the `config/config.json` file that controls parameters for the plugin itself, not TheLounge.
(*Yes, the naming could be more clear*)

### Automatic reloading

**The plugin automatically watches for changes to the `rules.json` file.** When you save your modifications to `rules.json`, the plugin will instantly reload the rules in the background. You will see a confirmation message in TheLounge's server logs.

This means you no longer need to manually run `/am reload` after changing the rules, although the command is still available for convenience.

## Code Structure

For those interested in contributing or understanding the plugin's internals, the codebase is organized into several modules within the `src/` directory. This modular approach separates concerns, making the code easier to maintain and extend.

*   `index.js`: The main entry point of the plugin. It is responsible for initializing all other modules, wiring them together, and registering commands and file watchers with TheLounge API. It acts as the central orchestrator.

*   `src/logger.js`: A wrapper around TheLounge's native logger. It provides standard `info` and `error` methods, along with a `debug` method that only prints messages when debug mode is enabled in the plugin's configuration.

*   `src/plugin-config.js`: Manages the plugin's internal configuration file (`config.json`). This file stores settings like the debug mode status. This module handles loading, saving, and providing access to these settings.

*   `src/rule-manager.js`: Responsible for everything related to the user-defined rules (`rules.json`). It handles loading, parsing, and providing access to the rules. In the future, it will also contain the logic for adding, removing, and updating rules via commands.

*   `src/message-handler.js`: Contains the core logic of the plugin. It defines the `privmsg` event handler that checks incoming messages against the rules from the `rule-manager` and decides when to trigger a response. It also manages rule cooldowns.

*   `src/commands.js`: Defines the `/am` command and all its subcommands (`start`, `stop`, `reload`, `debug`, etc.). It acts as the user-facing interface, calling functions from other modules to execute the requested actions.

## Debugging

The plugin includes a debug mode that provides verbose logging, which can be useful for troubleshooting rules or reporting issues. You can control this mode in real-time using commands.

The recommended way to manage debug mode is with the `/am debug` commands:

*   `/am debug enable`: Activates verbose logging.
*   `/am debug disable`: Deactivates verbose logging.
*   `/am debug status`: Shows whether debug mode is currently active.

Changes are automatically saved to `config.json`, so your choice will be remembered after a restart.

### Manual Configuration

As an alternative, you can also control this feature by manually editing the `config.json` file (located in the same directory as `rules.json`). Set the `debug` property to `true` or `false`:

```json
{
  "debug": true
}
```
The plugin will automatically detect this change as well.

## License

This plugin is licensed under the [MIT License](LICENSE).
