/**
 * Tool registry — registers all agent-docs tools with the KadiClient.
 */

import type { DocsConfig } from '../config/types.js';
import { registerStatusTool } from './status.js';
import { registerConfigTool } from './config-tool.js';
import { registerSyncTool } from './sync.js';
import { registerPipelineTool } from './pipeline.js';
import { registerSearchTools } from './search-tools.js';
import { registerReadmeLintTool } from './readme-lint.js';
import { registerReadmeGenerateTool } from './readme-generate.js';
import { registerTaskStatusTool } from './task-status.js';

export function registerAllTools(
  client: any,
  config: DocsConfig,
  secrets?: any,
  apiKey?: string,
  docsMemoryAbility?: any,
): void {
  registerStatusTool(client, config);
  registerConfigTool(client, config);
  registerSyncTool(client, config);
  registerPipelineTool(client, config, docsMemoryAbility);
  registerSearchTools(client, config, apiKey, docsMemoryAbility);
  registerReadmeLintTool(client, config);
  registerReadmeGenerateTool(client, config);
  registerTaskStatusTool(client);

  console.error('[tools] registered all agents-docs tools');
}
