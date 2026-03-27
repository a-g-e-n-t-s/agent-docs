/**
 * Config loader — reads config.json, validates structure, returns typed config.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { DocsConfig, RepoConfig } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');

export function loadConfig(): DocsConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config.json not found at ${CONFIG_PATH}. Run from the agent-docs project root.`);
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw) as DocsConfig;
  validateConfig(config);
  return config;
}

export function resolveRepoPath(config: DocsConfig, repoName: string): string {
  const repo = config.repos[repoName];
  if (!repo) {
    throw new Error(`Unknown repo "${repoName}". Available: ${Object.keys(config.repos).join(', ')}`);
  }
  return path.resolve(PROJECT_ROOT, repo.path);
}

export function getReposByType(config: DocsConfig, type: RepoConfig['type']): Record<string, RepoConfig> {
  return Object.fromEntries(
    Object.entries(config.repos).filter(([, repo]) => repo.type === type),
  );
}

function validateConfig(config: DocsConfig): void {
  if (!config.site) throw new Error('config.json: missing required section "site"');
  if (!config.repos || typeof config.repos !== 'object') throw new Error('config.json: missing required section "repos"');

  for (const field of ['title', 'tagline', 'domain', 'baseUrl'] as const) {
    if (!config.site[field]) throw new Error(`config.json: site.${field} is required`);
  }

  for (const [name, repo] of Object.entries(config.repos)) {
    if (!repo.path) throw new Error(`config.json: repos.${name}.path is required`);
    if (!repo.type) throw new Error(`config.json: repos.${name}.type is required`);
    if (!repo.crawl || !Array.isArray(repo.crawl)) throw new Error(`config.json: repos.${name}.crawl must be an array`);
  }
}
