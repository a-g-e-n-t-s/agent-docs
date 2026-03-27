---
title: Introduction
description: Multi-Agent Orchestration Platform — build, deploy, and orchestrate AI agents
---

**Multi-Agent Orchestration Platform** — build, deploy, and orchestrate AI agents with tools, abilities, and distributed messaging.

## What is AGENTS?

AGENTS is a monorepo containing a complete multi-agent system for software development orchestration. It includes:

- **Agents** — Specialized AI agents (producer, worker, lead, QA, chatbot, quest, expert, docs, builder)
- **Abilities** — Reusable capability modules (graph, search, memory, ArcadeDB, secrets, vision, eval, file ops, docs-memory)
- **Infrastructure** — Broker-based messaging, MCP servers, deployment tooling
- **Engine** — Daemon Engine (C++20 game engine with DirectX 11, V8 scripting)
- **DaemonAgent** — Dual-language game project (C++20 + TypeScript)

## Architecture Overview

```
Agents:
  agent-producer → agent-worker, agent-lead, agent-qa
  agent-chatbot → agent-producer
  agent-expert → docs-search → ability-docs-memory

Abilities:
  ability-graph, ability-search, ability-memory
  ability-arcadedb, ability-secret, ability-vision
  ability-eval, ability-file-*, ability-docs-memory

Infrastructure:
  kadi-broker (messaging), mcp-server-quest, mcp-server-git

Data flow:
  worker/lead/qa → ability-memory → ability-graph → ability-arcadedb → ArcadeDB
  agent-expert → docs-search → ability-docs-memory → ability-graph → ArcadeDB
```

## Quick Links

| Category | Packages |
|----------|----------|
| **Agents** | [producer](/agents/agent-producer/), [worker](/agents/agent-worker/), [lead](/agents/agent-lead/), [qa](/agents/agent-qa/), [chatbot](/agents/agent-chatbot/), [quest](/agents/agent-quest/), [expert](/agents/agent-expert/), [docs](/agents/agent-docs/) |
| **Abilities** | [graph](/abilities/ability-graph/), [search](/abilities/ability-search/), [memory](/abilities/ability-memory/), [arcadedb](/abilities/ability-arcadedb/), [secret](/abilities/ability-secret/), [docs-memory](/abilities/ability-docs-memory/) |
| **MCP Servers** | [quest](/packages/mcp-server-quest/), [git](/packages/mcp-server-git/), [github](/packages/mcp-server-github/) |
| **Engine** | [Daemon Engine](/engine/), [DaemonAgent](/daemon-agent/) |
