/**
 * Search tool wrappers — delegates to ability-docs-memory (native or broker).
 */

import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';

export function registerSearchTools(
  client: any,
  config: DocsConfig,
  apiKey?: string,
  docsMemoryAbility?: any,
): void {
  // agents-docs-search — 4-signal hybrid search
  client.registerTool(
    {
      name: 'agents-docs-search',
      description:
        'Search AGENTS documentation using 4-signal hybrid recall (semantic + keyword + graph + structural). ' +
        'Returns ranked results with content snippets and source attribution.',
      input: z.object({
        query: z.string().describe('Search query'),
        collection: z.string().optional().describe('Collection to search (default: agents-docs)'),
        limit: z.number().optional().describe('Max results (default: 10)'),
      }),
    },
    async (input: { query: string; collection?: string; limit?: number }) => {
      const collection = input.collection ?? 'agents-docs';
      const limit = input.limit ?? 10;

      if (docsMemoryAbility) {
        return docsMemoryAbility.invoke('docs-search', { query: input.query, collection, limit });
      }

      try {
        return await client.invokeRemote('docs-search', { query: input.query, collection, limit });
      } catch (err: any) {
        return { success: false, error: `Search unavailable: ${err?.message ?? err}` };
      }
    },
  );

  // agents-docs-page — Fetch a single page by slug
  client.registerTool(
    {
      name: 'agents-docs-page',
      description: 'Fetch a single documentation page by slug. Returns full content and metadata.',
      input: z.object({
        slug: z.string().describe('Document slug (e.g., "agent-worker/README")'),
        collection: z.string().optional().describe('Collection (default: agents-docs)'),
      }),
    },
    async (input: { slug: string; collection?: string }) => {
      const collection = input.collection ?? 'agents-docs';

      if (docsMemoryAbility) {
        return docsMemoryAbility.invoke('docs-page', { slug: input.slug, collection });
      }

      try {
        return await client.invokeRemote('docs-page', { slug: input.slug, collection });
      } catch (err: any) {
        return { success: false, error: `Page fetch unavailable: ${err?.message ?? err}` };
      }
    },
  );

  // agents-docs-reindex — Trigger reindex
  client.registerTool(
    {
      name: 'agents-docs-reindex',
      description: 'Trigger a full reindex of documentation into ArcadeDB. Use agents-docs-pipeline for the full workflow.',
      input: z.object({
        collection: z.string().optional().describe('Target collection (default: agents-docs)'),
      }),
    },
    async (input: { collection?: string }) => {
      const payload = { collection: input.collection ?? 'agents-docs' };

      if (docsMemoryAbility) {
        return docsMemoryAbility.invoke('docs-reindex', payload);
      }

      try {
        return await client.invokeRemote('docs-reindex', payload);
      } catch (err: any) {
        return { success: false, error: `Reindex unavailable: ${err?.message ?? err}` };
      }
    },
  );

  // agents-docs-index-status — Index health
  client.registerTool(
    {
      name: 'agents-docs-index-status',
      description: 'Get documentation index statistics: total docs, counts by collection, health.',
      input: z.object({
        collection: z.string().optional().describe('Filter to collection (default: all)'),
      }),
    },
    async (input: { collection?: string }) => {
      if (docsMemoryAbility) {
        return docsMemoryAbility.invoke('docs-index-status', { collection: input.collection });
      }

      try {
        return await client.invokeRemote('docs-index-status', { collection: input.collection });
      } catch (err: any) {
        return { success: false, error: `Index status unavailable: ${err?.message ?? err}` };
      }
    },
  );
}
