/**
 * CLI wrapper for agents-docs-sync — runs the sync logic directly
 * without needing a broker connection.
 *
 * Crawls repos defined in config.json, copies markdown to docs/,
 * converts agent.json to markdown, and generates index pages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'docs');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');

interface RepoConfig {
  path: string;
  type: string;
  crawl: string[];
  description?: string;
}

// Load config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const repos: Record<string, RepoConfig> = config.repos;

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

function matchesGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (pattern === 'README.md') return normalized === 'README.md';
  if (pattern === 'CLAUDE.md') return normalized === 'CLAUDE.md';
  if (pattern === 'agent.json') return normalized === 'agent.json';
  if (pattern.startsWith('**/')) return normalized.endsWith(pattern.slice(3));
  if (pattern.includes('**')) {
    const [prefix, suffix] = pattern.split('**');
    return normalized.startsWith(prefix.replace(/\/$/, '')) && normalized.endsWith(suffix.replace(/^\//, ''));
  }
  return normalized === pattern;
}

function walkDir(dir: string, cwd: string, pattern: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...walkDir(fullPath, cwd, pattern));
      } else if (entry.isFile()) {
        const relativePath = path.relative(cwd, fullPath).replace(/\\/g, '/');
        if (matchesGlob(relativePath, pattern)) files.push(fullPath);
      }
    }
  } catch { /* skip */ }
  return files;
}

