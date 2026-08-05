import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    restoreMocks: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@core': fileURLToPath(new URL('../../packages/core/', import.meta.url))
      // No react / react-dom aliases: npm workspaces hoists both to the repo
      // root, so pointing at apps/web/node_modules resolved to nothing and every
      // test file failed to load. Normal resolution finds the single hoisted copy.
    }
  }
});
