# agent-lead

> Lead agent for coordinating tasks, verifying work, managing PR workflows and cleaning up quests in a Kadi-based multi-agent system.

Overview
--------
agent-lead is a kadi-agent (type: kadi-agent) that acts as a "lead" for different team roles (artist, designer, programmer). It registers with the Quest MCP, publishes a heartbeat, and attaches a set of handlers to coordinate task reception, verification, PR/workflow orchestration and quest cleanup. The agent is implemented in TypeScript and built to run via the Kadi runtime (Kadi broker interactions are performed through @kadi.build/core).

Quick Start
-----------
1. Install project dependencies:
npm install

2. Install Kadi runtime (if you use the Kadi CLI/local runtime):
kadi install

3. Start the agent via Kadi (or run locally):
kadi run start

Alternatively run locally with npm scripts:
- Build and run the production output:
npm run setup
npm run start

- Run in development (watch + TS execution):
npm run dev
npm run dev:artist   # run as artist role
npm run dev:designer # run as designer role
npm run dev:programmer # run as programmer role

You can also start a built artifact for a specific role:
npm run start:artist
npm run start:designer
npm run start:programmer

Tools
-----
| Tool | Description |
|------|-------------|
| setupTaskReceptionHandler | Handler that wires task reception flows (accepts tasks from quest/producer networks and begins coordination). Located at src/handlers/task-reception.ts |
| setupTaskVerificationHandler | Handler that handles task verification flows (verifies completed tasks, interacts with QA/quest systems). Located at src/handlers/task-verification.ts |
| setupPrWorkflowHandler | Handler that manages PR creation and workflow tasks (creates PRs and coordinates deploy/git interactions). Located at src/handlers/pr-workflow.ts |
| setupQuestCleanupHandler | Handler that performs quest cleanup tasks (removes or finalizes stale/finished quests). Located at src/handlers/quest-cleanup.ts |

Configuration
-------------
The agent reads configuration from:
- agent.json (root) — contains package metadata, build instructions, abilities and default broker URL
  - abilities.secret-ability — declared ability dependency in agent.json
  - brokers.default — default broker URL (ws://localhost:8080/kadi)
- Environment variables (dotfile support via dotenv)
  - AGENT_ROLE — role for this instance. Valid values: artist, designer, programmer. Default: programmer
  - KADI_BROKER_URL — broker URL override. Default: ws://localhost:8080/kadi

Key runtime defaults and values in code:
- Valid roles: ['artist', 'designer', 'programmer']
- Role-based network mapping (ROLE_NETWORKS in src/index.ts):
  - artist → ['producer', 'artist', 'git', 'qa', 'quest', 'file', 'global']
  - designer → ['producer', 'designer', 'git', 'qa', 'quest', 'file', 'global']
  - programmer → ['producer', 'programmer', 'git', 'qa', 'deploy', 'quest', 'file', 'global']
- Agent naming:
  - agentName = `agent-lead-${role}`
- Registration payload fields (used in registerAgent):
  - name: "Lead <Role> Agent"
  - role: agentRole
  - capabilities: ['task-coordination','task-verification','pr-creation','workflow-management']
  - maxConcurrentTasks: 10
- Heartbeat:
  - Sent every 30 seconds to the Quest MCP via RPC 'quest_quest_agent_heartbeat'

Source files and build outputs:
- Source: src/index.ts (entry), src/handlers/*.ts (handlers)
- Built output: dist/index.js (npm run setup | npm run build emits these)
- Main runtime start: npm run start -> node dist/index.js (or use kadi run start)

Note on credentials:
- The agent imports loadVaultCredentials from agents-library and dotenv/config to obtain secrets/credentials. Credentials are expected to be managed by your runtime/vault and the agents-library helpers.

Architecture
------------
This section describes the data flow and key components.

Key components
- BaseAgent (agents-library): provides the foundational agent lifecycle, registration to brokers and logging primitives.
- KadiClient (@kadi.build/core): RPC client used to invoke remote procedures on MCP services (quest_quest_register_agent, quest_quest_agent_heartbeat, quest_quest_unregister_agent).
- Handlers (src/handlers/*.ts): role-specific functional modules that implement the agent's behavior:
  - task-reception: receives tasks from the quest/producer network and enqueues/assigns them.
  - task-verification: validates completed tasks and communicates with QA/quest services.
  - pr-workflow: orchestrates PR creation and related git/workflow operations.
  - quest-cleanup: periodic cleanup for finished or stale quests.
- Provider config / Model manager: the code builds a provider config (model manager primary, Anthropic as fallback) to configure LLM/model providers for verification/workflow steps. Provider credentials are loaded via loadVaultCredentials.

Data flow
1. Startup:
   - src/index.ts validates AGENT_ROLE and builds agentName and networks.
   - Agent connects to the broker at KADI_BROKER_URL (default ws://localhost:8080/kadi) using KadiClient.
2. Registration:
   - registerAgent invokes 'quest_quest_register_agent' with agent details (capabilities, maxConcurrentTasks).
   - The returned payload is parsed to confirm registration.
3. Heartbeat:
   - The agent sends periodic heartbeats to 'quest_quest_agent_heartbeat' (status: available, currentTasks: [], timestamp).
   - Heartbeats run every 30 seconds via startHeartbeat.
4. Task handling:
   - Registered handlers (task-reception, task-verification, pr-workflow, quest-cleanup) subscribe to relevant network events and RPCs through the BaseAgent/KadiClient and perform business logic.
   - Handlers communicate back to Quest MCP or other services via Kadi RPCs.
5. Shutdown:
   - On graceful shutdown the agent calls unregisterAgent which invokes 'quest_quest_unregister_agent' with a reason.

Development
-----------
Local development workflow:
- Install:
npm install

- Type-check:
npm run type-check

- Build:
npm run build
or
npm run setup (runs npx tsc to compile)

- Run (development watch):
npm run dev
# Run with role overlay:
npm run dev:artist
npm run dev:designer
npm run dev:programmer

- Run (production / compiled):
npm run start
npm run start:artist
npm run start:designer
npm run start:programmer

- Lint:
npm run lint

- Tests:
npm run test

Helpful notes:
- Preflight check: npm run preflight verifies node_modules is installed and will print a helpful message if dependencies are missing.
- The project uses tsx for fast TypeScript execution in dev and tsc for building a dist/ output.
- Source entry:
  - src/index.ts — main bootstrapping, registration, heartbeat and handler wiring
  - src/handlers/*.ts — individual handler implementations
- The package declares an ability dependency in agent.json:
  - abilities.secret-ability: ^0.9.3
- The default broker entry in agent.json:
  - brokers.default: ws://localhost:8080/kadi

If you need to adapt provider credentials or add new handlers, implement them under src/handlers and wire them into src/index.ts using the same pattern as setupTaskReceptionHandler, setupTaskVerificationHandler, setupPrWorkflowHandler, and setupQuestCleanupHandler.