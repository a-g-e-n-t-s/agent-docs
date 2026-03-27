# agent-chatbot
> Consolidated KĀDI chat agent that listens to and sends messages for Discord and Slack.

Overview
========
agent-chatbot is a KĀDI (KĀDI Agents) multi-platform chat agent that consolidates inbound event listeners and outbound tools for Discord and Slack. It replaces separate repos for platform clients and servers and uses a single Kadi broker connection for both event publishing and tool registration. Platforms can be enabled/disabled via environment variables.

Quick Start
===========
1. Clone the repository and install dependencies:
```bash
git clone <repo-url>
cd agent-chatbot
npm install
```

2. Install the agent into your KĀDI environment (requires kadi CLI):
```bash
kadi install
```

3. Create a .env file in the project root with the required configuration (see Configuration). Example:
```env
KADI_BROKER_URL=ws://localhost:8080/kadi
DISCORD_ENABLED=true
DISCORD_TOKEN=your-discord-bot-token
DISCORD_BOT_USER_ID=your-discord-bot-user-id
DISCORD_GUILD_ID=your-discord-guild-id
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_BOT_USER_ID=your-slack-bot-user-id
SLACK_HTTP_PORT=3700
KADI_NETWORKS=text
LOG_LEVEL=info
```

4. Start the agent via Kādi:
```bash
kadi run start
```

Alternatively, for local development:
```bash
# TypeScript watcher (requires tsx)
npm run dev
```

Tools
=====
The agent registers platform-specific tools with the KĀDI broker so other agents or services can invoke messaging and channel operations.

| Tool | Description |
|------|-------------|
| registerDiscordTools | Registers Discord-specific tools with Kādi (outbound message sending, channel management and utility tools for Discord). Implemented in ./platforms/discord/tools.js and registered on broker connection. |
| registerSlackTools | Registers Slack-specific tools with Kādi (outbound message sending, block/message utilities and workspace interactions). Implemented in ./platforms/slack/tools.js and registered on broker connection. |

Configuration
=============
Configuration is driven by environment variables and validated by the Zod schema in src/index.ts. Key fields:

- KADI_BROKER_URL (string, required)
  - WebSocket URL of the Kādi broker, e.g. ws://localhost:8080/kadi
  - Default broker in agent.json: "ws://localhost:8080/kadi"

Platform toggles:
- DISCORD_ENABLED (boolean, default true)
- SLACK_ENABLED (boolean, default true)

Discord:
- DISCORD_TOKEN (string, default '')
- DISCORD_BOT_USER_ID (string, default '')
- DISCORD_GUILD_ID (string, default '')

Slack:
- SLACK_BOT_TOKEN (string, default '') — Slack token must start with "xoxb-" for Slack to be considered enabled
- SLACK_SIGNING_SECRET (string, default '')
- SLACK_BOT_USER_ID (string, default '')
- SLACK_HTTP_PORT (number, default 3700)

Network and logging:
- KADI_NETWORKS (string, default "text") — comma-separated list of Kādi networks to join
- LOG_LEVEL (one of 'debug' | 'info' | 'warn' | 'error', default 'info')

Notes about enablement checks:
- Discord is considered enabled if DISCORD_ENABLED=true AND DISCORD_TOKEN is non-empty.
- Slack is considered enabled if SLACK_ENABLED=true AND SLACK_BOT_TOKEN starts with "xoxb-".

Files of interest:
- agent.json — agent metadata, scripts, build config, default broker
- src/index.ts — main agent bootstrap and configuration
- ./platforms/discord/client.js — Discord platform client implementation
- ./platforms/discord/listener.js — Discord event listener
- ./platforms/discord/tools.js — Discord tool registrations
- ./platforms/slack/client.js — Slack platform client implementation
- ./platforms/slack/listener.js — Slack event listener
- ./platforms/slack/tools.js — Slack tool registrations

Architecture
============
High-level data flow and key components:

- KadiClient (src/index.ts)
  - Single connection to the Kādi broker (KADI_BROKER_URL).
  - Responsible for registering tools and publishing/subscribing to events across configured networks (KADI_NETWORKS).
  - Broker connection is shared for both inbound event publishing and outbound tool invocation.

- Platform Clients
  - DiscordPlatformClient (./platforms/discord/client.js)
  - SlackPlatformClient (./platforms/slack/client.js)
  - Responsible for low-level interactions with the respective platform SDKs (discord.js, @slack/web-api / @slack/bolt).
  - Provide APIs used by listeners and tool registrars to send messages, fetch channels/users, etc.

- Listeners
  - DiscordListener (./platforms/discord/listener.js)
  - SlackListener (./platforms/slack/listener.js)
  - Listen for inbound platform events (messages, interactions).
  - Translate platform events into Kādi events (published via KadiClient) and route them onto configured Kādi networks.

- Tool Registration
  - registerDiscordTools (./platforms/discord/tools.js)
  - registerSlackTools (./platforms/slack/tools.js)
  - Register outbound actions with the Kādi broker so other agents can invoke platform actions (send message, update message, fetch channel info, etc).

Typical runtime flow:
1. Agent loads configuration (src/index.ts) and validates environment variables via Zod.
2. KadiClient connects to the broker (KADI_BROKER_URL) and joins networks specified in KADI_NETWORKS.
3. Enabled platform clients are initialized (Discord and/or Slack).
4. Platform-specific listeners attach to platform SDKs and publish inbound events to Kādi networks.
5. Platform-specific tools are registered with the broker so remote callers can invoke outbound actions. Calls go through KadiClient → tool handlers → platform client SDK.

Development
===========
Scripts defined in agent.json:

- npm run preflight
  - Verifies node_modules is installed before actions that require dependencies.
- npm run setup
  - npx tsc (compile TypeScript)
- npm run start
  - node dist/index.js (run compiled agent)
- npm run dev
  - tsx watch src/index.ts (TypeScript runtime with watch)
- npm run build
  - tsc (compile TypeScript)
- npm run type-check
  - tsc --noEmit
- npm run lint
  - eslint src --ext .ts
- npm run test
  - vitest

Recommended local development workflow:
1. Install deps:
   ```bash
   npm install
   ```
2. Start in dev/watch mode:
   ```bash
   npm run dev
   ```
3. To build for production:
   ```bash
   npm run build
   npm run start
   ```

Container / CI build
- The build configuration in agent.json (build.default) targets node:20-alpine and runs:
  - npm ci --include=dev
  - npx tsc
  - npm prune --omit=dev
- The built image sets NODE_ENV=production.

Troubleshooting
===============
- "Dependencies not installed. Run: npm install" — run npm install then re-run preflight or the script you were using.
- Configuration validation errors — check .env against the fields documented in Configuration and ensure required secrets (DISCORD_TOKEN, SLACK_BOT_TOKEN) are present for the platforms you intend to enable.
- Slack not enabled — SLACK_BOT_TOKEN must start with xoxb-.
- Broker connection issues — verify KADI_BROKER_URL and that the Kādi broker is reachable (default in agent.json: ws://localhost:8080/kadi).

Contact / Further Work
======================
- See source files under src/ and ./platforms for platform-specific behavior and to extend toolsets or event handling.
- For changes to tool contracts, update the corresponding register*Tools file and document new tool names and inputs in the Tools section above.