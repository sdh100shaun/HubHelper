export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@github/copilot-sdk$': '<rootDir>/src/__mocks__/@github/copilot-sdk.ts',
    '^@octokit/auth-app$': '<rootDir>/src/__mocks__/@octokit/auth-app.ts',
    '^@octokit/rest$': '<rootDir>/src/__mocks__/@octokit/rest.ts',
  },
  // TypeScript is compiled for tests by Babel rather than ts-jest, because
  // ts-jest relies on the TypeScript compiler API that TypeScript 7 (the native
  // compiler) no longer exposes. babel-jest also applies babel-preset-jest, which
  // hoists jest.mock() calls above imports exactly as ts-jest did. Babel strips
  // types without checking them: `npm run typecheck` covers the test files.
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: false }]],
        plugins: [
          // TC39 (stage 3) decorators, as emitted by TypeScript without
          // experimentalDecorators — used by @registerEvaluator.
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
          '@babel/plugin-transform-modules-commonjs',
          // import() -> require(), as ts-jest emitted for CommonJS output.
          '@babel/plugin-transform-dynamic-import',
        ],
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
