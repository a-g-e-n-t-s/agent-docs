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
# container image / deploy steps are defined in agent.json -> build/deploy
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
| **Entrypoint (dev)** | src/agent.ts (used by npm scripts: start, dev:agent) |
| **Abilities** | secret-ability, ability-log |
| **Brokers** | remote: wss://broker.dadavidtseng.com/kadi |
| **Networks** | ["global"] |

Scripts of note (defined in agent.json):
- setup: npm install
- start: npx tsx src/agent.ts broker
- dev: astro dev --port 3333
- dev:agent: npx tsx src/agent.ts broker
- build: npm run sync && astro build
- sync: npx tsx scripts/sync-cli.ts

Build: the build section configures a Node 20 Alpine image, runs `npm ci --include=dev`, installs kadi abilities, prunes dev deps, and ensures `tsx` is available for runtime.

Deploy: agent.json includes an "akash-mainnet" deploy target with service configuration (image agent-docs:0.1.3), env vars, resource limits, and required vaults (model-manager, arcadedb).

### config.toml

The repository also includes a config.toml (used at runtime). Key values:

- [agent] ID = "agent-docs", VERSION = "0.1.3"
- [logging] LEVEL = "info"
- [broker.remote] URL = "wss://broker.dadavidtseng.com/kadi"; NETWORKS = ["global"]
- [secrets] VAULTS = ["model-manager", "arcadedb"]; KEYS = ["MODEL_MANAGER_API_KEY","MODEL_MANAGER_BASE_URL","ARCADE_USERNAME","ARCADE_PASSWORD"]
- [arcadedb] HOST = "arcadedb.dadavidtseng.com", PORT = 443, USERNAME = "root", DATABASE = "agents_logs"

Secrets listed in config.toml are expected by the deploy configuration (vaults and required keys).

## Architecture

High-level flow:

- src/agent.ts is the entry point. It loads configuration (config.toml), transforms broker strings into broker entries (including networks), and instantiates a KadiClient (@kadi.build/core) with name/version/description/defaultBroker.
- The agent attempts to load native abilities:
  - secret-ability (optional) — used to fetch secrets from configured vaults (model manager keys, etc).
  - ability-docs-memory (optional) — used for local docs memory; if not installed natively, tools will fall back to broker-based memory.
- registerAllTools(...) registers the documentation tools listed above with the client.
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