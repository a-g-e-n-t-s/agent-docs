/**
 * generate-docs.ts — LLM-powered documentation page generator.
 *
 * For each repo in config.json:
 *   1. Collect source context (agent.json, config.toml, tools, entry point, lib files)
 *   2. Call model-manager LLM to generate a rich documentation page
 *   3. Write to docs/{subdir}/index.md (replaces raw README copy)
 *   4. Cache via content hash — skip unchanged repos
 *
 * Usage:
 *   npx tsx scripts/generate-docs.ts              # all repos
 *   npx tsx scripts/generate-docs.ts --repos ability-graph,ability-memory
 *   npx tsx scripts/generate-docs.ts --force      # ignore cache
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const CONFIG_PATH = path.resolve(import.meta.dirname, '..', 'config.json');
const CACHE_DIR = path.resolve(import.meta.dirname, '..', '.cache', 'docs-gen');
const DOCS_DIR = path.resolve(import.meta.dirname, '..', 'docs');
const MAX_SOURCE_CHARS = 20_000;
const MODEL = 'gpt-5-mini';

interface RepoConfig {
  path: string;
  description: string;
  type: string;
  crawl: string[];
  indexCrawl?: string[];
}

interface ModelManagerConfig {
  baseUrl: string;
  apiKey: string;
}

// ── Output directory mapping ──────────────────────────────────────────

function getOutputSubdir(name: string, type: string): string {
  switch (type) {
    case 'kadi-agent': return `agents/${name}`;
    case 'kadi-ability': return `abilities/${name}`;
    case 'kadi-package': return `packages/${name}`;
    case 'kadi-monorepo': return 'architecture';
    case 'cpp-engine': return 'engine';
    case 'cpp-game': return 'daemon-agent';
    default: return `other/${name}`;
  }
}

// ── Source context collection ─────────────────────────────────────────

function collectSourceContext(repoPath: string, crawlPatterns: string[]): string {
  const parts: string[] = [];

  // agent.json
  const agentJsonPath = path.join(repoPath, 'agent.json');
  if (fs.existsSync(agentJsonPath)) {
    parts.push('=== agent.json ===');
    parts.push(fs.readFileSync(agentJsonPath, 'utf-8'));
  }

  // config.toml
  const configTomlPath = path.join(repoPath, 'config.toml');
  if (fs.existsSync(configTomlPath)) {
    parts.push('=== config.toml ===');
    parts.push(fs.readFileSync(configTomlPath, 'utf-8'));
  }

  // Tool registrations from src/tools/
  const toolsDir = path.join(repoPath, 'src', 'tools');
  if (fs.existsSync(toolsDir)) {
    const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts'));
    const toolSnippets: string[] = [];
    for (const file of toolFiles.slice(0, 8)) {
      const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
      // Extract tool name and description from registerTool calls
      const toolMatches = content.matchAll(/name:\s*['"]([^'"]+)['"][\s\S]*?description:\s*['"]([^'"]+)/g);
      for (const match of toolMatches) {
        toolSnippets.push(`- ${match[1]}: ${match[2]}`);
      }
      // Also include first 80 lines of each tool file for context
      const lines = content.split('\n').slice(0, 80).join('\n');
      if (lines.length < 4000) {
        parts.push(`=== src/tools/${file} (first 80 lines) ===`);
        parts.push(lines);
      }
    }
    if (toolSnippets.length > 0) {
      parts.push('=== Registered Tools (summary) ===');
      parts.push(toolSnippets.join('\n'));
    }
  }

  // Entry point (src/index.ts or src/agent.ts)
  const srcDir = path.join(repoPath, 'src');
  if (fs.existsSync(srcDir)) {
    for (const entry of ['index.ts', 'agent.ts']) {
      const entryPath = path.join(srcDir, entry);
      if (fs.existsSync(entryPath)) {
        const content = fs.readFileSync(entryPath, 'utf-8');
        const lines = content.split('\n').slice(0, 150).join('\n');
        parts.push(`=== src/${entry} (first 150 lines) ===`);
        parts.push(lines);
        break;
      }
    }

    // Key lib files
    const libDir = path.join(srcDir, 'lib');
    if (fs.existsSync(libDir)) {
      const libFiles = fs.readdirSync(libDir).filter(f => f.endsWith('.ts')).slice(0, 5);
      for (const file of libFiles) {
        const content = fs.readFileSync(path.join(libDir, file), 'utf-8');
        const lines = content.split('\n').slice(0, 60).join('\n');
        parts.push(`=== src/lib/${file} (first 60 lines) ===`);
        parts.push(lines);
      }
    }
  }

  // package.json (dependencies only)
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      parts.push('=== Dependencies ===');
      parts.push(JSON.stringify({
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
      }, null, 2));
    } catch { /* skip */ }
  }

  // README.md (existing docs)
  const readmePath = path.join(repoPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf-8');
    if (readme.length < 3000) {
      parts.push('=== README.md ===');
      parts.push(readme);
    } else {
      parts.push('=== README.md (first 50 lines) ===');
      parts.push(readme.split('\n').slice(0, 50).join('\n'));
    }
  }

  const combined = parts.join('\n\n');
  return combined.length > MAX_SOURCE_CHARS
    ? combined.slice(0, MAX_SOURCE_CHARS) + '\n...(truncated)'
    : combined;
}

// ── LLM call ──────────────────────────────────────────────────────────

