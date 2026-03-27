/**
 * TypeScript interfaces for config.json — the single source of truth
 * for all agent-docs configuration.
 *
 * Simplified from kadi-docs: no TypeDoc, no VPS deploy, no reports.
 * Focused on repo crawling, site building, and search indexing.
 */

export interface DocsConfig {
  site: SiteConfig;
  repos: Record<string, RepoConfig>;
  output: OutputConfig;
  agent: AgentConfig;
}

export interface SiteConfig {
  title: string;
  tagline: string;
  domain: string;
  baseUrl: string;
  port: number;
}

export interface RepoConfig {
  /** Relative path from agent-docs/ to the repo root */
  path: string;
  /** Human-readable description */
  description?: string;
  /** Repo type — determines crawl strategy and README template */
  type: 'kadi-monorepo' | 'kadi-agent' | 'kadi-ability' | 'kadi-package' | 'cpp-engine' | 'cpp-game';
  /** Glob patterns for files to crawl */
  crawl: string[];
  /** Whether to generate TypeDoc API docs */
  generateApi?: boolean;
  /** TypeDoc entry points (if generateApi is true) */
  entryPoints?: string[];
}

export interface OutputConfig {
  buildDir: string;
  deployTarget: string;
}

export interface AgentConfig {
  name: string;
  version: string;
  description: string;
  defaultBroker?: string;
  brokers: Record<string, string>;
  networks: string[];
  abilities: Record<string, string>;
  secrets: {
    vault: string;
    required: string[];
    optional: string[];
  };
}
