/**
 * LLM-enhanced README generation — reads source code and uses
 * model-manager to generate or update README.md files.
 *
 * Behavior:
 *   - Detects which repos have source changes (content hash)
 *   - For changed repos: LLM sees existing README + new source → updates only what's outdated
 *   - Concurrent processing (5 parallel LLM calls)
 *   - Preserves hand-written content that's still accurate
 *
 * Usage:
 *   npx tsx scripts/readme-gen-llm.ts              # all changed repos
 *   npx tsx scripts/readme-gen-llm.ts --force      # regenerate all
 *   npx tsx scripts/readme-gen-llm.ts --repos ability-graph,ability-memory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'readme-gen');

const MODEL = 'gpt-5-mini';
const MAX_SOURCE_CHARS = 12000;
const CONCURRENCY = 5;

interface RepoConfig {
  path: string;
  type: string;
  crawl: string[];
  description?: string;
}

interface ModelManagerConfig {
  baseUrl: string;
  apiKey: string;
}

// ── Credentials ───────────────────────────────────────────────────────

function getModelManagerConfig(): ModelManagerConfig | null {
  if (process.env.MODEL_MANAGER_BASE_URL && process.env.MODEL_MANAGER_API_KEY) {
    return {
      baseUrl: process.env.MODEL_MANAGER_BASE_URL,
      apiKey: process.env.MODEL_MANAGER_API_KEY,
    };
  }

  try {
    const baseUrl = execSync('kadi secret get MODEL_MANAGER_BASE_URL', { encoding: 'utf-8', timeout: 5000 }).trim();
    const apiKey = execSync('kadi secret get MODEL_MANAGER_API_KEY', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (baseUrl && apiKey) return { baseUrl, apiKey };
  } catch { /* not available */ }

  return null;
}

// ── Source Context ────────────────────────────────────────────────────

