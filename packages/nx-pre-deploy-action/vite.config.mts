import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/nx-pre-deploy-action',
  plugins: [tsconfigPaths()],
  test: {
    name: 'packages-nx-pre-deploy-action',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/nx-pre-deploy-action',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
