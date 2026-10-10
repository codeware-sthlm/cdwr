import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/shared/util/misc',
  plugins: [tsconfigPaths()],
  test: {
    name: 'shared-util-misc',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/shared/util/misc',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
