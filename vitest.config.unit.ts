/**
 * Vitest configuration for Unit Tests
 *
 * This config only runs unit tests (*.test.ts), excluding integration tests.
 *
 * Usage: npm run test:unit
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    pool: 'forks',
    isolate: true,
    include: ['**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
