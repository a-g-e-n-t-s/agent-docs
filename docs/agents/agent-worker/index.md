# agent-worker
> Generic worker agent for the KĀDI multi-agent system (roles: artist, designer, programmer)

Overview
--------
agent-worker is a KĀDI-compatible worker agent that runs role-specific worker loops (artist, designer, programmer). It is built on top of agents-library and provides registration/heartbeat with an MCP (mcp-server-quest), role configuration loading, provider injection, and a tool-calling loop that listens for task.assigned events and publishes task.completed, task.failed, or task.rejected.

Quick Start
-----------
1. Install node deps and KADI runtime:
   - npm install
   - kadi install

2. Build (TypeScript compile) and start:
   - npm run setup
   - kadi run start

3. Run directly (production JS entry):
   - npm run start

4. Run for a specific role (examples):
   - npm run start:artist
   - npm run start:designer
   - npm run start:programmer

Helpful dev commands:
- npm run dev          (live-reload TypeScript with tsx)
- npm run dev:artist   (dev with AGENT_ROLE=artist)
- npm run build        (tsc)
- npm run lint         (eslint src --ext .ts)
- npm test             (vitest)
- npm run preflight    (check node_modules installed)

Tools
-----
| Tool | Description |
|------|-------------|
| agents-library (BaseAgent, createWorkerAgent, logger, timer) | Core runtime primitives: BaseAgent (provides KadiClient, ProviderManager, MemoryService), createWorkerAgent (factory to create the worker loop), logging and timing helpers. Imported from local file dependency "agents-library". |
| RoleLoader (./roles/RoleLoader.js) | Loads role-specific configuration from config/roles/{role}.json and applies role settings (capabilities, maxConcurrentTasks, behavior tuning) to the worker agent. |
| KADI Broker (ws://localhost:8080/kadi) | Default broker endpoint (defined in agent.json under brokers.default). The KadiClient connects here to subscribe/publish KĀDI protocol events. |
| mcp-server-quest RPCs (quest_quest_register_agent, quest_quest_agent_heartbeat, quest_quest_unregister_agent) | Remote procedures invoked to register the agent, send heartbeats, and unregister on shutdown. |
| loadVaultCredentials | Utility to load secrets/vault credentials (used during startup to fetch API keys or agent secrets). |
| secret-ability (^0.9.3) | Declared ability in agent.json; listed as an available ability for the agent (install and usage handled by build/runtime). |

Configuration
-------------
Files and locations:
- src/index.ts — main runtime entry
- dist/index.js — built entrypoint (npm run setup or npm run build produces this)
- roles/RoleLoader.js — role loader
- config/roles/{role}.json — per-role configuration files (artist, designer, programmer)
- agent.json — agent manifest (name, version, scripts, brokers, abilities)

Key configuration fields:
- brokers.default (agent.json)
  - Default broker URL. Default in manifest: ws://localhost:8080/kadi
- AGENT_ROLE (env)
  - Controls which role config to load (artist, designer, programmer).
  - Examples: AGENT_ROLE=artist npm run start OR npm run start:artist
- abilities (agent.json)
  - abilities.secret-ability: ^0.9.3 declared; installable via npm as needed.
- NODE_ENV
  - Production build uses NODE_ENV=production in build.default.env

Runtime behavior configuration (from code):
- Role config path: config/roles/{role}.json (loaded by RoleLoader)
  - Typical fields in role JSON: role, capabilities (array), maxConcurrentTasks, any role-specific tuning
- Heartbeat interval: 30 seconds (hard-coded in src/index.ts startHeartbeat)
- Remote procedure names:
  - quest_quest_register_agent (register)
  - quest_quest_agent_heartbeat (heartbeat)
  - quest_quest_unregister_agent (unregister)

Architecture
------------
Data flow and key components:

- Startup
  1. Environment and secrets: src/index.ts imports dotenv/config and calls loadVaultCredentials to fetch any required secrets.
  2. BaseAgent initialization: The agent creates a BaseAgent (agents-library) which sets up the KadiClient, ProviderManager, and MemoryService.
  3. Role loading: RoleLoader loads config from config/roles/{AGENT_ROLE}.json and returns role-specific capabilities and maxConcurrentTasks.
  4. Worker creation: createWorkerAgent (WorkerAgentFactory) creates a BaseWorkerAgent and injects the ProviderManager and role settings.

- Runtime loop
  1. Registration: The agent invokes quest_quest_register_agent on mcp-server-quest to register itself (agent id: agent-worker-{role}) with capabilities and maxConcurrentTasks.
  2. Subscription: The agent subscribes to task.assigned events on the KADI broker. Events are filtered by role in payload.
  3. Task handling: On task.assigned, the worker uses provider tools and configured abilities to process tasks:
     - Tool-calling loop attempts to complete the task.
     - On success: publish task.completed
     - On known failure: publish task.failed
     - On rejection or inability: publish task.rejected
  4. Heartbeat: Every 30 seconds the agent invokes quest_quest_agent_heartbeat with status and currentTasks.
  5. Shutdown: On graceful shutdown the agent invokes quest_quest_unregister_agent.

Key components:
- BaseAgent (agents-library)
  - KadiClient: websocket connection to brokers.default
  - ProviderManager: manages external providers/tools the agent uses
  - MemoryService: local memory/state for in-flight tasks
- RoleLoader (roles/RoleLoader.js)
  - Loads and validates role JSON and returns runtime config
- WorkerAgent (createWorkerAgent)
  - Implements the tool-calling task loop and event handlers
- mcp-server-quest (remote service)
  - External registry and heartbeat endpoint used for agent lifecycle

Development
-----------
Repository layout (relevant files):
- src/index.ts — main TypeScript entry
- roles/RoleLoader.js — role loader
- config/roles/*.json — role configs
- agent.json — agent manifest and scripts
- package.json (implicit) — contains scripts and dependencies (see project)

Install and dev flow:
1. Install dependencies:
   - npm install

2. Preflight check:
   - npm run preflight
   - This script verifies node_modules exists before running the agent.

3. Local development (live reload):
   - npm run dev
   - OR for a specific role:
     - npm run dev:artist
     - npm run dev:designer
     - npm run dev:programmer

4. TypeScript build:
   - npm run setup
   - OR npm run build

5. Type checking and lint:
   - npm run type-check
   - npm run lint

6. Tests:
   - npm test

Notes and tips:
- When running under KADI, run kadi install before kadi run start to ensure platform dependencies are present.
- Use AGENT_ROLE to select role on startup. Scripts are provided for convenience (start:artist, dev:designer, etc.).
- Ensure the MCP server (mcp-server-quest) RPC endpoints are reachable by the KadiClient and that brokers.default points to your KADI broker (default ws://localhost:8080/kadi).
- Secrets and API keys should be provided via environment or the vault loader (loadVaultCredentials).

Contact / Contribution
----------------------
Follow repository contribution and code style guidelines: use TypeScript, run lint and tests before PR. For changes to agent behavior, update config/roles/{role}.json and the RoleLoader, then run npm run setup to compile.

