export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@github/copilot-sdk$': '<rootDir>/src/__mocks__/@github/copilot-sdk.ts',
    '^@octokit/auth-app$': '<rootDir>/src/__mocks__/@octokit/auth-app.ts',
    '^@octokit/rest$': '<rootDir>/src/__mocks__/@octokit/rest.ts',
  },
  // commander 15 ships as ES modules only; compile just that package to CommonJS for Jest.
  transformIgnorePatterns: ['/node_modules/(?!commander/)'],
  transform: {
    '^.+/node_modules/commander/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, checkJs: false, isolatedModules: true }, diagnostics: false },
    ],
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
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
