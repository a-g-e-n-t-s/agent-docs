---
title: Manifest
---

# agent-docs

> Documentation engine and KADI agent for the AGENTS ecosystem

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Type** | agent |
| **Entrypoint** | `dist/agent.js` |

## Abilities

- `secret-ability` ^0.9.3

## Brokers

- **local**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run setup  # npm install
kadi run start  # npx tsx src/agent.ts broker
kadi run sync  # npx tsx src/cli/sync.ts
kadi run build  # npx tsx src/cli/build.ts
```
