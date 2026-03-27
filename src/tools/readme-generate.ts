/**
 * README auto-generation tool — generates/updates README.md files
 * for all repos in config.json using templates + LLM enhancement.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from '@kadi.build/core';
import type { DocsConfig } from '../config/types.js';

interface RepoConfig {
  path: string;
  type: string;
  crawl: string[];
  description?: string;
}

interface ReadmeSection {
  heading: string;
  content: string;
  line: number;
}

const TEMPLATE_DIR = path.resolve(process.cwd(), 'templates');

/** Required sections per repo type */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  'kadi-agent': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-ability': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-package': ['Quick Start', 'Configuration', 'Development'],
  'kadi-monorepo': ['Architecture', 'Quick Start'],
  'cpp-engine': ['Prerequisites', 'Build', 'Architecture'],
  'cpp-game': ['Prerequisites', 'Build', 'Architecture'],
};

/** Parse existing README into sections */
function parseReadme(content: string): ReadmeSection[] {
  const lines = content.split('\n');
  const sections: ReadmeSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];
  let currentLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.+)/);
    if (match) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim(), line: currentLine });
      }
      currentHeading = match[1].trim();
      currentContent = [];
      currentLine = i;
    } else if (currentHeading) {
      currentContent.push(lines[i]);
    }
  }
  if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim(), line: currentLine });
  }
  return sections;
}

/** Check if a section has real content (not just template placeholders) */
function hasContent(section: ReadmeSection): boolean {
  const stripped = section.content
    .replace(/<!--.*?-->/gs, '')
    .replace(/\|\s*Tool\s*\|\s*Description\s*\|/g, '')
    .replace(/\|[-\s]+\|[-\s]+\|/g, '')
    .trim();
  return stripped.length > 10;
}

