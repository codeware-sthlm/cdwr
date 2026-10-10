import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/shared/feature/infisical',
  plugins: [tsconfigPaths()],
  test: {
    name: 'shared-feature-infisical-integration',
    maxWorkers: 1,
    isolate: false,
    globals: true,
    watch: false,
    environment: 'node',
    include: [
      'integration-tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/shared/feature/infisical/integration-tests',
      provider: 'v8'
    },
    testTimeout: 30000, // 30s timeout for API calls
    setupFiles: ['integration-tests/setup.ts'],
    passWithNoTests: false,
    // Run tests serially to avoid rate limiting and resource conflicts
    pool: 'forks'
  }
});
