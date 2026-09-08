import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests for the pure engine run in node; DOM-shaped tests (selectors,
// measurements) opt in per file with `// @vitest-environment happy-dom`.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['studio/**/*.test.ts', 'shared/**/*.test.ts', 'entrypoints/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
  },
});
