import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(({ mode }) => {
  // Server functions read `process.env`, which Vite does not fill from `.env`;
  // anything already set in the shell wins
  process.env = {
    ...loadEnv(mode, import.meta.dirname, ''),
    ...process.env
  };

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/headless',
    server: { port: 4300 },
    plugins: [
      tsconfigPaths({ projects: ['../../tsconfig.base.json'] }),
      tailwindcss(),
      tanstackStart(),
      nitro(),
      // React's plugin after Start's, as its docs say
      react(),
      nxReadySignal()
    ]
  };
});
