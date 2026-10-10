import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/shared/util/tailwind',
  plugins: [react(), tsconfigPaths()],

  test: {
    name: 'shared-util-tailwind',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/shared/util/tailwind',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
