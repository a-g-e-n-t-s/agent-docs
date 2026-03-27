/**
 * agents-docs-readme-lint — Validate READMEs against templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from '@kadi.build/core';
import type { DocsConfig, RepoConfig } from '../config/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const KADI_REQUIRED_SECTIONS = [
  'Quick Start',
  'Configuration',
  'Development',
];

const KADI_AGENT_REQUIRED_SECTIONS = [
  ...KADI_REQUIRED_SECTIONS,
  'Architecture',
];

const CPP_REQUIRED_SECTIONS = [
  'Architecture',
  'Building',
  'Technical Stack',
];

export function registerReadmeLintTool(client: any, config: DocsConfig): void {
  client.registerTool(
    {
      name: 'agents-docs-readme-lint',
      description:
        'Validate README.md files against templates for each repo type. ' +
        'Reports missing sections, stale metadata, and coverage gaps.',
      input: z.object({
        repos: z.array(z.string()).optional()
          .describe('Specific repos to lint (default: all)'),
      }),
    },
    async (input: { repos?: string[] }) => {
      const reposToLint = input.repos
        ? Object.entries(config.repos).filter(([name]) => input.repos!.includes(name))
        : Object.entries(config.repos);

      const results: Record<string, {
        exists: boolean;
        missing: string[];
        present: string[];
        agentJsonSync?: { name: boolean; description: boolean; version: boolean };
      }> = {};

      for (const [name, repo] of reposToLint) {
        const repoPath = path.resolve(PROJECT_ROOT, repo.path);
        const readmePath = path.join(repoPath, 'README.md');

        if (!fs.existsSync(readmePath)) {
          results[name] = { exists: false, missing: getRequiredSections(repo.type), present: [] };
          continue;
        }

        const content = fs.readFileSync(readmePath, 'utf-8');
        const headings = extractHeadings(content);
        const required = getRequiredSections(repo.type);

        const present = required.filter(s => headings.some(h => h.toLowerCase().includes(s.toLowerCase())));
        const missing = required.filter(s => !headings.some(h => h.toLowerCase().includes(s.toLowerCase())));

        const result: typeof results[string] = { exists: true, missing, present };

        // Check agent.json sync
        const agentJsonPath = path.join(repoPath, 'agent.json');
        if (fs.existsSync(agentJsonPath)) {
          try {
            const agent = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8'));
            result.agentJsonSync = {
              name: content.includes(agent.name ?? ''),
              description: !agent.description || content.includes(agent.description),
              version: !agent.version || content.includes(agent.version),
            };
          } catch {
            // Malformed agent.json
          }
        }

        results[name] = result;
      }

      const totalRepos = Object.keys(results).length;
      const withReadme = Object.values(results).filter(r => r.exists).length;
      const fullyCompliant = Object.values(results).filter(r => r.exists && r.missing.length === 0).length;

      return {
        success: true,
        results,
        summary: {
          total: totalRepos,
          withReadme,
          fullyCompliant,
          needsWork: totalRepos - fullyCompliant,
        },
      };
    },
  );
}

function getRequiredSections(type: RepoConfig['type']): string[] {
  switch (type) {
    case 'kadi-agent': return KADI_AGENT_REQUIRED_SECTIONS;
    case 'kadi-ability':
    case 'kadi-package':
    case 'kadi-monorepo': return KADI_REQUIRED_SECTIONS;
    case 'cpp-engine':
    case 'cpp-game': return CPP_REQUIRED_SECTIONS;
    default: return KADI_REQUIRED_SECTIONS;
  }
}

function extractHeadings(content: string): string[] {
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push(match[1].trim());
  }
  return headings;
}
