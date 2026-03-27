/**
 * agents-docs-sync — Crawl configured repos and collect documentation files.
 *
 * Reads markdown files from each repo according to its crawl patterns,
 * copies them into the docs/ directory for site building.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

export function registerSyncTool(client: any, config: DocsConfig): void {
  client.registerTool(
    {
      name: 'agents-docs-sync',
      description:
        'Crawl all configured repos and collect documentation files into the docs/ directory. ' +
        'Reads markdown files according to each repo\'s crawl patterns.',
      input: z.object({
        repos: z.array(z.string()).optional()
          .describe('Specific repos to sync (default: all)'),
        dryRun: z.boolean().optional()
          .describe('List files that would be synced without copying (default: false)'),
      }),
    },
    async (input: { repos?: string[]; dryRun?: boolean }) => {
      const startTime = Date.now();
      const reposToSync = input.repos
        ? Object.entries(config.repos).filter(([name]) => input.repos!.includes(name))
        : Object.entries(config.repos);

      const results: Record<string, { files: string[]; errors: string[] }> = {};
      let totalFiles = 0;

      for (const [name, repo] of reposToSync) {
        const repoPath = path.resolve(PROJECT_ROOT, repo.path);
        const repoResult: { files: string[]; errors: string[] } = { files: [], errors: [] };

        if (!fs.existsSync(repoPath)) {
          repoResult.errors.push(`Repo path not found: ${repoPath}`);
          results[name] = repoResult;
          continue;
        }

        // Determine output subdirectory based on repo type
        const outputSubdir = getOutputSubdir(name, repo.type);
        const outputDir = path.join(DOCS_DIR, outputSubdir);

        for (const pattern of repo.crawl) {
          try {
            const matches = await globFiles(repoPath, pattern);
            for (const file of matches) {
              const relativePath = path.relative(repoPath, file);
              const destPath = path.join(outputDir, relativePath);

              if (!input.dryRun) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(file, destPath);
              }

              repoResult.files.push(relativePath);
              totalFiles++;
            }
          } catch (err) {
            repoResult.errors.push(`Pattern "${pattern}": ${(err as Error).message}`);
          }
        }

        results[name] = repoResult;
      }

      return {
        success: true,
        dryRun: input.dryRun ?? false,
        totalFiles,
        repos: results,
        durationMs: Date.now() - startTime,
      };
    },
  );
}

function getOutputSubdir(name: string, type: string): string {
  switch (type) {
    case 'kadi-monorepo': return 'architecture';
    case 'kadi-agent': return `agents/${name}`;
    case 'kadi-ability': return `abilities/${name}`;
    case 'kadi-package': return `packages/${name}`;
    case 'cpp-engine': return 'engine';
    case 'cpp-game': return 'daemon-agent';
    default: return name;
  }
}

async function globFiles(cwd: string, pattern: string): Promise<string[]> {
  const files: string[] = [];
  const simplePattern = pattern.replace('**/', '').replace('*', '');
  const walkDir = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(cwd, fullPath).replace(/\\/g, '/');
          if (matchesGlob(relativePath, pattern)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Permission error or similar — skip
    }
  };
  walkDir(cwd);
  return files;
}

function matchesGlob(filePath: string, pattern: string): boolean {
  // Simple glob matching for common patterns
  const normalized = filePath.replace(/\\/g, '/');

  if (pattern === 'README.md') return normalized.endsWith('README.md') && !normalized.includes('/');
  if (pattern === 'CLAUDE.md') return normalized.endsWith('CLAUDE.md') && !normalized.includes('/');
  if (pattern === 'agent.json') return normalized.endsWith('agent.json') && !normalized.includes('/');

  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    return normalized.endsWith(suffix);
  }

  if (pattern.includes('**')) {
    const [prefix, suffix] = pattern.split('**');
    return normalized.startsWith(prefix.replace(/\/$/, '')) && normalized.endsWith(suffix.replace(/^\//, ''));
  }

  return normalized === pattern;
}
