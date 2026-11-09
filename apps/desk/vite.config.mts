/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// The shape @nx/react:application writes, plus what Tauri needs: the dev server on the port
// tauri.conf.json's devUrl names, and only that port; no screen clearing, so Tauri's own
// output stays readable; and VITE_ as the only prefix the page reads from the environment
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desk',
  clearScreen: false,
  envPrefix: ['VITE_'],
  server: {
    port: 1420,
    strictPort: true,
    host: 'localhost'
  },
  preview: {
    port: 1420,
    strictPort: true,
    host: 'localhost'
  },
  // vite-tsconfig-paths as every Vite config in the repo: the Docker build runs vite without
  // nx and without a project graph, which Nx's own paths plugin asks for
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths({ projects: ['../../tsconfig.base.json'] })
  ],
  build: {
    outDir: '../../dist/apps/desk',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  test: {
    name: 'desk',
    watch: false,
    globals: true,
    // The data layer's specs are pure; a component spec asks for jsdom in its docblock
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/desk',
      provider: 'v8' as const
    }
  }
}));
