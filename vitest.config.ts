import { defineConfig } from 'vitest/config';

// One test run for the whole monorepo; each workspace is a project.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'services/api', 'apps/web'],
  },
});
