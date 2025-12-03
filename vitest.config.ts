import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    pool: 'threads',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        'datasets/**',
        'docs/**',
        '*.config.ts',
        '*.config.js',
        'src/cli.ts' // Exclude CLI from coverage (hard to test interactively)
      ],
      include: ['src/api.ts', 'src/utils.ts', 'src/config.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    },

    // Test globals (allows using describe/it without imports)
    globals: false, // Explicit imports for clarity

    // Reporter
    reporter: 'verbose',

    // Timeout
    testTimeout: 10000,

    // Include/exclude patterns
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'datasets/**', 'docs/**'],

    // Watch mode settings
    watch: false,

    // Bail on first test failure in CI
    bail: process.env.CI ? 1 : 0
  }
});
