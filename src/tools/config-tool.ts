/**
 * agents-docs-config — Read/describe current configuration.
 */

import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';

export function registerConfigTool(client: any, config: DocsConfig): void {
  client.registerTool(
    {
      name: 'agents-docs-config',
      description: 'Read and describe the current agent-docs configuration. Shows site settings, repo list, and agent config.',
      input: z.object({}),
    },
    async () => {
      return {
        success: true,
        config: {
          site: config.site,
          repoCount: Object.keys(config.repos).length,
          repos: Object.fromEntries(
            Object.entries(config.repos).map(([name, repo]) => [
              name,
              { type: repo.type, description: repo.description, crawl: repo.crawl },
            ]),
          ),
          output: config.output,
          agent: {
            name: config.agent.name,
            version: config.agent.version,
            brokers: Object.keys(config.agent.brokers),
            networks: config.agent.networks,
          },
        },
      };
    },
  );
}
