import { defineConfig } from 'vite';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig({
  plugins: [nxReadySignal()],
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
  build: {
    outDir: '../../dist/apps/desk',
    emptyOutDir: true,
    reportCompressedSize: true
  }
});