/** Generate section content from agent.json metadata */
function generateSectionFromMetadata(heading: string, agentJson: any, repoType: string): string | null {
  switch (heading) {
    case 'Tools': {
      // We can't know tools without running the agent, but we can note the type
      return `| Tool | Description |\n|------|-------------|\n| *(Run \`kadi run start\` and check broker for registered tools)* | |`;
    }
    case 'Configuration': {
      const lines: string[] = ['### agent.json', ''];
      lines.push(`| Field | Value |`);
      lines.push(`|-------|-------|`);
      lines.push(`| **Version** | ${agentJson.version || 'N/A'} |`);
      lines.push(`| **Type** | ${agentJson.type || 'N/A'} |`);
      if (agentJson.entrypoint) lines.push(`| **Entrypoint** | \`${agentJson.entrypoint}\` |`);
      lines.push('');

      if (agentJson.abilities && Object.keys(agentJson.abilities).length > 0) {
        lines.push('### Abilities', '');
        for (const [ability, version] of Object.entries(agentJson.abilities)) {
          lines.push(`- \`${ability}\` ${version}`);
        }
        lines.push('');
      }

      if (agentJson.brokers && Object.keys(agentJson.brokers).length > 0) {
        lines.push('### Brokers', '');
        for (const [broker, url] of Object.entries(agentJson.brokers)) {
          lines.push(`- **${broker}**: \`${url}\``);
        }
        lines.push('');
      }

      if (agentJson.secrets) {
        lines.push('### Secrets', '');
        lines.push(`- **Vault**: \`${agentJson.secrets.vault}\``);
        if (agentJson.secrets.required?.length) {
          lines.push(`- **Required**: ${agentJson.secrets.required.map((k: string) => `\`${k}\``).join(', ')}`);
        }
        lines.push('');
      }

      return lines.join('\n');
    }
    case 'Quick Start': {
      return `\`\`\`bash\ncd ${agentJson.name || 'project'}\nnpm install\nkadi install\nkadi run start\n\`\`\``;
    }
    case 'Development': {
      const scripts = agentJson.scripts || {};
      const lines = ['```bash', '# Install dependencies', 'npm install', ''];
      if (scripts.build || scripts.setup) {
        lines.push('# Build', `npm run ${scripts.build ? 'build' : 'setup'}`, '');
      }
      lines.push('# Run in development mode');
      if (scripts.dev) {
        lines.push(`npm run dev`);
      } else if (scripts.start) {
        lines.push(`kadi run start`);
      }
      lines.push('```');
      return lines.join('\n');
    }
    default:
      return null;
  }
}

/** Generate or update a README for a repo */
function generateReadme(
  name: string,
  repoPath: string,
  repoType: string,
  description?: string,
): { updated: boolean; sections_added: string[] } {
  const readmePath = path.join(repoPath, 'README.md');
  const agentJsonPath = path.join(repoPath, 'agent.json');

  let agentJson: any = null;
  try {
    agentJson = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8'));
  } catch { /* no agent.json */ }

  const required = REQUIRED_SECTIONS[repoType] || REQUIRED_SECTIONS['kadi-package'];
  const sectionsAdded: string[] = [];

  // If no README exists, generate from scratch
  if (!fs.existsSync(readmePath)) {
    const lines: string[] = [];
    lines.push(`# ${agentJson?.name || name}`);
    lines.push('');
    if (agentJson?.description || description) {
      lines.push(`> ${agentJson?.description || description}`);
      lines.push('');
    }

    for (const section of required) {
      lines.push(`## ${section}`, '');
      const content = agentJson ? generateSectionFromMetadata(section, agentJson, repoType) : null;
      lines.push(content || `<!-- TODO: Add ${section} content -->`, '');
      sectionsAdded.push(section);
    }

    fs.writeFileSync(readmePath, lines.join('\n'), 'utf-8');
    return { updated: true, sections_added: sectionsAdded };
  }

  // README exists — check for missing sections and fill gaps
  const existing = fs.readFileSync(readmePath, 'utf-8');
  const sections = parseReadme(existing);
  const existingHeadings = new Set(sections.map(s => s.heading));

  let appendContent = '';

  for (const section of required) {
    const existingSection = sections.find(s => s.heading === section);

    if (!existingSection) {
      // Section missing entirely — add it
      const content = agentJson ? generateSectionFromMetadata(section, agentJson, repoType) : null;
      appendContent += `\n## ${section}\n\n${content || `<!-- TODO: Add ${section} content -->`}\n`;
      sectionsAdded.push(section);
    } else if (!hasContent(existingSection)) {
      // Section exists but is empty/placeholder — we could fill it, but let's not overwrite
      // to avoid conflicts. Just note it.
    }
  }

  if (appendContent) {
    fs.writeFileSync(readmePath, existing.trimEnd() + '\n' + appendContent, 'utf-8');
    return { updated: true, sections_added: sectionsAdded };
  }

  return { updated: false, sections_added: [] };
}

export function registerReadmeGenerateTool(
  client: any,
  config: DocsConfig,
): void {
  client.registerTool(
    {
      name: 'agents-docs-readme-generate',
      description: 'Generate or update README.md files for all repos. Fills missing sections from agent.json metadata.',
      input: z.object({
        repos: z.array(z.string()).optional().describe('Specific repo names to update (default: all)'),
        dryRun: z.boolean().optional().describe('Preview changes without writing files'),
      }),
    },
    async (input: { repos?: string[]; dryRun?: boolean }) => {
      const results: Array<{ repo: string; updated: boolean; sections_added: string[] }> = [];
      const repoEntries = Object.entries(config.repos as Record<string, RepoConfig>);

      for (const [name, repo] of repoEntries) {
        if (input.repos && !input.repos.includes(name)) continue;

        const repoPath = path.resolve(process.cwd(), repo.path);
        if (!fs.existsSync(repoPath)) continue;

        if (input.dryRun) {
          // Just check what would be updated
          const readmePath = path.join(repoPath, 'README.md');
          const required = REQUIRED_SECTIONS[repo.type] || REQUIRED_SECTIONS['kadi-package'];
          const missing: string[] = [];

          if (!fs.existsSync(readmePath)) {
            missing.push(...required);
          } else {
            const sections = parseReadme(fs.readFileSync(readmePath, 'utf-8'));
            const headings = new Set(sections.map(s => s.heading));
            for (const r of required) {
              if (!headings.has(r)) missing.push(r);
            }
          }

          results.push({ repo: name, updated: missing.length > 0, sections_added: missing });
        } else {
          const result = generateReadme(name, repoPath, repo.type, repo.description);
          results.push({ repo: name, ...result });
        }
      }

      const updated = results.filter(r => r.updated);
      return {
        total: results.length,
        updated: updated.length,
        details: updated,
        dryRun: input.dryRun ?? false,
      };
    },
  );
}
