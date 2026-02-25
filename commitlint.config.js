/**
 * Commitlint configuration for conventional commits
 *
 * This project follows the Conventional Commits specification:
 * https://www.conventionalcommits.org/
 *
 * Format: <type>(<scope>): <subject>
 *
 * Example: feat(auth): add OAuth2 authentication
 */

export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // Type enum - allowed commit types
    'type-enum': [
      2,
      'always',
      [
        'feat',      // New feature
        'fix',       // Bug fix
        'docs',      // Documentation only changes
        'style',     // Code style changes (formatting, missing semicolons, etc)
        'refactor',  // Code refactoring (neither fixes a bug nor adds a feature)
        'perf',      // Performance improvements
        'test',      // Adding or updating tests
        'build',     // Changes to build system or external dependencies
        'ci',        // Changes to CI configuration files and scripts
        'chore',     // Other changes that don't modify src or test files
        'revert',    // Reverts a previous commit
        'security',  // Security improvements or fixes
      ],
    ],

    // Scope enum - optional but validated if present
    'scope-enum': [
      1, // Warning, not error
      'always',
      [
        // Core components
        'analyzer',
        'fetcher',
        'reporter',
        'cli',
        'api',

        // Features
        'auth',
        'security',
        'compliance',
        'watch',
        'sbom',

        // Infrastructure
        'ci',
        'deps',
        'config',
        'docs',
        'test',

        // Release
        'release',
      ],
    ],

    // Subject rules
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // Type rules
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // Body rules
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],

    // Footer rules
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],

    // Header rules
    'header-max-length': [2, 'always', 100],

    // Scope rules
    'scope-case': [2, 'always', 'lower-case'],
  },

  // Ignore certain commits (e.g., merge commits, revert commits)
  ignores: [
    (commit) => commit.includes('Merge branch'),
    (commit) => commit.includes('Merge pull request'),
  ],

  // Help message for invalid commits
  helpUrl: 'https://www.conventionalcommits.org/',
};
