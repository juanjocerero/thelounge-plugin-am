# TheLounge Answering Machine [AM] Plugin

[![NPM version](https://img.shields.io/npm/v/thelounge-plugin-am.svg)](https://www.npmjs.com/package/thelounge-plugin-am)

A plugin for [TheLounge](https://thelounge.chat/) that provides "answering machine" (AM) functionality, automatically replying to messages based on a configurable set of rules.

## Table of Contents

- [Installation](#installation)
- [Basic Usage (Core Commands)](#basic-usage-core-commands)
- [Rule Configuration (`rules.json`)](#rule-configuration-rulesjson)
  - [Rule Properties](#rule-properties)
  - [Using Regular Expressions](#using-regular-expressions)
  - [Dynamic Variables & Capture Groups](#dynamic-variables--capture-groups)
- [Advanced Features](#advanced-features)
  - [Remote Rule Fetching](#remote-rule-fetching)
  - [Debugging](#debugging)
- [Configuration Management](#configuration-management)
  - [File Location](#file-location)
  - [Automatic Reloading](#automatic-reloading)
- [Docker Deployment](#docker-deployment)
- [Code Structure](#code-structure)
- [License](#license)

## Installation

Install the plugin via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-am
```

After installation, make sure to restart TheLounge for the plugin to be loaded.

## Basic Usage (Core Commands)

The plugin provides the `/am` command to control its behavior on a per-network basis.

- `/am start`: Starts the listener for the current IRC network.
- `/am stop`: Stops the listener for the current IRC network.
- `/am status`: Shows whether the listener is `ACTIVE` or `INACTIVE`.
- `/am rules`: Shows a list of all active rules for the current server.
- `/am reload`: Manually reloads the rules from `rules.json`.

## Rule Configuration (`rules.json`)

Configuration is handled via a `rules.json` file that the plugin automatically creates. Rules define a trigger and a corresponding response.

**Example `rules.json`:**
```json
[
  {
    "server": "Libera.Chat",
    "listen_channel": "#lounge-testing",
    "trigger_text": "ping",
    "trigger_flags": "i",
    "response_text": "pong, {{sender}}!",
    "response_channel": "",
    "cooldown_seconds": 5,
    "delay_seconds": 10
  }
]
```

### Rule Properties

- `server` (string): The name of the network where this rule applies (e.g., "Libera.Chat").
- `listen_channel` (string): The channel name where the plugin should listen (e.g., `#my-project`).
- `trigger_text` (string): A regular expression pattern that triggers the rule.
- `trigger_flags` (string, optional): Flags for the regular expression (e.g., `"i"` for case-insensitive).
- `response_text` (string): The message the plugin will send. Can contain dynamic variables.
- `response_channel` (string, optional): The channel or user to respond to. Defaults to `listen_channel`.
- `cooldown_seconds` (number, optional): The minimum time in seconds before the rule can be triggered again. **Defaults to 5s**.
- `delay_seconds` (number, optional): The delay in seconds before sending the response. **Defaults to 0s**.

### Using Regular Expressions

All triggers are regular expressions, allowing for powerful rules.

- **Simple Match:** To match a substring, just enter the text: `"trigger_text": "some text"`.
- **Advanced Match:** To match a message that *starts* with "hello": `"trigger_text": "^hello"`.

*Remember to escape special JSON characters like the backslash `\` (e.g., `"\\s"` for a space character).*

### Dynamic Variables & Capture Groups

You can use variables in both the trigger and the response:

- `{{me}}`: Is replaced by the bot's current nickname on the server.
- `{{sender}}`: Is replaced by the nickname of the user who sent the message (only in `response_text`).

You can use capturing groups `(...)` in your `trigger_text` and reference them in `response_text` using `$1`, `$2`, etc.

**Example:**
```json
{
  "trigger_text": "have you ever heard of (.+)\"?",  
  "trigger_flags": "i",
  "response_text": "Of course I've heard of $1! It's one of my favorite topics."
}
```

## Advanced Features

### Remote Rule Fetching

This allows administrators to fetch rules from a remote URL and merge them with the existing ruleset.

> **:warning: SECURITY WARNING: Server-Side Request Forgery (SSRF)**
> Enabling this feature allows TheLounge server to make HTTP requests to external URLs. A malicious actor could potentially use this to probe your internal network. To mitigate this risk, the `fetch` functionality is **disabled by default**.

**Configuration Steps:**

1.  **Enable the Fetch Feature**
    ```
    /am fetch enable
    ```

2.  **Whitelist Trusted Domains**
    You must specify which domains are safe to fetch rules from.
    ```
    /am whitelist add gist.githubusercontent.com
    ```

**Management Commands:**

- `/am fetch <enable|disable|status>`: Controls the remote fetching feature.
- `/am fetch <URL>`: Fetches and merges rules from a URL.
- `/am whitelist <add|remove|list> [domain]`: Manages the domain whitelist.

**Merge Logic:** A rule is considered unique based on its `server`, `listen_channel`, and `trigger_text`. If a fetched rule matches an existing one, the existing rule is **overwritten**. If it doesn't match, it is **added**.

### Debugging

The plugin includes a debug mode for verbose logging, useful for troubleshooting.

- `/am debug enable`: Activates verbose logging.
- `/am debug disable`: Deactivates verbose logging.
- `/am debug status`: Shows whether debug mode is currently active.

## Configuration Management

### File Location

The plugin manages its configuration files (`rules.json` and `config.json`) inside TheLounge's packages directory. The exact location is logged by the plugin on startup.

- **System-wide install:** `/etc/thelounge/packages/thelounge-plugin-am/config/`
- **Official Docker image:** `/var/opt/thelounge/packages/thelounge-plugin-am/config/`

### Automatic Reloading

**The plugin automatically watches for changes to the `rules.json` file.** When you save modifications, the plugin instantly reloads the rules. You no longer need to manually run `/am reload`.

<details>
<summary><b>Docker Deployment</b></summary>

If you want to use the plugin inside a Docker image, here is a suggested `docker-compose.yml` to mount a custom `rules.json`.

```yaml
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

You can use `post-install.sh` to install the plugin:
```sh
#!/bin/sh
export THELOUNGE_HOME=/var/opt/thelounge
echo "--- Running post-install.sh ---"
thelounge install thelounge-plugin-am
```
Make sure to `chmod +x` your `post-install.sh` before starting the container.

</details>

<details>
<summary><b>Code Structure</b></summary>

The codebase is organized into several modules within the `src/` directory.

- `index.js`: The main entry point of the plugin. It orchestrates the initialization of all other modules.
- `src/logger.js`: A wrapper around TheLounge's native logger, with support for the debug mode.
- `src/plugin-config.js`: Manages the plugin's internal configuration file (`config.json`).
- `src/rule-manager.js`: Handles loading, parsing, and providing access to the rules in `rules.json`.
- `src/message-handler.js`: Contains the core logic that checks incoming messages against the rules.
- `src/commands.js`: Defines the `/am` command and all its subcommands.

</details>

## License

This plugin is licensed under the [MIT License](LICENSE).
