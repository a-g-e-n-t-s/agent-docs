/**
 * agents-docs-pipeline — Full sync → index pipeline.
 *
 * Orchestrates: sync repos → collect pages → reindex into ArcadeDB.
 * Runs as a background task, returns taskId immediately.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';
import { startTask, getTask } from '../utils/tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

export function registerPipelineTool(
  client: any,
  config: DocsConfig,
  docsMemoryAbility?: any,
): void {
  client.registerTool(
    {
      name: 'agents-docs-pipeline',
      description:
        'Full documentation pipeline: sync repos → collect markdown → reindex into ArcadeDB. ' +
        'Runs as a background task and returns a taskId for polling.',
      input: z.object({
        repos: z.array(z.string()).optional()
          .describe('Specific repos to process (default: all)'),
        skipIndex: z.boolean().optional()
          .describe('Skip ArcadeDB reindexing (default: false)'),
        collection: z.string().optional()
          .describe('Target collection name (default: agents-docs)'),
      }),
    },
    async (input: { repos?: string[]; skipIndex?: boolean; collection?: string }) => {
      const taskId = startTask(async () => {
        const startTime = Date.now();
        const collection = input.collection ?? 'agents-docs';

        // Step 1: Sync — collect markdown files
        console.error('[pipeline] Step 1: Syncing repos…');
        const reposToSync = input.repos
          ? Object.entries(config.repos).filter(([name]) => input.repos!.includes(name))
          : Object.entries(config.repos);

        const pages: Array<{
          title: string;
          slug: string;
          pageUrl: string;
          source: string;
          content: string;
        }> = [];

        for (const [name, repo] of reposToSync) {
          const repoPath = path.resolve(PROJECT_ROOT, repo.path);
          if (!fs.existsSync(repoPath)) continue;

          // Collect markdown files
          const mdFiles = collectMarkdownFiles(repoPath, repo.crawl);
          for (const file of mdFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const relativePath = path.relative(repoPath, file);
            const slug = `${name}/${relativePath.replace(/\.md$/, '').replace(/\\/g, '/')}`;
            const title = extractTitle(content) ?? `${name}/${relativePath}`;

            pages.push({
              title,
              slug,
              pageUrl: `${config.site.baseUrl}docs/${slug}`,
              source: `${name}/${relativePath}`,
              content,
            });
          }

          // Also parse agent.json if it exists
          const agentJsonPath = path.join(repoPath, 'agent.json');
          if (fs.existsSync(agentJsonPath)) {
            try {
              const agentJson = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8'));
              const agentDoc = generateAgentJsonDoc(name, agentJson);
              pages.push({
                title: `${name} — Agent Manifest`,
                slug: `${name}/agent-manifest`,
                pageUrl: `${config.site.baseUrl}docs/${name}/agent-manifest`,
                source: `${name}/agent.json`,
                content: agentDoc,
              });
            } catch {
              // Skip malformed agent.json
            }
          }
        }

        console.error(`[pipeline] Step 1 done: ${pages.length} pages collected`);

        // Step 2: Reindex into ArcadeDB
        if (!input.skipIndex && pages.length > 0) {
          console.error(`[pipeline] Step 2: Reindexing ${pages.length} pages into collection "${collection}"…`);

          try {
            const reindexPayload = { pages, collection, clearExisting: true };
            const result = docsMemoryAbility
              ? await docsMemoryAbility.invoke('docs-reindex', reindexPayload)
              : await client.invokeRemote('docs-reindex', reindexPayload);
            console.error(`[pipeline] Step 2 done:`, JSON.stringify(result));
          } catch (err: any) {
            console.error(`[pipeline] Step 2 failed: ${err?.message ?? err}`);
          }
        } else if (input.skipIndex) {
          console.error('[pipeline] Step 2: Skipped (skipIndex=true)');
        }

        return {
          pages: pages.length,
          repos: reposToSync.length,
          collection,
          durationMs: Date.now() - startTime,
        };
      });

      return {
        success: true,
        taskId,
        message: 'Pipeline started in background. Use agents-docs-task-status to poll.',
      };
    },
  );
}

function collectMarkdownFiles(repoPath: string, patterns: string[]): string[] {
  const files: string[] = [];

  const walkDir = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
          if (patterns.some(p => matchesPattern(relativePath, p))) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Permission error or similar — skip
    }
  };

  walkDir(repoPath);
  return files;
}

function matchesPattern(filePath: string, pattern: string): boolean {
  if (pattern === filePath) return true;
  if (pattern.startsWith('**/')) return filePath.endsWith(pattern.slice(3));
  if (pattern.includes('**')) {
    const [prefix, suffix] = pattern.split('**');
    return filePath.startsWith(prefix.replace(/\/$/, '')) && filePath.endsWith(suffix.replace(/^\//, ''));
  }
  return filePath === pattern;
}

function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function generateAgentJsonDoc(name: string, agent: any): string {
  const lines: string[] = [];
  lines.push(`# ${agent.name ?? name}`);
  if (agent.description) lines.push(`\n> ${agent.description}`);
  lines.push(`\n## Metadata`);
  lines.push(`- **Type:** ${agent.type ?? 'unknown'}`);
  lines.push(`- **Version:** ${agent.version ?? 'unknown'}`);

  if (agent.abilities && Object.keys(agent.abilities).length > 0) {
    lines.push(`\n## Abilities`);
    for (const [ability, version] of Object.entries(agent.abilities)) {
      lines.push(`- \`${ability}\`: ${version}`);
    }
  }

  if (agent.brokers && Object.keys(agent.brokers).length > 0) {
    lines.push(`\n## Brokers`);
    for (const [broker, url] of Object.entries(agent.brokers)) {
      lines.push(`- **${broker}:** \`${url}\``);
    }
  }

  if (agent.scripts && Object.keys(agent.scripts).length > 0) {
    lines.push(`\n## Scripts`);
    for (const [script, cmd] of Object.entries(agent.scripts)) {
      lines.push(`- \`${script}\`: \`${cmd}\``);
    }
  }

  return lines.join('\n');
}