async function generateDocPage(
  name: string,
  repoType: string,
  description: string,
  sourceContext: string,
  config: ModelManagerConfig,
): Promise<string> {
  const systemPrompt = `You are a technical documentation writer for the AGENTS multi-agent orchestration platform.
Generate a comprehensive documentation page for "${name}" (type: ${repoType}).

Include these sections:
- **Overview**: What it does, why it exists, one-paragraph summary
- **Architecture**: Data flow, key components, how it fits in the AGENTS ecosystem
- **Tools / API**: Table of tools or exported functions with descriptions and key parameters
- **Configuration**: config.toml fields, environment variables, secrets vault
- **Code Examples**: Relevant TypeScript/code snippets showing key patterns (use actual code from the source)
- **Dependencies**: What it depends on (abilities, packages), what depends on it

Rules:
- Be specific — use actual function names, config fields, tool names from the source context
- Include \`\`\`typescript code blocks for key patterns (copy from source, don't invent)
- Keep under 400 lines total
- Write for developers who need to understand and modify this code
- Do NOT include generic installation boilerplate unless non-standard
- Do NOT wrap output in a code block — output raw markdown
- Start with "# ${name}" as the first line
- Include a one-line description blockquote after the title: > ${description}
- If the source shows tool registrations, document each tool in a table
- For abilities: focus on what tools they expose and how to use them
- For agents: focus on their role in the system and how they interact with other agents`;

  const userPrompt = `Generate documentation for this package. Here is the source code context:\n\n${sourceContext}`;

  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 6000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model-manager HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// ── Caching ───────────────────────────────────────────────────────────

function getContextHash(context: string): string {
  return crypto.createHash('sha256').update(context).digest('hex').slice(0, 16);
}

function isCached(repoName: string, hash: string): boolean {
  const cachePath = path.join(CACHE_DIR, `${repoName}.hash`);
  if (!fs.existsSync(cachePath)) return false;
  return fs.readFileSync(cachePath, 'utf-8').trim() === hash;
}

function writeCache(repoName: string, hash: string): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(CACHE_DIR, `${repoName}.hash`), hash);
}

// ── Credentials ───────────────────────────────────────────────────────

function getModelManagerConfig(): ModelManagerConfig | null {
  const baseUrl = process.env.MODEL_MANAGER_BASE_URL;
  const apiKey = process.env.MODEL_MANAGER_API_KEY;

  if (baseUrl && apiKey) return { baseUrl, apiKey };

  // Try kadi secret get
  try {
    const url = execSync('kadi secret get MODEL_MANAGER_BASE_URL', { encoding: 'utf-8' }).trim();
    const key = execSync('kadi secret get MODEL_MANAGER_API_KEY', { encoding: 'utf-8' }).trim();
    if (url && key) return { baseUrl: url, apiKey: key };
  } catch { /* not available */ }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────

export async function generateDocs(options?: {
  repos?: string[];
  force?: boolean;
  config?: ModelManagerConfig;
}): Promise<number> {
  const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const repos: Record<string, RepoConfig> = configData.repos;

  const mmConfig = options?.config ?? getModelManagerConfig();
  if (!mmConfig) {
    console.warn('[generate-docs] No model-manager credentials — skipping LLM generation');
    return 0;
  }

  const force = options?.force ?? process.argv.includes('--force');
  const filterRepos = options?.repos ?? parseRepoFilter();

  let generated = 0;

  for (const [name, repo] of Object.entries(repos)) {
    if (filterRepos && !filterRepos.includes(name)) continue;

    const repoPath = path.resolve(path.dirname(CONFIG_PATH), repo.path);
    if (!fs.existsSync(repoPath)) {
      console.log(`[generate-docs] SKIP ${name} — path not found: ${repoPath}`);
      continue;
    }

    // Collect source context
    const context = collectSourceContext(repoPath, repo.crawl);
    const hash = getContextHash(context);

    // Check cache
    if (!force && isCached(name, hash)) {
      continue; // unchanged
    }

    console.log(`[generate-docs] Generating: ${name} (${repo.type})…`);

    try {
      const markdown = await generateDocPage(name, repo.type, repo.description, context, mmConfig);

      if (!markdown || markdown.length < 100) {
        console.warn(`[generate-docs] ${name}: LLM returned empty/short response, skipping`);
        continue;
      }

      // Add Starlight frontmatter if missing
      const finalContent = ensureFrontmatter(markdown, name, repo.description);

      // Write to docs directory
      const subdir = getOutputSubdir(name, repo.type);
      const outputDir = path.join(DOCS_DIR, subdir);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(path.join(outputDir, 'index.md'), finalContent);
      writeCache(name, hash);
      generated++;

      console.log(`[generate-docs] ${name}: done (${finalContent.split('\n').length} lines)`);
    } catch (err: any) {
      console.error(`[generate-docs] ${name}: FAILED — ${err.message}`);
    }
  }

  return generated;
}

function ensureFrontmatter(markdown: string, name: string, description: string): string {
  if (markdown.startsWith('---')) return markdown;
  return `---\ntitle: "${name}"\ndescription: "${description}"\n---\n\n${markdown}`;
}

function parseRepoFilter(): string[] | null {
  const idx = process.argv.indexOf('--repos');
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value) return null;
  return value.split(',').map(s => s.trim());
}

// ── CLI entry point ───────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-docs.ts')) {
  generateDocs().then((count) => {
    console.log(`[generate-docs] Done — ${count} pages generated`);
  }).catch((err) => {
    console.error('[generate-docs] Fatal:', err);
    process.exit(1);
  });
}
