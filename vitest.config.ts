import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      'node_modules/**',
      'mobile/e2e/**',
      'dist/**',
      '**/node_modules/**'
    ],
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'mobile/',
        'test/',
        '**/*.test.js',
        '**/*.test.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});