/** Convert agent.json to a markdown doc page */
function agentJsonToMarkdown(agentJson: any, name: string): string {
  const lines: string[] = [];
  lines.push(`# ${agentJson.name || name}`);
  lines.push('');
  if (agentJson.description) {
    lines.push(`> ${agentJson.description}`);
    lines.push('');
  }
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Version** | ${agentJson.version || 'N/A'} |`);
  lines.push(`| **Type** | ${agentJson.type || 'N/A'} |`);
  if (agentJson.entrypoint) lines.push(`| **Entrypoint** | \`${agentJson.entrypoint}\` |`);
  lines.push('');

  if (agentJson.abilities && Object.keys(agentJson.abilities).length > 0) {
    lines.push('## Abilities');
    lines.push('');
    for (const [ability, version] of Object.entries(agentJson.abilities)) {
      lines.push(`- \`${ability}\` ${version}`);
    }
    lines.push('');
  }

  if (agentJson.brokers && Object.keys(agentJson.brokers).length > 0) {
    lines.push('## Brokers');
    lines.push('');
    for (const [broker, url] of Object.entries(agentJson.brokers)) {
      lines.push(`- **${broker}**: \`${url}\``);
    }
    lines.push('');
  }

  if (agentJson.scripts && Object.keys(agentJson.scripts).length > 0) {
    lines.push('## Scripts');
    lines.push('');
    lines.push('```bash');
    for (const [script, cmd] of Object.entries(agentJson.scripts)) {
      lines.push(`kadi run ${script}  # ${cmd}`);
    }
    lines.push('```');
    lines.push('');
  }

  if (agentJson.deploy) {
    lines.push('## Deploy Profiles');
    lines.push('');
    for (const [profile, config] of Object.entries(agentJson.deploy as Record<string, any>)) {
      lines.push(`### ${profile}`);
      lines.push('');
      lines.push(`- **Target**: ${config.target || 'N/A'}`);
      if (config.engine) lines.push(`- **Engine**: ${config.engine}`);
      if (config.services) {
        lines.push(`- **Services**: ${Object.keys(config.services).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Step 0: Generate missing READMEs before syncing ──
console.log('[sync] Step 0: Generating missing READMEs...');

const REQUIRED_SECTIONS: Record<string, string[]> = {
  'kadi-agent': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-ability': ['Quick Start', 'Tools', 'Configuration', 'Architecture', 'Development'],
  'kadi-package': ['Quick Start', 'Configuration', 'Development'],
  'kadi-monorepo': ['Architecture', 'Quick Start'],
  'cpp-engine': ['Prerequisites', 'Build', 'Architecture'],
  'cpp-game': ['Prerequisites', 'Build', 'Architecture'],
};

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
    case 'Tools':
      return '| Tool | Description |\n|------|-------------|\n| *(Run `kadi run start` and check broker for registered tools)* | |';
    default:
      return null;
  }
}

let readmesGenerated = 0;
for (const [name, repo] of Object.entries(repos)) {
  const repoPath = path.resolve(PROJECT_ROOT, repo.path);
  if (!fs.existsSync(repoPath)) continue;

  const readmePath = path.join(repoPath, 'README.md');
  const agentJsonPath = path.join(repoPath, 'agent.json');

  // Skip if README already exists
  if (fs.existsSync(readmePath)) continue;

  // Generate README from agent.json if available
  let agentJson: any = null;
  try { agentJson = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8')); } catch { /* skip */ }

  const required = REQUIRED_SECTIONS[repo.type] || REQUIRED_SECTIONS['kadi-package'];
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
  console.log(`[sync] Generated README.md for ${name}`);
  readmesGenerated++;
}
console.log(`[sync] Step 0 done — ${readmesGenerated} READMEs generated`);

// ── Step 1: Sync docs ──
console.log('[sync] Step 1: Syncing documentation...');
let totalFiles = 0;

// Clean docs/ subdirectories (but keep intro.md)
for (const subdir of ['agents', 'abilities', 'packages', 'architecture', 'engine', 'daemon-agent']) {
  const dirPath = path.join(DOCS_DIR, subdir);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

for (const [name, repo] of Object.entries(repos)) {
  const repoPath = path.resolve(PROJECT_ROOT, repo.path);
  if (!fs.existsSync(repoPath)) {
    console.log(`[sync] SKIP ${name} — path not found: ${repoPath}`);
    continue;
  }

  const outputSubdir = getOutputSubdir(name, repo.type);
  const outputDir = path.join(DOCS_DIR, outputSubdir);
  let repoFiles = 0;
  let hasReadme = false;
  let hasAgentJson = false;
  let agentJsonData: any = null;

  for (const pattern of repo.crawl) {
    const matches = walkDir(repoPath, repoPath, pattern);
    for (const file of matches) {
      const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

      // Handle agent.json — convert to markdown instead of copying raw JSON
      if (relativePath === 'agent.json') {
        hasAgentJson = true;
        try {
          agentJsonData = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch { /* skip */ }
        continue; // Don't copy the raw JSON
      }

      // Handle README.md — rename to index.md for Starlight
      let destRelative = relativePath;
      if (relativePath === 'README.md') {
        destRelative = 'index.md';
        hasReadme = true;
      }

      const destPath = path.join(outputDir, destRelative);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Read content and ensure Starlight-compatible frontmatter
      let content = fs.readFileSync(file, 'utf-8');
      if (!content.startsWith('---')) {
        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : name;
        content = `---\ntitle: "${title.replace(/"/g, '\\"')}"\n---\n\n${content}`;
      }
      fs.writeFileSync(destPath, content, 'utf-8');
      repoFiles++;
    }
  }

  // If no README but we have agent.json, generate an index.md from it
  if (!hasReadme && hasAgentJson && agentJsonData) {
    const indexPath = path.join(outputDir, 'index.md');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(indexPath, agentJsonToMarkdown(agentJsonData, name), 'utf-8');
    repoFiles++;
    console.log(`[sync] ${name}: generated index.md from agent.json`);
  }

  // If we have both README and agent.json, append agent.json info as a separate page
  if (hasReadme && hasAgentJson && agentJsonData) {
    const manifestPath = path.join(outputDir, 'manifest.md');
    fs.writeFileSync(manifestPath, `---\ntitle: Manifest\n---\n\n${agentJsonToMarkdown(agentJsonData, name)}`, 'utf-8');
    repoFiles++;
  }

  if (repoFiles > 0) {
    console.log(`[sync] ${name}: ${repoFiles} files → docs/${outputSubdir}/`);
    totalFiles += repoFiles;
  }
}

console.log(`[sync] Done — ${readmesGenerated} READMEs generated, ${totalFiles} files synced to docs/`);
