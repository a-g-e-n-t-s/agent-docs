---
title: "agent-qa"
---

# agent-qa
> QA-oriented KADI agent that performs semantic validation and heuristic scoring for task reviews.

Overview
--------
agent-qa is a KADI (kadi-agent) that subscribes to review tasks and performs semantic validation using an LLM provider (Model Manager or Anthropic) with a heuristic fallback. It uses agents-library's BaseAgent to connect to a KADI broker, exposes memory-backed pattern recall, and registers a validation handler to score and review tasks published to the broker.

Quick Start
-----------
1. Install dependencies:
- `npm install`

2. Install the agent into KADI (local KADI CLI):
- `kadi install`

3. Start the agent:
- `kadi run start`

Quick development / local run
- Check prerequisites (script verifies node_modules): `npm run preflight`
- Run in watch-mode (ts -> node via tsx): `npm run dev`
- Build TypeScript: `npm run build` or `npm run setup`
- Start compiled output: `npm run start`

Tools
-----
| Tool | Description |
|------|-------------|
| broker (KADI WS) | WebSocket broker used for messaging. Default URL: `ws://localhost:8080/kadi` (configured in agent.json and overridable with `KADI_BROKER_URL`). |
| model-manager | Primary provider option when `MODEL_MANAGER_BASE_URL` and `MODEL_MANAGER_API_KEY` are provided. Used as primary LLM provider via agent providerManager integration. |
| anthropic | Fallback or primary provider using `ANTHROPIC_API_KEY` with `@anthropic-ai/sdk`. Used when Model Manager is not configured. |
| secret-ability | Declared ability in `agent.json` ("secret-ability": "^0.9.3"). Registered ability package required by this agent. |
| validation handler (`src/handlers/validation.js`) | Registers to `task.review_requested` events and scores/reviews tasks. Uses `baseAgent.providerManager` (LLM) and `baseAgent.memoryService` (past pattern recall) when available. |
| memory service (BaseAgent.memoryService) | Persistent memory-backed service. Data path default: `./data/memory` or the `MEMORY_DATA_PATH` env var. Used to recall past patterns for validation. |
| provider manager (BaseAgent.providerManager) | Abstracted provider layer that routes requests to Model Manager or Anthropic depending on configuration. |

Configuration
-------------
agent configuration is assembled in src/index.ts and can be set via environment variables or a secrets vault (vault loaded via agents-library). Environment variables take precedence over vault values.

Primary environment variables
- `KADI_NETWORK` — Comma-separated networks the agent will join. Default: `qa,eval,vision`.
- `KADI_BROKER_URL` — WebSocket broker URL. Default: `ws://localhost:8080/kadi`.
- `ANTHROPIC_API_KEY` — API key for Anthropic (if used as primary or fallback).
- `MODEL_MANAGER_BASE_URL` — Base URL for Model Manager (if using model-manager).
- `MODEL_MANAGER_API_KEY` — API key for Model Manager.
- `MEMORY_DATA_PATH` — Filesystem path for memory persistence. Default: `./data/memory`.

Provider selection behavior (implemented in src/index.ts -> buildProviderConfig)
- If `MODEL_MANAGER_BASE_URL` and `MODEL_MANAGER_API_KEY` are provided:
  - The agent configures `model-manager` as `primaryProvider`.
  - If `ANTHROPIC_API_KEY` is also present, `anthropic` is configured as `fallbackProvider`.
- If only `ANTHROPIC_API_KEY` is provided:
  - `anthropic` is configured as `primaryProvider`.
- If no provider credentials are available:
  - `baseAgent.providerManager` is not configured; the agent falls back to heuristic-only scoring and emits a warning: "No LLM provider configured — semantic review disabled, using heuristic-only scoring".

Files and important config locations
- Agent metadata: `agent.json` (name, version, scripts, build config, abilities, brokers)
- Entrypoint: `src/index.ts`
- Validation handler: `src/handlers/validation.js`
- Memory default path: `./data/memory` (override with `MEMORY_DATA_PATH`)

