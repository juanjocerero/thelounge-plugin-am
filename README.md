# TheLounge Answering Machine Plugin

[![NPM version](https://img.shields.io/npm/v/thelounge-plugin-answering-machine.svg)](https://www.npmjs.com/package/thelounge-plugin-answering-machine)

A plugin for TheLounge that provides "answering machine" functionality, automatically replying to messages based on a configurable set of rules.

## Installation

Install the plugin via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-answering-machine
```

After installation, make sure to restart TheLounge for the plugin to be loaded.

## Configuration

Configuration is handled via a `rules.json` file that is automatically created by the plugin. If one exists already, it is respected.

### `rules.json` Structure

The file should contain an array of rule objects. Each rule object defines a trigger and a corresponding response.

```json
[
  {
    "server": "freenode",
    "listen_channel": "#my-channel",
    "trigger_text": "ping",
    "response_message": "pong"
  },
  {
    [...]
  }
]
```

### File Location

The plugin manages its configuration in a file located inside TheLounge's persistent storage directory, which is typically:

*   `/etc/thelounge/packages/thelounge-plugin-answering-machine/answering-machine/rules.json` or `/var/lib/thelounge/answering-machine/rules.json` for system-wide installations (e.g., via Debian/Ubuntu packages it is the first option).
*   `/var/opt/thelounge/packages/thelounge-plugin-answering-machine/answering-machine/rules.json` for the official Docker image.

The plugin will create a default empty `rules.json` file on its first run if they don't already exist.

### Automatic Reloading

**The plugin automatically watches for changes to this file.** When you save your modifications to `rules.json`, the plugin will instantly reload the rules in the background. You will see a confirmation message in TheLounge's server logs.

This means you no longer need to manually run `/answeringmachine reload` after changing the rules, although the command is still available for convenience.

### Rule Properties

*   `server` (string): The name of the network/server where this rule applies (e.g., "freenode", "MyCustomServer").
*   `listen_channel` (string): The channel name (e.g., `#my-project`) or `PrivateMessages` for private messages (**this function has not been tested sufficiently**) where the plugin should listen for triggers.
*   `trigger_text` (string): The text that must be included in a message to trigger the response.
*   `response_message` (string): The message that the plugin will send in response.
*   `response_channel` (string, optional): The channel or user to which the response should be sent. If not provided, the response is sent to the `listen_channel`. You can use `NickOfSender` to respond directly to the user who triggered the rule (**this function has not been tested sufficiently**).

## Usage

The plugin provides the `/answeringmachine` command to control its behavior on a per-network basis.

### Commands

*   `/answeringmachine start`
    *   Starts the listener for the current IRC network. It will begin monitoring messages and responding according to the rules in `rules.json`. You **must** specify the exact name you defined in TheLounge for the Network: for example, not `irc.libera.chat` but `Libera.Chat` if you named it that way.

*   `/answeringmachine stop`
    *   Stops the listener for the current IRC network.

*   `/answeringmachine status`
    *   Shows whether the listener is currently `ACTIVE` or `INACTIVE` for the current network.

*   `/answeringmachine reload`
    *   Manually reloads the rules from the `rules.json` file. Note: This is generally not needed, as the plugin reloads rules automatically when the file is changed.


## License

This plugin is licensed under the [MIT License](LICENSE).
