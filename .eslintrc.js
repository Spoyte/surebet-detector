module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
  },
  globals: {
    describe: 'readonly',
    test: 'readonly',
    it: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
    vi: 'readonly',
    NodeJS: 'readonly',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'warn',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.test.ts'],
      globals: {
        jest: 'readonly',
        it: 'readonly',
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    {
      files: ['src/distributed-tracing*.js', 'src/event-sourcing*.js', 'src/saga-pattern*.js', 'src/tracing-integration.js'],
      parserOptions: {
        sourceType: 'module',
      },
    },
  ],
};
