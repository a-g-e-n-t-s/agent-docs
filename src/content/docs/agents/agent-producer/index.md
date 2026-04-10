---
title: "agent-producer"
---

# agent-producer
> KĀDI "producer" agent: orchestrates quests and tasks, registers tools with KĀDI broker, and forwards task lifecycle events to worker agents and human channels.

Overview
--------
agent-producer is a KĀDI agent (type: kadi-agent) that coordinates multi-agent work (artist, designer, programmer) via the KĀDI event-driven protocol. It registers tools with the broker, forwards task management to upstream task managers, publishes task assignment events (e.g., quest.tasks_ready), and relays status updates to human channels (Slack/Discord). The project uses agents-library for common agent primitives and can enable LLM-backed features when ANTHROPIC_API_KEY and model manager credentials are provided.

Quick Start
-----------
1. Clone the repository and install Node dependencies:
`npm install`

2. Install the agent into your local KĀDI workspace (uses KĀDI CLI):
`kadi install`

3. Start the agent via the KĀDI runner:
`kadi run start`

Alternative local development:
- Build TypeScript and run:
  `npm run setup`
  `npm start`

- Run in watch/dev mode:
  `npm run dev`

Notes:
- The agent reads configuration from config.toml (walk-up discovery). Environment variables (.env) take precedence for overrides.
- Secrets should be stored in your vault/secrets.toml or injected by your deployment (see Configuration section).

Tools
-----
| Tool | Description |
|---|---|
| echo | Echo back the input text with its length (placeholder tool - replace with your own). |
| echo | ... (duplicate placeholder registration present in source; keep or replace as needed). |
| list_tools | List all available tools in human-readable format. This is a one-time operation that completes immediately. Do not retry on success. |
| quest_approve | Approve a quest plan in pending_approval. Moves the quest to approved and ready for task splitting. |
| quest_request_revision | Request revision of a quest plan in pending_approval. Requires feedback; quest returns to draft. |
| quest_reject | Reject a quest plan in pending_approval. Requires feedback; moves the quest to rejected. |
| task_approve | Approve a completed task in pending_approval. Moves the task to completed. |
| task_request_revision | Request revision of a task result (pending_approval). Requires feedback; task returns to in_progress. |
| task_reject | Reject a task result (pending_approval). Requires feedback; task moves to failed. |
| task_execution | Trigger task execution by publishing `quest.tasks_ready` for agent-lead to assign tasks to worker agents. |

Configuration
-------------
Primary configuration files and fields:
- config.toml (committed non-secret configuration)
  - [broker]
    - url = "ws://localhost:8080/kadi" — primary broker URL used by the agent
    - networks = ["producer","quest","text","vision","file","global"] — default networks to join
  - [broker.remote]
    - url = "wss://broker.dadavidtseng.com/kadi" — optional additional/remote broker
    - networks = ["global"]
  - [bot]
    - tool_timeout_ms = 10000 — default per-tool timeout in milliseconds
  - [bot.slack]
    - enabled = true
    - user_id = "U09SCDV78AK"
  - [bot.discord]
    - enabled = true
    - user_id = "1438685741751210025"
  - [memory]
    - data_path = "./data/memory" — local path for persistent memory

Secret management:
- Secrets should be stored in your vault or secrets.toml (encrypted) and NOT committed to git.
- .env may be used for local overrides (not committed).
- agent.json deploy.secrets defines:
  - required: ["ANTHROPIC_API_KEY", "MODEL_MANAGER_API_KEY"]
  - vault: "agent-producer"
  - delivery: "broker"

