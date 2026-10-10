import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/shared/ui/image',
  plugins: [react(), tsconfigPaths()],
  test: {
    name: 'shared-ui-image',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/shared/ui/image',
      provider: 'v8' as const
    },
    passWithNoTests: true
  }
}));
