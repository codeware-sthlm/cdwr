import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/cdwr',
  plugins: [
    tsconfigPaths({ projects: ['../../tsconfig.base.json'] }),
    nxReadySignal()
  ],
  test: {
    name: 'cdwr',
    watch: false,
    globals: true,
    environment: 'node',
    // Nx loads tools/cdwr/.env into the task; no spec may reach the real telemetry database
    env: { AGENT_SUPABASE_URL: '', AGENT_SUPABASE_SERVICE_KEY: '' },
    include: [
      'src/**/*.spec.{ts,tsx}',
      'bin/**/*.spec.mjs',
      'agent-queue/supabase/functions/**/*.spec.ts'
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tools/cdwr',
      provider: 'v8'
    },
    passWithNoTests: true
  }
});
