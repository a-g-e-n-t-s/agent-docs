/**
 * LLM-enhanced README generation — reads source code and uses
 * model-manager chat-completion to generate rich documentation.
 *
 * Flow:
 *   1. Read agent.json + source files (tool registrations, index.ts)
 *   2. Call model-manager chat-completion with source context
 *   3. Generate/update README.md with rich content
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');

// ── Config ──

interface RepoConfig {
  path: string;
  type: string;
  crawl: string[];
  description?: string;
}

const MODEL = 'gpt-5-mini';
const MAX_SOURCE_CHARS = 12000; // Max source context per repo

// ── Secrets (walk-up discovery) ──

function findSecretsToml(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'secrets.toml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getModelManagerConfig(): { baseUrl: string; apiKey: string } | null {
  // Try env vars first
  if (process.env.MODEL_MANAGER_BASE_URL && process.env.MODEL_MANAGER_API_KEY) {
    return {
      baseUrl: process.env.MODEL_MANAGER_BASE_URL,
      apiKey: process.env.MODEL_MANAGER_API_KEY,
    };
  }

  // Try kadi secret get
  try {
    const baseUrl = execSync('kadi secret get MODEL_MANAGER_BASE_URL', { encoding: 'utf-8', timeout: 5000 }).trim();
    const apiKey = execSync('kadi secret get MODEL_MANAGER_API_KEY', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (baseUrl && apiKey) return { baseUrl, apiKey };
  } catch { /* fallback */ }

  return null;
}

// ── Source Code Extraction ──

function extractToolRegistrations(srcDir: string): string {
  const toolFiles: string[] = [];
  const toolsDir = path.join(srcDir, 'tools');

  if (fs.existsSync(toolsDir)) {
    for (const file of fs.readdirSync(toolsDir)) {
      if (file.endsWith('.ts') && file !== 'index.ts') {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        // Extract tool name and description from registerTool calls
        const matches = content.matchAll(/name:\s*['"`]([^'"`]+)['"`][\s\S]*?description:\s*['"`]([^'"`]+)['"`]/g);
        for (const match of matches) {
          toolFiles.push(`- ${match[1]}: ${match[2]}`);
        }
      }
    }
  }

  return toolFiles.length > 0 ? toolFiles.join('\n') : '';
}

function extractSourceContext(repoPath: string): string {
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

  // Tool registrations
  const srcDir = path.join(repoPath, 'src');
  if (fs.existsSync(srcDir)) {
    const tools = extractToolRegistrations(srcDir);
    if (tools) {
      parts.push('=== Registered Tools ===');
      parts.push(tools);
    }

    // index.ts / agent.ts (entry point)
    for (const entry of ['index.ts', 'agent.ts']) {
      const entryPath = path.join(srcDir, entry);
      if (fs.existsSync(entryPath)) {
        const content = fs.readFileSync(entryPath, 'utf-8');
        if (content.length < 5000) {
          parts.push(`=== src/${entry} ===`);
          parts.push(content);
        } else {
          // Just the first 100 lines
          parts.push(`=== src/${entry} (first 100 lines) ===`);
          parts.push(content.split('\n').slice(0, 100).join('\n'));
        }
      }
    }
  }

  // package.json (for dependencies)
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

// ── LLM Call ──

async function generateReadmeWithLLM(
  name: string,
  repoType: string,
  sourceContext: string,
  config: { baseUrl: string; apiKey: string },
): Promise<string> {
  const systemPrompt = `You are a technical documentation writer for the AGENTS multi-agent orchestration platform.
Generate a comprehensive README.md for the package "${name}" (type: ${repoType}).

Rules:
- Write in clear, concise technical English
- Include ALL sections: Overview, Quick Start, Tools (with table), Configuration, Architecture, Development
- For the Tools section, create a proper markdown table with | Tool | Description | columns
- For Architecture, describe the data flow and key components
- For Quick Start, include actual commands (npm install, kadi install, kadi run start)
- Do NOT include badges, shields, or external images
- Do NOT wrap the output in a code block — output raw markdown directly
- Start with "# ${name}" as the first line
- Include a one-line description blockquote after the title
- Be specific — use actual tool names, actual config fields, actual file paths from the source context
- If the source shows tool registrations, document each tool with its actual name and description
- Keep it under 300 lines`;

  const userPrompt = `Generate a README.md for this package. Here is the source code context:\n\n${sourceContext}`;

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
    throw new Error(`Model-manager HTTP ${response.status}: ${text}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// ── Main ──

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const repos: Record<string, RepoConfig> = config.repos;

  // Get model-manager credentials
  const mmConfig = getModelManagerConfig();
  if (!mmConfig) {
    console.error('[readme-gen] ERROR: MODEL_MANAGER_BASE_URL and MODEL_MANAGER_API_KEY not found.');
    console.error('[readme-gen] Set them as env vars or ensure secrets.toml is accessible via `kadi secret get`.');
    process.exit(1);
  }

  console.log(`[readme-gen] Model-manager: ${mmConfig.baseUrl}`);
  console.log(`[readme-gen] Model: ${MODEL}`);

  // Filter repos to process
  const targetRepos = process.argv.slice(2);
  let updated = 0;
  let skipped = 0;

  for (const [name, repo] of Object.entries(repos)) {
    if (targetRepos.length > 0 && !targetRepos.includes(name)) continue;

    const repoPath = path.resolve(PROJECT_ROOT, repo.path);
    if (!fs.existsSync(repoPath)) {
      console.log(`[readme-gen] SKIP ${name} — path not found`);
      skipped++;
      continue;
    }

    const readmePath = path.join(repoPath, 'README.md');

    // Skip repos that already have substantial READMEs (>2KB)
    if (fs.existsSync(readmePath)) {
      const existing = fs.readFileSync(readmePath, 'utf-8');
      if (existing.length > 2000 && !existing.includes('<!-- TODO:')) {
        console.log(`[readme-gen] SKIP ${name} — README already has content (${existing.length} chars)`);
        skipped++;
        continue;
      }
    }

    console.log(`[readme-gen] Generating README for ${name}...`);

    try {
      const sourceContext = extractSourceContext(repoPath);
      const readme = await generateReadmeWithLLM(name, repo.type, sourceContext, mmConfig);

      if (readme && readme.length > 100) {
        fs.writeFileSync(readmePath, readme, 'utf-8');
        console.log(`[readme-gen] WROTE ${name}/README.md (${readme.length} chars)`);
        updated++;
      } else {
        console.log(`[readme-gen] SKIP ${name} — LLM returned empty/short response`);
        skipped++;
      }
    } catch (err: any) {
      console.error(`[readme-gen] ERROR ${name}: ${err.message}`);
      skipped++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[readme-gen] Done — ${updated} READMEs generated, ${skipped} skipped`);
}

main().catch(err => {
  console.error('[readme-gen] Fatal:', err);
  process.exit(1);
});
