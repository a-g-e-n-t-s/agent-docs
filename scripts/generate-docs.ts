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
const DOCS_DIR = path.resolve(import.meta.dirname, '..', 'src', 'content', 'docs');
const MAX_SOURCE_CHARS = 20_000;
const MODEL = 'gpt-5-mini';
const CONCURRENCY = 10;

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

function collectSourceContext(repoPath: string, crawlPatterns: string[], repoType?: string): string {
  // C++ repos use a completely different context strategy
  if (repoType === 'cpp-engine' || repoType === 'cpp-game') {
    return collectCppSourceContext(repoPath, repoType);
  }

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
      const toolMatches = content.matchAll(/name:\s*['"]([^'"]+)['"][\s\S]*?description:\s*['"]([^'"]+)/g);
      for (const match of toolMatches) {
        toolSnippets.push(`- ${match[1]}: ${match[2]}`);
      }
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

  // NOTE: README.md intentionally excluded from source context.
  // It's an output of the pipeline (readme-gen), not an input.
  // Including it causes a feedback loop where every run regenerates.

  const combined = parts.join('\n\n');
  return combined.length > MAX_SOURCE_CHARS
    ? combined.slice(0, MAX_SOURCE_CHARS) + '\n...(truncated)'
    : combined;
}

function collectCppSourceContext(repoPath: string, repoType: string): string {
  const parts: string[] = [];

  // Key .hpp headers — module architecture (read actual code, not CLAUDE.md)
  if (repoType === 'cpp-engine') {
    const codeDir = path.join(repoPath, 'Code', 'Engine');
    if (fs.existsSync(codeDir)) {
      // Discover module directories
      const modules = fs.readdirSync(codeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .slice(0, 12);
      parts.push(`=== Engine Modules ===`);
      parts.push(modules.join(', '));

      // Read key headers from each module (first .hpp file, first 80 lines)
      for (const mod of modules) {
        const modDir = path.join(codeDir, mod);
        const headers = fs.readdirSync(modDir).filter(f => f.endsWith('.hpp')).slice(0, 2);
        for (const header of headers) {
          const content = fs.readFileSync(path.join(modDir, header), 'utf-8');
          const lines = content.split('\n').slice(0, 80).join('\n');
          parts.push(`=== Code/Engine/${mod}/${header} (first 80 lines) ===`);
          parts.push(lines);
        }
      }
    }

    // Also read the main engine header if it exists
    const engineHpp = path.join(repoPath, 'Code', 'Engine', 'Core', 'Engine.hpp');
    if (fs.existsSync(engineHpp)) {
      const content = fs.readFileSync(engineHpp, 'utf-8');
      if (!parts.some(p => p.includes('Core/Engine.hpp'))) {
        parts.push(`=== Code/Engine/Core/Engine.hpp (full) ===`);
        parts.push(content.slice(0, 3000));
      }
    }
  }

  // DaemonAgent: read C++ game code + V8 scripts
  if (repoType === 'cpp-game') {
    // C++ game code
    const codeDir = path.join(repoPath, 'Code');
    if (fs.existsSync(codeDir)) {
      const hppFiles = findFiles(codeDir, '.hpp').slice(0, 8);
      for (const file of hppFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(repoPath, file);
        const lines = content.split('\n').slice(0, 60).join('\n');
        parts.push(`=== ${relPath} (first 60 lines) ===`);
        parts.push(lines);
      }
    }

    // V8 scripts — the actual game logic
    const scriptsDir = path.join(repoPath, 'Run', 'Data', 'Scripts');
    if (fs.existsSync(scriptsDir)) {
      const jsFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js')).slice(0, 6);
      for (const script of jsFiles) {
        const content = fs.readFileSync(path.join(scriptsDir, script), 'utf-8');
        const lines = content.split('\n').slice(0, 80).join('\n');
        parts.push(`=== Run/Data/Scripts/${script} (first 80 lines) ===`);
        parts.push(lines);
      }

      // KĀDI integration scripts
      const kadiDir = path.join(scriptsDir, 'kadi');
      if (fs.existsSync(kadiDir)) {
        const kadiFiles = fs.readdirSync(kadiDir).filter(f => f.endsWith('.js')).slice(0, 4);
        for (const file of kadiFiles) {
          const content = fs.readFileSync(path.join(kadiDir, file), 'utf-8');
          const lines = content.split('\n').slice(0, 60).join('\n');
          parts.push(`=== Run/Data/Scripts/kadi/${file} (first 60 lines) ===`);
          parts.push(lines);
        }
      }
    }

    // openspec docs if they exist
    const openspecDir = path.join(repoPath, 'openspec');
    if (fs.existsSync(openspecDir)) {
      const specFiles = findFiles(openspecDir, '.md').slice(0, 2);
      for (const file of specFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(repoPath, file);
        parts.push(`=== ${relPath} (first 2000 chars) ===`);
        parts.push(content.slice(0, 2000));
      }
    }
  }

  // Docs/**/*.md — technical documentation (for both types)
  const docsDir = path.join(repoPath, 'Docs');
  if (fs.existsSync(docsDir)) {
    const mdFiles = findFiles(docsDir, '.md').slice(0, 2);
    for (const file of mdFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(repoPath, file);
      parts.push(`=== ${relPath} (first 2000 chars) ===`);
      parts.push(content.slice(0, 2000));
    }
  }

  const combined = parts.join('\n\n');
  return combined.length > MAX_SOURCE_CHARS
    ? combined.slice(0, MAX_SOURCE_CHARS) + '\n...(truncated)'
    : combined;
}

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findFiles(fullPath, ext));
      else if (entry.isFile() && entry.name.endsWith(ext)) results.push(fullPath);
    }
  } catch { /* permission error */ }
  return results;
}

