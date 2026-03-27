---
title: Manifest
---

# agent-expert

> AGENTS developer assistant — answers questions, writes TDDs, provides guides

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Type** | agent |
| **Entrypoint** | `dist/index.js` |

## Abilities

- `secret-ability` ^0.9.3

## Brokers

- **local**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run setup  # npm install
kadi run start  # node dist/index.js
```
