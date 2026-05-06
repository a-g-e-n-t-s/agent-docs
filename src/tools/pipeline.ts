/**
 * agents-docs-pipeline — Full sync → index pipeline.
 *
 * Orchestrates: sync repos → collect pages → chunk+embed via graph-index → create edges.
 * Calls ability-graph's graph-index directly (no ability-docs-memory dependency for indexing).
 * Runs as a background task, returns taskId immediately.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';
import { startTask } from '../utils/tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_COLLECTION = 'agents-docs';
const DEFAULT_DATABASE = 'kadi';
const MAX_TOKENS_PER_CHUNK = 500;
const INDEX_CONCURRENCY = 5;

interface IndexedPage {
  slug: string;
  chunkRids: string[];
}

export function registerPipelineTool(
  client: any,
  config: DocsConfig,
): void {
  client.registerTool(
    {
      name: 'agents-docs-pipeline',
      description:
        'Full documentation pipeline: sync repos → collect markdown → chunk+embed via graph-index → create edges. ' +
        'Runs as a background task and returns a taskId for polling.',
      input: z.object({
        repos: z.array(z.string()).optional()
          .describe('Specific repos to process (default: all)'),
        skipIndex: z.boolean().optional()
          .describe('Skip graph indexing (default: false)'),
        collection: z.string().optional()
          .describe('Target collection name (default: agents-docs)'),
        database: z.string().optional()
          .describe('Target database (default: kadi)'),
      }),
    },
    async (input: { repos?: string[]; skipIndex?: boolean; collection?: string; database?: string }) => {
      const taskId = startTask(async () => {
        const startTime = Date.now();
        const collection = input.collection ?? DEFAULT_COLLECTION;
        const database = input.database ?? DEFAULT_DATABASE;

        // Step 1: Collect pages from repos
        console.error('[pipeline] Step 1: Collecting pages…');
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

          const crawlPatterns = (repo as any).indexCrawl ?? repo.crawl;
          const mdFiles = collectMarkdownFiles(repoPath, crawlPatterns);
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

          // Also parse agent.json
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
            } catch { /* skip malformed */ }
          }
        }

        console.error(`[pipeline] Step 1 done: ${pages.length} pages collected`);

        if (input.skipIndex || pages.length === 0) {
          return { pages: pages.length, repos: reposToSync.length, collection, indexed: false, durationMs: Date.now() - startTime };
        }

        // Step 2: Clear existing DocNodes in collection
        console.error(`[pipeline] Step 2: Clearing existing DocNodes in "${collection}"…`);
        try {
          await client.invokeRemote('graph-command', {
            database,
            command: `DELETE VERTEX DocNode WHERE collection = '${escapeSQL(collection)}'`,
          });
        } catch {
          // May fail if empty or type doesn't exist — safe to ignore
        }

        // Step 3: Index pages via graph-index (with concurrency limit)
        console.error(`[pipeline] Step 3: Indexing ${pages.length} pages via graph-index (concurrency: ${INDEX_CONCURRENCY})…`);

        const indexedPages: IndexedPage[] = [];
        let totalChunks = 0;
        let idx = 0;

        const worker = async () => {
          while (idx < pages.length) {
            const page = pages[idx++];
            try {
              const result = await client.invokeRemote('graph-index', {
                content: page.content,
                vertexType: 'DocNode',
                strategy: 'markdown-headers',
                maxTokens: MAX_TOKENS_PER_CHUNK,
                database,
                source: page.source,
                collection,
                properties: {
                  title: page.title,
                  slug: page.slug,
                  pageUrl: page.pageUrl,
                  indexedAt: new Date().toISOString(),
                },
              });

              if (result?.success && result.chunks) {
                const rids = (result.chunks as Array<{ rid: string; chunkIndex: number }>)
                  .sort((a, b) => a.chunkIndex - b.chunkIndex)
                  .map(c => c.rid);
                indexedPages.push({ slug: page.slug, chunkRids: rids });
                totalChunks += result.indexed ?? rids.length;
              }
            } catch (err: any) {
              console.warn(`[pipeline] graph-index failed for "${page.slug}": ${err?.message ?? err}`);
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(INDEX_CONCURRENCY, pages.length) },
          () => worker(),
        );
        await Promise.all(workers);

        console.error(`[pipeline] Step 3 done: ${totalChunks} chunks across ${indexedPages.length} pages`);

        if (totalChunks === 0) {
          return { pages: pages.length, repos: reposToSync.length, collection, chunks: 0, durationMs: Date.now() - startTime };
        }

        // Step 4: Create NextSection edges
        console.error(`[pipeline] Step 4: Creating NextSection edges…`);
        let nextSectionCreated = 0;

        for (const { chunkRids } of indexedPages) {
          for (let i = 0; i < chunkRids.length - 1; i++) {
            try {
              await client.invokeRemote('graph-command', {
                database,
                command: `CREATE EDGE NextSection FROM ${chunkRids[i]} TO ${chunkRids[i + 1]}`,
              });
              nextSectionCreated++;
            } catch { /* non-fatal */ }
          }
        }

        console.error(`[pipeline] Step 4 done: ${nextSectionCreated} NextSection edges`);

        // Step 5: Create References edges for cross-doc links
        console.error(`[pipeline] Step 5: Creating References edges…`);
        const slugToRids = new Map(indexedPages.map(p => [p.slug, p.chunkRids]));
        let referencesCreated = 0;

        for (const page of pages) {
          const refs = extractCrossDocLinks(page.content, page.slug, slugToRids);
          const sourceRids = slugToRids.get(page.slug);
          if (!sourceRids?.[0]) continue;

          for (const ref of refs) {
            const targetRids = slugToRids.get(ref.targetSlug);
            if (!targetRids?.[0]) continue;

            try {
              await client.invokeRemote('graph-command', {
                database,
                command: `CREATE EDGE References FROM ${sourceRids[0]} TO ${targetRids[0]} SET linkText = '${escapeSQL(ref.linkText)}', sourceSlug = '${escapeSQL(page.slug)}'`,
              });
              referencesCreated++;
            } catch { /* non-fatal */ }
          }
        }

        console.error(`[pipeline] Step 5 done: ${referencesCreated} References edges`);
        const durationMs = Date.now() - startTime;
        console.error(`[pipeline] Complete: ${totalChunks} chunks, ${nextSectionCreated} NextSection, ${referencesCreated} References (${durationMs}ms)`);

        return {
          pages: pages.length,
          repos: reposToSync.length,
          collection,
          chunks: totalChunks,
          nextSectionEdges: nextSectionCreated,
          referencesEdges: referencesCreated,
          durationMs,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    } catch { /* permission error — skip */ }
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

interface CrossDocRef {
  targetSlug: string;
  linkText: string;
}

function extractCrossDocLinks(
  content: string,
  currentSlug: string,
  knownSlugs: Map<string, string[]>,
): CrossDocRef[] {
  const refs: CrossDocRef[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkText = match[1];
    const href = match[2];

    if (href.startsWith('http') || href.startsWith('#')) continue;

    const normalized = href
      .replace(/\.md$/, '')
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');

    // Try to resolve relative to current slug's directory
    const currentDir = currentSlug.includes('/') ? currentSlug.split('/').slice(0, -1).join('/') : '';
    const candidates = [
      normalized,
      `${currentDir}/${normalized}`,
      normalized.replace(/^\//, ''),
    ];

    for (const candidate of candidates) {
      if (knownSlugs.has(candidate) && candidate !== currentSlug) {
        refs.push({ targetSlug: candidate, linkText });
        break;
      }
    }
  }

  return refs;
}

function escapeSQL(str: string): string {
  return str.replace(/'/g, "\\'");
}