// ── LLM call ──────────────────────────────────────────────────────────

async function generateDocPage(
  name: string,
  repoType: string,
  description: string,
  sourceContext: string,
  config: ModelManagerConfig,
): Promise<string> {
  const isCpp = repoType === 'cpp-engine' || repoType === 'cpp-game';
  const systemPrompt = isCpp ? getCppDocPrompt(name, repoType, description) : getTsDocPrompt(name, repoType, description);
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

function getTsDocPrompt(name: string, repoType: string, description: string): string {
  return `You are a technical documentation writer for the AGENTS multi-agent orchestration platform.
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
}

function getCppDocPrompt(name: string, repoType: string, description: string): string {
  return `You are a technical documentation writer for the AGENTS multi-agent orchestration platform.
Generate a comprehensive documentation page for "${name}" (type: ${repoType}).

This is a C++20 project. Include these sections:
- **Overview**: What it does, architecture philosophy, tech stack
- **Module Architecture**: Key modules/subsystems, their responsibilities, data flow between them
- **Key Classes**: Important classes with brief descriptions of their role
- **V8 Scripting API**: JavaScript interface and how scripts interact with the engine (if applicable)
- **Build & Configuration**: Build system (MSBuild/Visual Studio), dependencies, platform requirements
- **Integration with AGENTS**: How it connects to the KĀDI broker/platform

Rules:
- Use actual class names, module names, file paths from the source context
- Include \`\`\`cpp code snippets for key patterns (copy from source headers, don't invent)
- Include \`\`\`javascript snippets for V8 scripting API (if applicable)
- Keep under 400 lines total
- Write for developers who need to understand and modify this code
- Do NOT include generic boilerplate or npm/node commands
- Do NOT wrap output in a code block — output raw markdown
- Start with "# ${name}" as the first line
- Include a one-line description blockquote after the title: > ${description}
- If the source shows a module structure diagram (mermaid), include it
- Focus on architecture and how components interact, not line-by-line code explanation`;
}

// ── Caching ───────────────────────────────────────────────────────────

function getContextHash(context: string): string {
  // v2: includes H1-stripping fix — invalidates old cache
  return crypto.createHash('sha256').update('v2:' + context).digest('hex').slice(0, 16);
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

  // Collect work items (skip cached and missing repos)
  const workItems: Array<{ name: string; repo: RepoConfig; repoPath: string; context: string; hash: string }> = [];

  for (const [name, repo] of Object.entries(repos)) {
    if (filterRepos && !filterRepos.includes(name)) continue;

    const repoPath = path.resolve(path.dirname(CONFIG_PATH), repo.path);
    if (!fs.existsSync(repoPath)) {
      console.log(`[generate-docs] SKIP ${name} — path not found: ${repoPath}`);
      continue;
    }

    const context = collectSourceContext(repoPath, repo.crawl, repo.type);
    const hash = getContextHash(context);

    if (!force && isCached(name, hash)) {
      // Verify output file still exists (sync step may have overwritten it)
      const subdir = getOutputSubdir(name, repo.type);
      const outputFile = path.join(DOCS_DIR, subdir, 'index.md');
      if (fs.existsSync(outputFile)) {
        continue;
      }
    }

    workItems.push({ name, repo, repoPath, context, hash });
  }

  if (workItems.length === 0) {
    return 0;
  }

  console.log(`[generate-docs] ${workItems.length} repos to generate (concurrency: ${CONCURRENCY})`);

  // Process in parallel with concurrency limit
  const processItem = async (item: typeof workItems[0]): Promise<boolean> => {
    const { name, repo, context, hash } = item;
    console.log(`[generate-docs] Generating: ${name} (${repo.type})…`);

    try {
      const markdown = await generateDocPage(name, repo.type, repo.description, context, mmConfig);

      if (!markdown || markdown.length < 100) {
        console.warn(`[generate-docs] ${name}: LLM returned empty/short response, skipping`);
        return false;
      }

      const finalContent = ensureFrontmatter(markdown, name, repo.description);
      const subdir = getOutputSubdir(name, repo.type);
      const outputDir = path.join(DOCS_DIR, subdir);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(path.join(outputDir, 'index.md'), finalContent);
      writeCache(name, hash);

      console.log(`[generate-docs] ${name}: done (${finalContent.split('\n').length} lines)`);
      return true;
    } catch (err: any) {
      console.error(`[generate-docs] ${name}: FAILED — ${err.message}`);
      return false;
    }
  };

  // Concurrency-limited execution
  let active = 0;
  let index = 0;
  const results: Promise<boolean>[] = [];

  const next = (): Promise<boolean> | null => {
    if (index >= workItems.length) return null;
    const item = workItems[index++];
    return processItem(item);
  };

  const worker = async () => {
    while (index < workItems.length) {
      const promise = next();
      if (!promise) break;
      const success = await promise;
      if (success) generated++;
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, () => worker());
  await Promise.all(workers);

  return generated;
}

function ensureFrontmatter(markdown: string, name: string, description: string): string {
  if (markdown.startsWith('---')) return markdown;
  // Strip leading H1 — Starlight renders the frontmatter title as the page heading
  const stripped = markdown.replace(/^#\s+.+\n+/, '');
  return `---\ntitle: "${name}"\ndescription: "${description}"\n---\n\n${stripped}`;
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
