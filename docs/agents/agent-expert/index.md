# agent-expert

> AGENTS developer assistant — answers questions, writes TDDs, provides guides

## Quick Start

```bash
cd agent-expert
npm install
kadi install
kadi run start
```

## Tools

| Tool | Description |
|------|-------------|
| *(Run `kadi run start` and check broker for registered tools)* | |

## Configuration

### agent.json

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Type** | agent |
| **Entrypoint** | `dist/index.js` |

### Abilities

- `secret-ability` ^0.9.3

### Brokers

- **local**: `ws://localhost:8080/kadi`

## Architecture

<!-- TODO: Add Architecture content -->

## Development

```bash
npm install
npm run build
kadi run start
```
