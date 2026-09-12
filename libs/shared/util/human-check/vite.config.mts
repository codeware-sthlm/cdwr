import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/shared/util/human-check',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'shared-util-human-check',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/shared/util/human-check',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
