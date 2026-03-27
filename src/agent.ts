/**
 * AGENTS Docs Agent — entry point.
 *
 * Instantiates a KadiClient, loads abilities, registers tools,
 * and serves via stdio or broker.
 *
 * Run directly:  npx tsx src/agent.ts [stdio|broker]
 */

import { KadiClient } from '@kadi.build/core';
import { loadConfig } from './config/loader.js';
import { registerAllTools } from './tools/index.js';

async function main() {
  const config = loadConfig();

  // Transform broker strings into BrokerEntry objects
  const brokers: Record<string, { url: string; networks?: string[] }> = {};
  for (const [key, value] of Object.entries(config.agent.brokers)) {
    brokers[key] = { url: value, networks: config.agent.networks };
  }

  const client = new KadiClient({
    name: config.agent.name,
    version: config.agent.version,
    description: config.agent.description,
    defaultBroker: config.agent.defaultBroker,
    brokers,
  });

  // Load secret-ability (optional — needed for model API keys)
  let secrets: any = null;
  let modelApiKey: string | undefined;
  try {
    secrets = await client.loadNative('secret-ability');
    console.error('[agent-docs] secret-ability loaded');

    const getSecret = async (key: string): Promise<string | null> => {
      try {
        const result = await secrets!.invoke('get', { vault: 'models', key }) as { value?: string };
        return result?.value ?? null;
      } catch {
        try {
          const result = await secrets!.invoke('get', { vault: 'global', key }) as { value?: string };
          return result?.value ?? null;
        } catch {
          return null;
        }
      }
    };

    const mmKey = await getSecret('MEMORY_API_KEY');
    if (mmKey) {
      modelApiKey = mmKey;
      console.error('[agent-docs] MEMORY_API_KEY loaded from vault');
    }
  } catch {
    console.error('[agent-docs] secret-ability not available — model calls may fail');
  }

  // Load ability-docs-memory natively if installed, otherwise fall back to broker.
  let docsMemoryAbility: any = null;
  try {
    docsMemoryAbility = await client.loadNative('ability-docs-memory');
    console.error('[agent-docs] ability-docs-memory loaded natively');
  } catch {
    console.error('[agent-docs] ability-docs-memory not installed locally — search tools will use broker');
  }

  // Register all tools
  registerAllTools(client, config, secrets, modelApiKey, docsMemoryAbility);

  // Serve
  const mode = process.argv[2] === 'broker' ? 'broker' : 'stdio';
  console.error(`[agent-docs] starting in ${mode} mode`);
  await client.serve(mode as 'stdio' | 'broker');
}

main().catch((err) => {
  console.error('[agent-docs] Fatal:', err);
  process.exit(1);
});
