import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir:
    '../../../../node_modules/.vite/libs/app-cms/feature/component-builder',
  plugins: [tsconfigPaths()],
  test: {
    name: 'app-cms-feature-component-builder',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/app-cms/feature/component-builder',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
