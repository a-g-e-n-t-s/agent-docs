---
title: Manifest
---

# agent-chatbot

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Type** | N/A |

## Abilities

- `secret-ability` ^0.7.0

## Brokers

- **default**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run preflight  # node -e "const fs=require('fs');if(!fs.existsSync('node_modules')){console.error('Dependencies not installed. Run: npm install');process.exit(1)}console.log('✓ Dependencies OK')"
kadi run setup  # npx tsc
kadi run start  # node dist/index.js
kadi run dev  # tsx watch src/index.ts
kadi run build  # tsc
kadi run type-check  # tsc --noEmit
kadi run lint  # eslint src --ext .ts
kadi run test  # vitest
```
