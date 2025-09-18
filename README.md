# TheLounge Answering Machine Plugin

[![NPM version](https://img.shields.io/npm/v/thelounge-plugin-answering-machine.svg)](https://www.npmjs.com/package/thelounge-plugin-answering-machine)

A plugin for TheLounge that provides "answering machine" functionality, automatically replying to messages based on a configurable set of rules.

## Installation

Install the plugin via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-answering-machine
```

After installation, be sure to restart TheLounge for the plugin to be loaded.

## Configuration

Configuration is handled via a `rules.json` file that is automatically created by the plugin.

### File Location

You no longer need to edit a file inside the `node_modules` directory. The plugin now manages its configuration file in a user-accessible location. The file is located inside TheLounge's persistent storage directory, which is typically:

*   `~/.thelounge/answering-machine/rules.json` for standard installations.
*   `/etc/thelounge/answering-machine/rules.json` or `/var/lib/thelounge/answering-machine/rules.json` for system-wide installations (e.g., via Debian/Ubuntu packages).

The plugin will create this directory and a default empty `rules.json` file on its first run if they don't already exist.

### Automatic Reloading

**The plugin automatically watches for changes to this file.** When you save your modifications to `rules.json`, the plugin will instantly reload the rules in the background. You will see a confirmation message in TheLounge's server logs.

This means you no longer need to manually run `/answeringmachine reload` after changing the rules, although the command is still available for convenience.

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
    "server": "MySuperServer",
    "listen_channel": "PrivateMessages",
    "trigger_text": "are you away?",
    "response_message": "Yes, I am currently away. I will get back to you as soon as possible.",
    "response_channel": "NickOfSender"
  }
]
```

### Rule Properties

*   `server` (string): The name of the network/server where this rule applies (e.g., "freenode", "MyCustomServer").
*   `listen_channel` (string): The channel name (e.g., `#my-project`) or `PrivateMessages` for private messages where the plugin should listen for triggers.
*   `trigger_text` (string): The text that must be included in a message to trigger the response.
*   `response_message` (string): The message that the plugin will send in response.
*   `response_channel` (string, optional): The channel or user to which the response should be sent. If not provided, the response is sent to the `listen_channel`. You can use `NickOfSender` to respond directly to the user who triggered the rule.

## Usage

The plugin provides the `/answeringmachine` command to control its behavior on a per-network basis.

### Commands

*   `/answeringmachine start`
    *   Starts the listener for the current IRC network. It will begin monitoring messages and responding according to the rules in `rules.json`.

*   `/answeringmachine stop`
    *   Stops the listener for the current IRC network.

*   `/answeringmachine status`
    *   Shows whether the listener is currently `ACTIVE` or `INACTIVE` for the current network.

*   `/answeringmachine reload`
    *   Manually reloads the rules from the `rules.json` file. Note: This is generally not needed, as the plugin reloads rules automatically when the file is changed.

## How It Works

The plugin works by attaching a listener to `privmsg` (private message) events on a network when you run `/answeringmachine start`.

1.  When a message is received in a channel or private message, the plugin checks if the sender is the user themselves to avoid response loops.
2.  It then iterates through the loaded rules.
3.  If a message matches a rule's `server`, `listen_channel`, and `trigger_text`, the plugin sends the defined `response_message`.
4.  Processing stops after the first matching rule is found for a given message.

## License

This plugin is licensed under the [MIT License](LICENSE).
