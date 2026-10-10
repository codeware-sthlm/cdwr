import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/app-cms/util/definitions',
  plugins: [tsconfigPaths()],
  test: {
    name: 'app-cms-util-definitions',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/app-cms/util/definitions',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
