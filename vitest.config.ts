import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // Scoped to source roots so repo copies under `.claude/worktrees` are
      // not picked up as duplicate projects
      '{apps,e2e,libs,packages,tools}/**/vite.config.{ts,mts}',
      '{apps,e2e,libs,packages,tools}/**/vitest.config.{ts,mts}'
    ]
  }
});
