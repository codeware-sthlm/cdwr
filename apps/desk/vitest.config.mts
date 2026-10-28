import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desk-test',
  test: {
    name: 'desk',
    watch: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default']
  }
});
