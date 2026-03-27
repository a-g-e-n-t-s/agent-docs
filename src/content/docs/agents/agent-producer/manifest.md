---
title: Manifest
---

# agent-producer

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Type** | N/A |

## Abilities

- `secret-ability` ^0.9.4

## Brokers

- **default**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run preflight  # node -e "const fs=require('fs');if(!fs.existsSync('node_modules')){console.error('Dependencies not installed. Run: npm install');process.exit(1)}console.log('✓ Dependencies OK')"
kadi run setup  # npx tsc
kadi run start  # node dist/index.js
kadi run dev  # npx tsx watch src/index.ts
kadi run build  # npx tsc
kadi run type-check  # npx tsc --noEmit
kadi run lint  # npx eslint src --ext .ts
kadi run test  # npx vitest
```

## Deploy Profiles

### akash-mainnet

- **Target**: akash
- **Engine**: podman
- **Services**: app
