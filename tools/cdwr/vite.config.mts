import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/tools/cdwr',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'cdwr',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tools/cdwr',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
