# {name}

> {description}

## Prerequisites

- Node.js 22+
- KADI CLI (`npm i -g @kadi.build/cli`)

## Quick Start

```bash
kadi install
kadi run start
```

## Architecture

<!-- Describe the agent's role, how it connects to the broker, and what tools it provides -->

## Tools

| Tool | Description |
|------|-------------|
<!-- List all registered tools -->

## Configuration

### agent.json

<!-- Key configuration fields -->

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
<!-- List env vars -->

### Secrets (vault)

<!-- List required/optional vault keys -->

## Deployment

```bash
kadi deploy --profile local
```

## Development

```bash
npm install
npm run dev
```

## Project Structure

```
{name}/
├── agent.json
├── package.json
├── src/
│   └── index.ts
└── tsconfig.json
```

## License

MIT