Architecture
------------
High-level components and data flow:
1. BaseAgent
   - Implemented by agents-library and constructed in `src/index.ts` with fields:
     - `agentId` (agent-qa), `agentRole` (`programmer`), `version` (`1.0.0`), `brokerUrl`, `networks`, `provider` (if configured), `memory.dataPath`.
   - Exposes `client`, `providerManager`, and `memoryService`.
2. Broker (WebSocket)
   - The agent connects to the KADI broker at `KADI_BROKER_URL` (default `ws://localhost:8080/kadi`) using BaseAgent.client to subscribe and publish KADI messages.
3. Validation Handler (src/handlers/validation.js)
   - Subscribes to `task.review_requested` messages on the broker via the `client`.
   - When a review request arrives:
     - If `providerManager` is available, it requests an LLM-based semantic review (primary = Model Manager or Anthropic) to compute semantic scores and textual feedback.
     - It uses `memoryService` to fetch past patterns and context for better recall and consistent scoring.
     - If `providerManager` is not available, it falls back to heuristic-only scoring (non-LLM logic).
   - The handler publishes results/decisions back to the KADI broker (task response events).
4. Provider Manager
   - Routes LLM calls to Model Manager or Anthropic according to config. Model Manager is preferred if configured.
5. Memory Service
   - Stores and retrieves past patterns to improve validation decisions and enable recall.

Key runtime behaviors
- Credentials are loaded via `loadVaultCredentials()` from agents-library, then environment variables override vault values.
- The agent logs start-up and provider status via agents-library logger and timer utilities.
- On failure during startup the process exits with code 1 after logging the error.

Development
-----------
Scripts (from agent.json / package.json)
- `npm run preflight` — Checks that dependencies are installed (`node -e ...`).
- `npm run setup` — `npx tsc` (compile TypeScript).
- `npm run start` — `node dist/index.js` (run compiled JS).
- `npm run dev` — `tsx watch src/index.ts` (fast local development with watch).
- `npm run build` — `tsc` (TypeScript build).
- `npm run type-check` — `tsc --noEmit` (type-only checking).
- `npm run lint` — `eslint src --ext .ts`
- `npm run test` — `vitest`

Building for production
- agent.json includes a build section with a default image: `node:20-alpine`. Build steps:
  - `npm ci --include=dev`
  - `npx tsc`
  - `npm prune --omit=dev`
- Environment `NODE_ENV` is set to `production` in the build configuration.

Dependencies (high-level)
- Runtime: `@anthropic-ai/sdk`, `agents-library` (local file reference), `dotenv`, `zod`, `@kadi.build/core` (local file reference)
- Dev: TypeScript, ESLint, Vitest, tsx

Recommended workflow
1. Populate credentials (env preferred). Example:
   - `export KADI_BROKER_URL="ws://localhost:8080/kadi"`
   - `export MODEL_MANAGER_BASE_URL="https://model-manager.example"`
   - `export MODEL_MANAGER_API_KEY="mm-xxxx"`
   - or `export ANTHROPIC_API_KEY="anthropic-xxxx"`
2. Run `npm run preflight` to ensure deps installed.
3. For development: `npm run dev`
4. For production: `npm run build` then `kadi run start` (or `npm run start` inside the built artifact)

Notes and troubleshooting
- If no provider credentials are supplied, the agent will run but only perform heuristic validation. Check logs for: "No LLM provider configured — semantic review disabled, using heuristic-only scoring".
- Networks default to `qa,eval,vision` but can be overridden with `KADI_NETWORK`.
- If you use a secrets vault, agents-library's `loadVaultCredentials()` will fetch vault secrets; environment variables override vault values.
- Ensure `agent.json` brokers field matches your running KADI broker or set `KADI_BROKER_URL` to the correct value.

Contact / Contributing
----------------------
- See repository root for contribution guidelines and code of conduct.
- For issues specific to agent behavior, include runtime logs and the environment variable set used to start the agent.

License
-------
- See repository root for license details.