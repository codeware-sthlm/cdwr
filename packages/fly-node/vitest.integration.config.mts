import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/fly-node-integration',
  plugins: [tsconfigPaths()],
  test: {
    name: 'packages-fly-node-integration',
    maxWorkers: 1,
    isolate: false,
    globals: true,
    watch: false,
    environment: 'node',
    include: ['integration-tests/**/*.integration.test.ts'],
    coverage: {
      reportsDirectory: '../../coverage/packages/fly-node/integration-tests',
      provider: 'v8'
    },
    setupFiles: ['integration-tests/setup.ts'],
    passWithNoTests: false,
    // Longer timeout for real API calls and deployments
    testTimeout: 300000, // 5 minutes
    hookTimeout: 120000, // 2 minutes for deploy/destroy during setup/teardown
    // Run tests serially to avoid rate limiting and resource conflicts
    pool: 'forks'
  }
});
