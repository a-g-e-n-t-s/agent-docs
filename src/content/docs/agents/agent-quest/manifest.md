---
title: Manifest
---

# agent-quest

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Type** | N/A |

## Brokers

- **default**: `ws://localhost:8080/kadi`

## Scripts

```bash
kadi run preflight  # node -e "const fs=require('fs');if(!fs.existsSync('node_modules')){console.error('Dependencies not installed. Run: npm install');process.exit(1)}console.log('✓ Dependencies OK')"
kadi run setup  # npm run install:all && npm run build
kadi run dev  # npx concurrently --raw --kill-others-on-fail "npm run dev:client" "npm run dev:server"
kadi run dev:client  # cd client && npx vite
kadi run dev:server  # cd server && npx tsx watch src/index.ts
kadi run build  # npm run build:client && npm run build:server
kadi run build:client  # npm run build --prefix client
kadi run build:server  # npm run build --prefix server
kadi run start  # npm run start --prefix server
kadi run install:all  # npm install && npm install --prefix client && npm install --prefix server
kadi run lint  # npm run lint --prefix client && npm run lint --prefix server
kadi run test  # npm run test --prefix client && npm run test --prefix server
kadi run type-check  # npx tsc --noEmit --prefix client && npx tsc --noEmit --prefix server
```
