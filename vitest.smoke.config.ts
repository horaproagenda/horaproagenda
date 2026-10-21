import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/smoke/**/*.smoke.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    // As suítes compartilham conta e profissional; Vitest 4 removeu singleFork.
    fileParallelism: false,
    maxWorkers: 1,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
