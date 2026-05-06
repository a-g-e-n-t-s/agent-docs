# agent-docs

> Documentation engine and KADI agent for the AGENTS ecosystem

## Quick Start

Development (site + agent):

```bash
cd agent-docs
npm run setup          # installs deps (runs `npm install`)
# In one terminal: start the site (Astro)
npm run dev            # starts site on http://localhost:3333
# In another terminal: start the agent (connects to broker)
npm run dev:agent      # runs `npx tsx src/agent.ts broker`
```

Run the agent (broker mode) directly:

```bash
npm run setup
npm run start          # runs `npx tsx src/agent.ts broker`
```

If you need to build the site and package for production:

```bash
npm run build          # sync + astro build
# container image / deploy steps are defined in agent.json -> build / deploy
```

## Tools

- agents-docs-config: Read and describe the current agent-docs configuration. Shows site settings, repo list, and agent config.
- agents-docs-pipeline: Full documentation pipeline: sync repos → collect markdown → reindex into ArcadeDB.
- agents-docs-readme-generate: Generate or update README.md files for all repos. Fills missing sections from agent.json metadata.
- agents-docs-readme-lint: Validate README.md files against templates for each repo type.
- agents-docs-search: Search AGENTS documentation using 4-signal hybrid recall (semantic + keyword + graph + structural).
- agents-docs-page: Fetch a single documentation page by slug. Returns full content and metadata.
- agents-docs-reindex: Trigger a full reindex of documentation into ArcadeDB. Use agents-docs-pipeline for the full workflow.
- agents-docs-index-status: Get documentation index statistics: total docs, counts by collection, health.
- agents-docs-status: Show documentation system status: configured repos, sync state, and build health.
- agents-docs-sync: Crawl all configured repos and collect documentation files into the docs/ directory.

(When running the agent, registered tools will appear in the broker/tool registry.)

## Configuration

### agent.json

| Field | Value |
|-------|-------|
| **Name** | agent-docs |
| **Version** | 0.1.3 |
| **Type** | agent |
| **Entrypoint** | dist/agent.js |
| **Description** | Documentation engine and KADI agent for the AGENTS ecosystem |
| **Abilities** | secret-ability, ability-log |
| **Brokers** | remote: wss://broker.dadavidtseng.com/kadi |
| **Networks** | ["global"] |

Note: The runtime/dev entrypoint is src/agent.ts (used by scripts such as start and dev:agent which invoke `npx tsx src/agent.ts broker`).

Scripts of note (defined in agent.json):
- setup: npm install
- start: npx tsx src/agent.ts broker
- sync: npx tsx scripts/sync-cli.ts
- build: npm run sync && astro build
- build:ts: npx tsc
- dev: astro dev --port 3333
- dev:agent: npx tsx src/agent.ts broker
- serve: astro preview --port 3333
- clean: rm -rf dist .astro node_modules abilities agent-lock.json package-lock.json

Build: the build section configures a Node 20 Alpine image and runs a sequence to prepare production artifacts:
- npm ci --include=dev
- kadi install kadi-secret
- kadi install
- npm prune --omit=dev --omit=optional
- npm install tsx

This ensures required kadi abilities are installed and `tsx` is available for runtime packaging.

Deploy: agent.json includes an "akash-mainnet" deploy target with service configuration:
- image: agent-docs:0.1.3
- command: sh -c "ulimit -n 65536 2>/dev/null; kadi secret receive --vault model-manager --vault arcadedb && kadi run start"
- exposes port 3000
- env: NODE_ENV=production, ARCADE_HOST=arcadedb.dadavidtseng.com, ARCADE_PORT=443
- resource limits and pricing configured
- secrets: required vaults and keys:
  - vault "model-manager": required ["MODEL_MANAGER_API_KEY","MODEL_MANAGER_BASE_URL"]
  - vault "arcadedb": required ["ARCADE_USERNAME","ARCADE_PASSWORD"]
- secrets delivery: broker

### config.toml

The repository also includes a config.toml (used at runtime). Key values:

- [agent] ID = "agent-docs", VERSION = "0.1.3"
- [logging] LEVEL = "info"
- [broker.remote] URL = "wss://broker.dadavidtseng.com/kadi"; NETWORKS = ["global"]
- [secrets] VAULTS = ["model-manager", "arcadedb"]; KEYS = ["MODEL_MANAGER_API_KEY", "MODEL_MANAGER_BASE_URL", "ARCADE_USERNAME", "ARCADE_PASSWORD"]
- [arcadedb] HOST = "arcadedb.dadavidtseng.com", PORT = 443, USERNAME = "root", DATABASE = "agents_logs"

Secrets listed in config.toml are expected by the deploy configuration (vaults and required keys).

## Architecture

High-level flow:

- src/agent.ts is the entry point. It loads configuration (config.toml via loadConfig), transforms broker strings into BrokerEntry objects (adding networks), and instantiates a KadiClient (@kadi.build/core) with name/version/description/defaultBroker and the brokers map.
- The agent attempts to load native abilities:
  - secret-ability (optional) — used to fetch secrets from configured vaults (model manager keys, etc). The agent will try vault "model-manager" and fall back to "anthropic" when fetching secrets.
  - ability-docs-memory (optional) — used for local docs memory; if not installed natively, tools will fall back to broker-based memory.
- When loading secrets the agent attempts to read a memory/model key (logged as MEMORY_API_KEY in the runtime code) and sets an internal modelApiKey if available.
- registerAllTools(client, config, secrets, modelApiKey, docsMemoryAbility) registers the documentation tools listed above with the client.
- The agent can be served in 'broker' mode (connects to configured broker) or 'stdio' mode (default when no "broker" arg is passed). Scripts in package.json/agent.json use broker mode for normal operation.

## Development

Install and run local development:

```bash
npm run setup          # installs dependencies
npm run dev            # start Astro dev site (http://localhost:3333)
npm run dev:agent      # start agent in broker mode (connects to configured broker)
```

Build for production:

```bash
npm run build          # sync repos + build site
# production agent start (broker):
npm run start
```

Typecheck / compile TypeScript:

```bash
npm run build:ts       # runs `npx tsc`
```

Serve the built site locally:

```bash
npm run serve          # `astro preview --port 3333`
```

Cleaning build artifacts:

```bash
npm run clean
```

Files and entrypoints:
- Agent runtime entry: src/agent.ts
- Built agent entry (packaging): dist/agent.js
- Config: config.toml
- Sync script: scripts/sync-cli.ts

---

If you need to run the agent in stdio mode (e.g., for local testing without a broker), run:

```bash
npx tsx src/agent.ts
```

This README preserves the previously handwritten structure and updates the configuration, tooling, and development instructions to match the current repository sources.

---