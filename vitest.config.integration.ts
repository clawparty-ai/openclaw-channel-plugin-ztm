/**
 * Vitest configuration for Integration Tests
 *
 * This config only runs integration tests (*.integration.test.ts), excluding unit tests.
 *
 * Usage: npm run test:integration
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000, // Integration tests may take longer (60 seconds)
    pool: 'forks',
    isolate: true,
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
  },
});
