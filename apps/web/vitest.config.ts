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
      '@core': fileURLToPath(new URL('../../packages/core/', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react/', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom/', import.meta.url))
    }
  }
});
