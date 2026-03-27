/**
 * agents-docs-status — Show sync state, repo health, and index status.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export function registerStatusTool(client: any, config: DocsConfig): void {
  client.registerTool(
    {
      name: 'agents-docs-status',
      description: 'Show documentation system status: configured repos, sync state, and build health.',
      input: z.object({}),
    },
    async () => {
      const repos: Record<string, { exists: boolean; type: string; hasReadme: boolean }> = {};

      for (const [name, repo] of Object.entries(config.repos)) {
        const repoPath = path.resolve(PROJECT_ROOT, repo.path);
        const exists = fs.existsSync(repoPath);
        const hasReadme = exists && fs.existsSync(path.join(repoPath, 'README.md'));

        repos[name] = { exists, type: repo.type, hasReadme };
      }

      const totalRepos = Object.keys(repos).length;
      const availableRepos = Object.values(repos).filter(r => r.exists).length;
      const withReadme = Object.values(repos).filter(r => r.hasReadme).length;

      return {
        success: true,
        site: config.site,
        repos,
        summary: {
          total: totalRepos,
          available: availableRepos,
          withReadme,
          missing: totalRepos - availableRepos,
        },
      };
    },
  );
}
