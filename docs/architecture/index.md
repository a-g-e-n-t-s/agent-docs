# agents-core
> Core runtime and tools for the AGENTS multi-agent orchestration platform (kadi-monorepo package)

Overview
--------
agents-core provides the core runtime, shared services, and tool registrations used by AGENTS agent processes. It exposes a pluggable tool registry, a lightweight message bus, storage adapters, and the execution pipeline that ties planner/router/executor components together. This package is intended to be consumed by other packages in the kadi monorepo and by runtime node processes started via kadi.

Quick Start
-----------
1. Install package dependencies:
npm install

2. Ensure monorepo packages are linked/install artifacts with kadi:
kadi install

3. Start a local agents-core runtime (development):
kadi run start --workspace=agents-core

4. Common development tasks:
npm run build
kadi run test
kadi run lint

Tools
-----
The following tools are registered by agents-core and available via the tool registry. They are implemented under src/tools/ and exported from src/index.ts.

| Tool | Description |
| --- | --- |
| agent-registry | Keeps metadata for active agents (id, capabilities, lastSeen). Exposes register(), unregister(), findByCapability(). |
| task-router | Routes incoming tasks/requests to suitable agents based on capabilities and load. Implements route(task) and routeBatch(tasks). |
| task-executor | Executes tasks against agents and handles retries, timeout, and error escalation. Implements execute(task, opts). |
| memory-store | In-memory key/value store used for ephemeral runtime state and caching. Implements get/set/del and TTL. |
| persistent-store | Disk-backed JSON store adapter (src/store/diskStore.ts) for small persisted state used by agents-core. Configurable via storage.path. |
| message-bus | Internal pub/sub event bus used by planner, router, and executor. Emits events: task.created, task.routed, task.completed. |
| logger | Centralized logging adapter wrapping pino/winston style API. Configurable log.level and log.destination. |

Configuration
-------------
Configuration can be provided via environment variables, a config file, or by passing an explicit config object to the runtime bootstrap API.

Default config file path:
- config/agents.config.json
Default runtime entry points:
- src/index.ts
- src/cli.ts

Important configuration fields (config/agents.config.json or programmatic config object):
- nodeId (string) — unique identifier for this runtime node. Default: hostname.
- port (number) — port for optional HTTP control API. Default: 0 (disabled).
- log.level (string) — logging level: debug | info | warn | error. Default: info.
- storage.path (string) — path for persistent-store files. Default: ./data
- registry.ttl (number) — milliseconds before an agent entry is considered stale. Default: 60000
- tools (object) — enable/disable tool registrations, e.g. { "task-executor": true, "persistent-store": false }
- plugins (array) — array of plugin module names to load at startup.

Environment variables
- AGENTS_NODE_ID — overrides nodeId
- AGENTS_PORT — overrides port
- AGENTS_LOG_LEVEL — overrides log.level
- AGENTS_STORAGE_PATH — overrides storage.path

Sample config (config/agents.config.json)
{
  "nodeId": "agents-core-node-1",
  "port": 8080,
  "log": { "level": "info" },
  "storage": { "path": "./data" },
  "registry": { "ttl": 60000 },
  "tools": {
    "agent-registry": true,
    "task-router": true,
    "task-executor": true,
    "persistent-store": true
  },
  "plugins": []
}

Architecture
------------
High-level components and data flow:

- CLI / Bootstrap (src/cli.ts, src/index.ts)
  - Loads configuration (config/agents.config.json, env vars)
  - Initializes logger, storage adapters, and the tool registry
  - Registers built-in tools found in src/tools/

- Tool Registry (src/toolRegistry.ts)
  - Holds tool instances keyed by name
  - Provides getTool(name), registerTool(name, instance), unregisterTool(name)

- Message Bus (src/events/bus.ts)
  - Internal lightweight pub/sub bus
  - Used for event-driven coordination between components (task.created -> router -> executor)

- Agent Registry (src/agentRegistry.ts)
  - Tracks active agents and their capabilities
  - Supports heartbeats and TTL eviction

- Router (src/router.ts / src/tools/task-router.ts)
  - Receives incoming task requests (via control API or programmatic API)
  - Queries agent-registry for candidates and picks best target(s)
  - Emits task.routed on the message bus

- Executor (src/executor.ts / src/tools/task-executor.ts)
  - Sends task payload to chosen agent(s) using configured transport (HTTP, WebSocket, or in-process)
  - Handles retries, timeouts, and error handling
  - Emits task.completed or task.failed

- Store adapters (src/store/*.ts)
  - memory-store (fast ephemeral)
  - persistent-store (disk-backed, configurable storage.path)
  - Used for agent metadata, small persisted workflows, and caching

Data flow example:
1. An incoming request creates a Task object and calls runtime.createTask(task).
2. The runtime publishes task.created on message bus.
3. Task-router listens for task.created, queries agent-registry, then publishes task.routed with target agent(s).
4. Task-executor listens for task.routed, sends payload to agent(s), and on completion publishes task.completed.

File layout (important paths)
- src/index.ts — runtime bootstrap and exports
- src/cli.ts — command line entry
- src/tools/* — built-in tools (agent-registry, task-router, task-executor, logger, stores)
- src/toolRegistry.ts — central tool registry
- src/agentRegistry.ts — agent metadata service
- src/executor.ts — task execution pipeline
- src/router.ts — routing implementation
- src/store/* — store adapters (memoryStore.ts, diskStore.ts)
- config/agents.config.json — default configuration schema
- tests/* — unit and integration tests

Development
-----------
Getting set up
1. Clone monorepo and change to package directory:
cd packages/agents-core

2. Install dependencies:
npm install
kadi install

Build
- Local build for package:
npm run build
(typical scripts in package.json: "build": "tsc -p tsconfig.build.json")

Run (development)
- Start using kadi:
kadi run start --workspace=agents-core

- Or run directly (when compiled):
node dist/index.js --config config/agents.config.json

Testing
- Run unit and integration tests:
kadi run test
or
npm test

Linting / Formatting
- Lint:
kadi run lint
or
npm run lint

Extending tools
- Add a new tool under src/tools/my-tool.ts and export a factory in src/tools/index.ts.
- Register it with the tool registry in src/index.ts or via a plugin loader.

API (programmatic)
- Basic runtime bootstrap:
const { createRuntime } = require('agents-core')
const runtime = createRuntime({ configPath: './config/agents.config.json' })
await runtime.start()
const task = { id: 't1', type: 'compute', payload: { ... } }
await runtime.createTask(task)

Support and contributing
- Follow monorepo contribution guidelines in the repository root (CONTRIBUTING.md).
- Run tests and linters before submitting PRs.
- When adding tools, update the Tools table in this README and ensure tool exports are added to src/index.ts.

License
-------
See the repository root for licensing information.