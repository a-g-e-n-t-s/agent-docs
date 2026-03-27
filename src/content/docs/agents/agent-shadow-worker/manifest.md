---
title: Manifest
---

# shadow-agent-worker

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Type** | N/A |

## Brokers

- **default**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run preflight  # node -e "const fs=require('fs');if(!fs.existsSync('node_modules')){console.error('Dependencies not installed. Run: npm install');process.exit(1)}console.log('✓ Dependencies OK')"
kadi run setup  # npx tsc
kadi run start  # node dist/index.js
kadi run start:artist  # AGENT_ROLE=artist node dist/index.js
kadi run start:designer  # AGENT_ROLE=designer node dist/index.js
kadi run start:programmer  # AGENT_ROLE=programmer node dist/index.js
kadi run dev  # tsx watch src/index.ts
kadi run dev:artist  # AGENT_ROLE=artist tsx watch src/index.ts
kadi run dev:designer  # AGENT_ROLE=designer tsx watch src/index.ts
kadi run dev:programmer  # AGENT_ROLE=programmer tsx watch src/index.ts
kadi run build  # tsc
kadi run type-check  # tsc --noEmit
kadi run lint  # eslint src --ext .ts
kadi run test  # vitest
```
