---
title: "agent-quest"
---

# agent-quest
> A Kadi agent that runs a two-part client/server app and connects to the Kadi broker.

Overview
--------
agent-quest is a kadi-agent packaged project that contains a client (Vite) and a server (TypeScript) portion. The agent is described by agent.json and expects to connect to a Kadi broker (default: ws://localhost:8080/kadi). The repository provides scripts for development, build, and packaging for the AGENTS / Kadi orchestration platform.

Quick Start
-----------
1. Install dependencies locally
```bash
npm install
```

2. Register the agent with your Kadi environment
```bash
kadi install
```
(kadi install reads agent.json and registers the agent with the platform/broker)

3. Start the agent via Kadi
```bash
kadi run start
```

Useful local commands
```bash
# Preflight checks (verifies node_modules exists)
npm run preflight

# Install all workspace dependencies and build everything
npm run setup

# Run both client and server in dev mode (hot reload)
npm run dev

# Build client and server for production
npm run build

# Start server only (server start script is configured under server/)
npm run start

# Run tests and linters for client/server
npm run test
npm run lint
npm run type-check
```

Tools
-----
| Tool | Description |
| ---- | ----------- |
| npm | Package manager used to install dependencies and run scripts (project uses root, client/, server/). |
| concurrently (^9.1.2) | Development helper to run client and server dev processes in parallel (used by npm run dev). |
| Vite | Client development server / build tool (invoked in client via npm run dev:client and build:client). |
| tsx | TypeScript runtime used to run server in dev mode (server dev: tsx watch src/index.ts). |
| tsc | TypeScript compiler (used in build steps and type-check script). |
| kadi | AGENTS / Kadi CLI used to install and run the agent on the orchestration platform (kadi install, kadi run start). |

Configuration
-------------
Primary configuration lives in agent.json at the project root. Key fields used by the agent-quest package:

- name: "agent-quest" — agent identifier
- version: "0.1.0"
- scripts: npm script shortcuts used for development and CI. Important scripts:
  - preflight — verifies node_modules exists
  - setup — installs all workspace dependencies and runs build
  - dev / dev:client / dev:server — local development (concurrently, vite, tsx)
  - build / build:client / build:server — production build steps
  - start — runs server start script (prefixed to server/)
  - install:all — installs root, client, and server dependencies
- build.default:
  - from: "node:20-alpine" — base image used by the Kadi build container
  - cli: "latest"
  - run: [ "npm ci --include=dev", "npx tsc", "npm prune --omit=dev" ] — commands executed during image build
  - env: { "NODE_ENV": "production" } — build-time environment
- brokers:
  - default: "ws://localhost:8080/kadi" — default WebSocket broker URL the agent will use to connect to Kadi

Files and paths of interest:
- agent.json (root) — agent manifest and configuration
- client/ — front-end application (Vite project)
- server/ — back-end agent runtime (TypeScript)
- server/src/index.ts — server entrypoint used by dev script (npm run dev:server uses tsx watch src/index.ts)

Architecture
------------
High-level data flow and key components:

- Client (client/):
  - Built with Vite.
  - Serves the browser UI, connects to the server portion or to Kadi as required by your application logic.
  - Development: run via `npx vite` (npm run dev:client).
  - Build output is produced by `npm run build --prefix client`.

- Server (server/):
  - TypeScript-based agent runtime. Entry: server/src/index.ts.
  - In development, server runs with tsx in watch mode (npm run dev:server).
  - In production, server is built via tsc and executed from the packaged image.

- Kadi Broker:
  - agent-quest expects a Kadi broker at the websocket URL configured in agent.json (brokers.default).
  - When the agent runs under the Kadi runtime, it connects to the broker and participates in messaging/orchestration.

- Build and Deployment:
  - The build section in agent.json defines a reproducible container build based on node:20-alpine.
  - Build steps run npm ci (including dev dependencies), run npx tsc to compile TypeScript, and prune devDependencies before finalizing the image.
  - The built artifact is intended to be deployed by the Kadi platform; kadi install registers the agent and kadi run start executes it.

Data flow summary:
1. Kadi platform launches the agent image on an orchestrated node.
2. Server connects to the broker at ws://localhost:8080/kadi and registers its presence/handlers.
3. Client (if served by the server or hosted separately) interacts with server or broker as designed by the agent logic.
4. Messages between agents and services flow via the Kadi broker channels.

Development
-----------
Local development workflow and notes:

1. Install dependencies
```bash
npm run install:all
# or
npm install
npm install --prefix client
npm install --prefix server
```

2. Run preflight checks
```bash
npm run preflight
```

3. Start development servers (client + server)
```bash
npm run dev
# runs concurrently:
#  - npm run dev:client  -> cd client && npx vite
#  - npm run dev:server  -> cd server && npx tsx watch src/index.ts
```

4. Build for production
```bash
npm run build
# builds client and server artifacts:
#  - npm run build:client -> npm run build --prefix client
#  - npm run build:server -> npm run build --prefix server
```

5. Start server (production style)
```bash
npm run start
# executes start script within server/ via npm run start --prefix server
```

6. Linting, testing, type checking
```bash
npm run lint       # runs lint in client and server projects
npm run test       # runs tests in client and server projects
npm run type-check # npx tsc --noEmit in client and server
```

Build/CI specifics
- The build image defined in agent.json uses:
  - from: node:20-alpine
  - run:
    - npm ci --include=dev
    - npx tsc
    - npm prune --omit=dev
  - NODE_ENV=production is set during the build.
- Ensure your CI environment has Docker or the Kadi build runner to use this configuration.

Notes and tips
- Keep agent.json in sync with any changes to the broker URL or build steps.
- The dev workflow depends on concurrently and tsx for hot reloading; if you change those entrypoints, update the scripts in agent.json.
- If Kadi CLI is not available, ask your platform operator for the correct kadi client binary or path.

License and contact
-------------------
Refer to the repository root for license and maintainer contact information. If you need to integrate with a specific Kadi broker endpoint, update brokers.default in agent.json before running kadi install.