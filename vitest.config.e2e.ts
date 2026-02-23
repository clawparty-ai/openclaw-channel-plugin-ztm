/**
 * Vitest configuration for e2e Tests
 *
 * This config only runs e2e tests (*.e2e.test.ts), excluding unit & integration tests.
 *
 * Usage: npm run test:e2e
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 300000, // e2e tests may take longer (300 seconds)
    pool: 'forks',
    isolate: true,
    include: ['**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**'],
  },
});
