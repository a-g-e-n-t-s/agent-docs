import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://docs.agents.kadi.build',
  server: { port: 3333 },

  integrations: [
    starlight({
      title: 'AGENTS',
      description: 'Multi-Agent Orchestration Platform',

      // Agent-quest dark theme
      customCss: ['./src/styles/theme.css'],

      // Sidebar
      sidebar: [
        {
          label: 'Getting Started',
          items: [{ label: 'Introduction', slug: 'intro' }],
        },
        {
          label: 'Architecture',
          autogenerate: { directory: 'architecture' },
        },
        {
          label: 'Agents',
          autogenerate: { directory: 'agents' },
        },
        {
          label: 'Abilities',
          autogenerate: { directory: 'abilities' },
        },
        {
          label: 'Packages',
          autogenerate: { directory: 'packages' },
        },
        {
          label: 'Engine',
          autogenerate: { directory: 'engine' },
        },
        {
          label: 'DaemonAgent',
          autogenerate: { directory: 'daemon-agent' },
        },
      ],

      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/dadavidtseng/AGENTS' },
      ],
    }),
    react(),
  ],
});
