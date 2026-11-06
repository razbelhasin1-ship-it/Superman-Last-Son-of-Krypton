import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, watch: { ignored: ['**/.claude/**', '**/qa/**'] } },
  // Only the game's own entry: never crawl agent worktrees or QA pages for dependency pre-bundling.
  optimizeDeps: { entries: ['index.html'] },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.claude/**'],
    environment: 'node',
    testTimeout: 60000,
  },
});
