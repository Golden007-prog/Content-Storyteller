import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Allow tests to import from '@content-storyteller/shared' without
      // building dist first — resolves directly to TypeScript source.
      '@content-storyteller/shared': path.resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    root: '.',
    passWithNoTests: true,
  },
});