function extractSourceContext(repoPath: string): string {
  const parts: string[] = [];

  const agentJsonPath = path.join(repoPath, 'agent.json');
  if (fs.existsSync(agentJsonPath)) {
    parts.push('=== agent.json ===');
    parts.push(fs.readFileSync(agentJsonPath, 'utf-8'));
  }

  const configTomlPath = path.join(repoPath, 'config.toml');
  if (fs.existsSync(configTomlPath)) {
    parts.push('=== config.toml ===');
    parts.push(fs.readFileSync(configTomlPath, 'utf-8'));
  }

  const srcDir = path.join(repoPath, 'src');
  if (fs.existsSync(srcDir)) {
    const toolsDir = path.join(srcDir, 'tools');
    if (fs.existsSync(toolsDir)) {
      const toolSnippets: string[] = [];
      for (const file of fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts')).slice(0, 8)) {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        const matches = content.matchAll(/name:\s*['"`]([^'"`]+)['"`][\s\S]*?description:\s*['"`]([^'"`]+)['"`]/g);
        for (const match of matches) {
          toolSnippets.push(`- ${match[1]}: ${match[2]}`);
        }
      }
      if (toolSnippets.length > 0) {
        parts.push('=== Registered Tools ===');
        parts.push(toolSnippets.join('\n'));
      }
    }

    for (const entry of ['index.ts', 'agent.ts']) {
      const entryPath = path.join(srcDir, entry);
      if (fs.existsSync(entryPath)) {
        const content = fs.readFileSync(entryPath, 'utf-8');
        const lines = content.split('\n').slice(0, 100).join('\n');
        parts.push(`=== src/${entry} (first 100 lines) ===`);
        parts.push(lines);
        break;
      }
    }
  }

  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      parts.push('=== Dependencies ===');
      parts.push(JSON.stringify({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies }, null, 2));
    } catch { /* skip */ }
  }

  const combined = parts.join('\n\n');
  return combined.length > MAX_SOURCE_CHARS ? combined.slice(0, MAX_SOURCE_CHARS) + '\n...(truncated)' : combined;
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

// ── LLM Call ──────────────────────────────────────────────────────────

async function updateReadmeWithLLM(
  name: string,
  repoType: string,
  sourceContext: string,
  existingReadme: string | null,
  config: ModelManagerConfig,
): Promise<string> {
  const isUpdate = existingReadme && existingReadme.length > 200;

  const systemPrompt = isUpdate
    ? `You are updating an existing README.md for "${name}" (type: ${repoType}) in the AGENTS platform.

Rules:
- Compare the existing README against the updated source context
- Only modify sections that are outdated, incomplete, or missing based on the new source
- Preserve hand-written content, custom sections, and formatting that is still accurate
- Add new sections only if the source shows new functionality not documented
- Keep the same markdown structure and style as the existing README
- If nothing needs changing, return the README unchanged
- Do NOT wrap output in a code block — output raw markdown
- Keep it under 300 lines
- Be specific — use actual tool names, config fields, file paths from the source`
    : `You are generating a README.md for "${name}" (type: ${repoType}) in the AGENTS platform.

Rules:
- Include sections: Overview, Quick Start, Tools (table), Configuration, Architecture, Development
- For Tools: create a markdown table with | Tool | Description | columns
- For Architecture: describe data flow and key components
- For Quick Start: include actual commands (npm install, kadi run start)
- Do NOT include badges or external images
- Do NOT wrap output in a code block — output raw markdown
- Start with "# ${name}" as the first line
- Include a one-line description blockquote after the title
- Be specific — use actual tool names, config fields, file paths from the source
- Keep it under 300 lines`;

  const userPrompt = isUpdate
    ? `Here is the current README:\n\n${existingReadme}\n\n---\n\nHere is the updated source context:\n\n${sourceContext}\n\nUpdate the README to reflect any changes. Only modify what's outdated.`
    : `Generate a README.md for this package. Here is the source code context:\n\n${sourceContext}`;

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
      max_tokens: 4000,
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

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const repos: Record<string, RepoConfig> = config.repos;

  const mmConfig = getModelManagerConfig();
  if (!mmConfig) {
    console.error('[readme-gen] No model-manager credentials found. Set MODEL_MANAGER_BASE_URL and MODEL_MANAGER_API_KEY.');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const reposIdx = process.argv.indexOf('--repos');
  const filterRepos = reposIdx !== -1 ? process.argv[reposIdx + 1]?.split(',') : null;

  // Collect work items
  const workItems: Array<{ name: string; repo: RepoConfig; repoPath: string; context: string; hash: string; existingReadme: string | null }> = [];

  for (const [name, repo] of Object.entries(repos)) {
    if (filterRepos && !filterRepos.includes(name)) continue;

    const repoPath = path.resolve(PROJECT_ROOT, repo.path);
    if (!fs.existsSync(repoPath)) {
      console.log(`[readme-gen] SKIP ${name} — path not found`);
      continue;
    }

    const context = extractSourceContext(repoPath);
    const hash = getContextHash(context);

    if (!force && isCached(name, hash)) {
      continue;
    }

    const readmePath = path.join(repoPath, 'README.md');
    const existingReadme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : null;

    workItems.push({ name, repo, repoPath, context, hash, existingReadme });
  }

  if (workItems.length === 0) {
    console.log('[readme-gen] All READMEs up to date (no source changes detected)');
    return;
  }

  console.log(`[readme-gen] ${workItems.length} repos to process (concurrency: ${CONCURRENCY})`);

  let updated = 0;

  const processItem = async (item: typeof workItems[0]): Promise<boolean> => {
    const { name, repo, repoPath, context, hash, existingReadme } = item;
    const action = existingReadme ? 'Updating' : 'Generating';
    console.log(`[readme-gen] ${action}: ${name}…`);

    try {
      const readme = await updateReadmeWithLLM(name, repo.type, context, existingReadme, mmConfig);

      if (!readme || readme.length < 100) {
        console.warn(`[readme-gen] ${name}: LLM returned empty/short response, skipping`);
        return false;
      }

      const readmePath = path.join(repoPath, 'README.md');
      fs.writeFileSync(readmePath, readme, 'utf-8');
      writeCache(name, hash);
      console.log(`[readme-gen] ${name}: done (${readme.length} chars)`);
      return true;
    } catch (err: any) {
      console.error(`[readme-gen] ${name}: FAILED — ${err.message}`);
      return false;
    }
  };

  // Concurrent worker pool
  let index = 0;
  const worker = async () => {
    while (index < workItems.length) {
      const item = workItems[index++];
      const success = await processItem(item);
      if (success) updated++;
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, () => worker());
  await Promise.all(workers);

  console.log(`[readme-gen] Done — ${updated} READMEs updated`);
}

main().catch(err => {
  console.error('[readme-gen] Fatal:', err);
  process.exit(1);
});
