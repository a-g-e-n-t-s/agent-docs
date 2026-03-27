/**
 * CLI wrapper for agents-docs-readme-generate — runs README generation
 * directly without needing a broker connection.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');

interface RepoConfig {
  path: string;
  type: string;
  crawl: string[];
  description?: string;
}

const REQUIRED_SECTIONS: Record<string, string[]> = {
  'kadi-agent': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-ability': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-package': ['Quick Start', 'Configuration', 'Development'],
  'kadi-monorepo': ['Architecture', 'Quick Start'],
  'cpp-engine': ['Prerequisites', 'Build', 'Architecture'],
  'cpp-game': ['Prerequisites', 'Build', 'Architecture'],
};

function parseReadme(content: string): Array<{ heading: string; content: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      if (currentHeading) sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
      currentHeading = match[1].trim();
      currentContent = [];
    } else if (currentHeading) {
      currentContent.push(line);
    }
  }
  if (currentHeading) sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
  return sections;
}

function generateSection(heading: string, agentJson: any): string | null {
  switch (heading) {
    case 'Configuration': {
      const lines = ['### agent.json', '', '| Field | Value |', '|-------|-------|'];
      lines.push(`| **Version** | ${agentJson.version || 'N/A'} |`);
      lines.push(`| **Type** | ${agentJson.type || 'N/A'} |`);
      if (agentJson.entrypoint) lines.push(`| **Entrypoint** | \`${agentJson.entrypoint}\` |`);
      if (agentJson.abilities) {
        lines.push('', '### Abilities', '');
        for (const [a, v] of Object.entries(agentJson.abilities)) lines.push(`- \`${a}\` ${v}`);
      }
      if (agentJson.brokers) {
        lines.push('', '### Brokers', '');
        for (const [b, u] of Object.entries(agentJson.brokers)) lines.push(`- **${b}**: \`${u}\``);
      }
      return lines.join('\n');
    }
    case 'Quick Start':
      return `\`\`\`bash\ncd ${agentJson.name || 'project'}\nnpm install\nkadi install\nkadi run start\n\`\`\``;
    case 'Development':
      return '```bash\nnpm install\nnpm run build\nkadi run start\n```';
    default:
      return null;
  }
}

// Run
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const repos: Record<string, RepoConfig> = config.repos;
let updated = 0;

console.log('[readme-gen] Checking READMEs...');

for (const [name, repo] of Object.entries(repos)) {
  const repoPath = path.resolve(PROJECT_ROOT, repo.path);
  if (!fs.existsSync(repoPath)) continue;

  const readmePath = path.join(repoPath, 'README.md');
  const agentJsonPath = path.join(repoPath, 'agent.json');
  const required = REQUIRED_SECTIONS[repo.type] || REQUIRED_SECTIONS['kadi-package'];

  let agentJson: any = null;
  try { agentJson = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8')); } catch { /* skip */ }

  if (!fs.existsSync(readmePath)) {
    // Generate from scratch
    const lines = [`# ${agentJson?.name || name}`, ''];
    if (agentJson?.description || repo.description) {
      lines.push(`> ${agentJson?.description || repo.description}`, '');
    }
    for (const section of required) {
      lines.push(`## ${section}`, '');
      const content = agentJson ? generateSection(section, agentJson) : null;
      lines.push(content || `<!-- TODO: Add ${section} content -->`, '');
    }
    fs.writeFileSync(readmePath, lines.join('\n'), 'utf-8');
    console.log(`[readme-gen] CREATED ${name}/README.md (${required.length} sections)`);
    updated++;
    continue;
  }

  // Check for missing sections
  const existing = fs.readFileSync(readmePath, 'utf-8');
  const sections = parseReadme(existing);
  const headings = new Set(sections.map(s => s.heading));
  const missing = required.filter(r => !headings.has(r));

  if (missing.length > 0) {
    let append = '';
    for (const section of missing) {
      const content = agentJson ? generateSection(section, agentJson) : null;
      append += `\n## ${section}\n\n${content || `<!-- TODO: Add ${section} content -->`}\n`;
    }
    fs.writeFileSync(readmePath, existing.trimEnd() + '\n' + append, 'utf-8');
    console.log(`[readme-gen] UPDATED ${name}/README.md (+${missing.join(', ')})`);
    updated++;
  }
}

console.log(`[readme-gen] Done — ${updated} READMEs updated`);