Environment variables (overrides):
- KADI_BROKER_URL — override primary broker URL (e.g., ws://localhost:8080/kadi)
- KADI_BROKER_URL_2 — optional second broker URL for multi-broker connectivity
- KADI_NETWORK — comma-separated networks override for primary broker (e.g., producer,quest,text)
- KADI_NETWORK_2 — comma-separated networks for secondary broker
- ANTHROPIC_API_KEY — enables LLM-backed features when present
- MODEL_MANAGER_BASE_URL — optional model manager base URL
- MODEL_MANAGER_API_KEY — optional model manager API key

Relevant files / paths:
- agent.json — agent metadata, scripts, build & deploy settings
- config.toml — agent configuration (non-secret)
- secrets.toml — (encrypted) secrets file; use vault for production
- .env — optional local overrides
- src/index.ts — main agent bootstrap
- src/tools/* and ./tools/index.js — tool registrations and orchestrator injectors
- ./data/memory — persistent memory directory used by agents-library MemoryService

Architecture
------------
High-level components and data flow:
- BaseAgent (agents-library)
  - KadiClient: connects to one or more KĀDI brokers and registers tools
  - ProviderManager: optional LLM provider (Anthropic) when ANTHROPIC_API_KEY is configured
  - MemoryService: persistent memory stored in data_path (./data/memory)
  - Graceful shutdown handling for SIGINT/SIGTERM

- Tool registration
  - registerAllTools (imported from ./tools/index.js) registers each tool (echo, list_tools, quest_approve, etc.) with KadiClient via kadiClient.registerTool()
  - Tool schemas are defined in tool modules (examples referenced: plan-task.js, list-tasks.js, task-status.js, assign-task.js)

- Upstream integration
  - The agent forwards task management to an MCP upstream (mcp-shrimp-task-manager) using kadiClient.load() so existing task managers can handle planning/splitting.

- Event publishing and orchestration
  - After forwarding or creating tasks, agent-producer publishes events (e.g., `quest.tasks_ready`) to the broker.
  - agent-lead listens to these events and assigns tasks to worker agents by role.
  - Workers execute tasks and commit results; agent-lead verifies and publishes verification events (e.g., task.verified).
  - agent-producer relays status updates back to human channels (Slack, Discord) and to the originator (Claude Code/Desktop).

- Multi-broker support
  - Primary broker configured via KADI_BROKER_URL / config.toml [broker].url
  - Optional remote broker (KADI_BROKER_URL_2 / broker.remote.url) can be added for cross-network or global events.

- Tool lifecycle
  - Some tools are immediate/one-shot (e.g., list_tools). Others are stateful and interact with quest/task lifecycles managed by upstream task manager components.

Deployment notes:
- agent.json includes a build stanza (base image node:20-alpine) and akash-mainnet deploy configuration that exposes port 3000, sets NODE_ENV=production, and declares required secrets and resource requests.
- When deploying to KADI/Akash, ensure secrets (ANTHROPIC_API_KEY, MODEL_MANAGER_API_KEY) are provided by the vault and delivered via broker as configured in agent.json.

Development
-----------
Useful npm scripts (defined in agent.json):
- `npm run preflight` — checks node_modules exist (fail early if dependencies missing)
- `npm run setup` — transpile TypeScript (npx tsc)
- `npm start` — run compiled build: node dist/index.js
- `npm run dev` — run in watch mode (npx tsx watch src/index.ts)
- `npm run build` — compile TypeScript (npx tsc)
- `npm run type-check` — run tsc without emitting
- `npm run lint` — run ESLint on src
- `npm run test` — run tests (vitest)

Build container image (as configured in agent.json.build.default):
- Steps performed by the build:
  - npm ci --include=dev
  - npx tsc
  - npm prune --omit=dev
- Base image: node:20-alpine

Local debugging tips:
- Use `npm run dev` to get hot-reload behavior via tsx.
- Provide environment variables locally via .env or by exporting before starting:
  - export KADI_BROKER_URL="ws://localhost:8080/kadi"
  - export ANTHROPIC_API_KEY="sk-..."
  - export MODEL_MANAGER_API_KEY="..."
- To inspect memory, view files under ./data/memory.

References in source:
- Main bootstrap: src/index.ts (registers tools, loads config, loads vault credentials)
- Tool registration entrypoint: ./tools/index.js
- Tool schemas referenced in src/index.ts: plan-task.js, list-tasks.js, task-status.js, assign-task.js

If you need example tool implementations, a deployment manifest for Akash, or a walkthrough for enabling LLM features (Anthropic + Model Manager), tell me which part you want expanded and I will add targeted instructions.