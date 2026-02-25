# Contributing Guide

Thank you for your interest in contributing to this project! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Code Style](#code-style)

## Code of Conduct

This project follows a standard code of conduct. Be respectful, inclusive, and collaborative.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm (comes with Node.js)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/sdh100shaun/gh-tools.git
cd gh-tools

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

## Development Workflow

1. **Create a branch** for your feature or fix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with proper testing

3. **Lint and format** your code
   ```bash
   npm run lint
   npm run format
   ```

4. **Run tests** to ensure nothing breaks
   ```bash
   npm test
   npm run test:coverage
   ```

5. **Commit your changes** following our [commit guidelines](#commit-message-guidelines)

6. **Push and create a Pull Request**

## Commit Message Guidelines

This project follows the **Conventional Commits** specification to maintain a clean, semantic commit history.

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, whitespace, etc.)
- **refactor**: Code changes that neither fix a bug nor add a feature
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Changes to build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit
- **security**: Security improvements or fixes

### Scope

Optional but recommended. Indicates what part of the codebase is affected:

- `analyzer` - Analysis engine changes
- `fetcher` - GitHub data fetching
- `reporter` - Output/reporting functionality
- `cli` - Command-line interface
- `api` - API changes
- `auth` - Authentication
- `security` - Security features
- `compliance` - Compliance checking
- `watch` - Watch mode functionality
- `sbom` - SBOM generation
- `ci` - CI/CD pipelines
- `deps` - Dependency updates
- `config` - Configuration files
- `docs` - Documentation
- `test` - Test files

### Subject

- Use imperative, present tense: "add" not "added" nor "adds"
- Don't capitalize the first letter
- No period (.) at the end
- Keep it under 100 characters

### Examples

```bash
# Feature with scope
feat(auth): add OAuth2 authentication support

# Bug fix
fix(api): resolve race condition in data fetcher

# Documentation
docs(readme): update installation instructions

# Breaking change
feat(api)!: change response format to match OpenAPI spec

BREAKING CHANGE: API responses now follow OpenAPI 3.0 schema
```

### Automated Validation

#### Optional Git Hook (Recommended)

Install a git hook to validate commits automatically:

```bash
npm run hooks:install
```

This will validate your commit messages before they're created. To uninstall:

```bash
npm run hooks:uninstall
```

#### Manual Validation

Validate your last commit:

```bash
npm run commit:validate
```

Validate all commits since main:

```bash
npm run commitlint:all
```

#### CI Validation

All Pull Requests are automatically validated by GitHub Actions. Non-compliant commits will fail the CI check.

### Breaking Changes

If your change includes breaking changes, add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(api)!: change authentication method

BREAKING CHANGE: Replaced token-based auth with OAuth2.
Update your integration to use the new OAuth2 flow.
```

## Pull Request Process

1. **Update documentation** if you've changed APIs or added features

2. **Add tests** for new functionality

3. **Ensure all checks pass**:
   - ✅ Linting (Biome)
   - ✅ Tests (Jest)
   - ✅ Build
   - ✅ Commit message validation
   - ✅ Security audit

4. **Update CHANGELOG.md** if your change is user-facing

5. **Fill out the PR template** with:
   - Description of changes
   - Type of change (feature, fix, breaking change, etc.)
   - Related issues
   - Testing performed
   - Screenshots (if applicable)

6. **Request review** from maintainers

7. **Address feedback** and push updates

### PR Title Convention

PR titles should also follow Conventional Commits format:

```
feat(auth): add OAuth2 authentication
fix(api): resolve race condition
docs(readme): update installation guide
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place tests in `src/__tests__/` directory
- Name test files with `.test.ts` extension
- Aim for >75% coverage per file
- Test both success and error cases
- Mock external dependencies

Example test structure:

```typescript
import { describe, expect, it } from '@jest/globals';
import { MyClass } from '../services/my-class.js';

describe('MyClass', () => {
  it('should do something correctly', () => {
    const instance = new MyClass();
    const result = instance.doSomething();
    expect(result).toBe(expected);
  });

  it('should handle errors gracefully', () => {
    const instance = new MyClass();
    expect(() => instance.throwError()).toThrow();
  });
});
```

## Code Style

This project uses **Biome** for linting and formatting.

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Formatting

```bash
# Format code
npm run format
```

### Key Rules

- Use ESM imports with `.js` extension
- Use TypeScript for type safety
- Prefer `const` over `let`
- Use descriptive variable names
- Add comments for complex logic
- Keep functions small and focused
- Avoid any types - use proper TypeScript types

## Security

- Never commit secrets, tokens, or credentials
- Use environment variables for sensitive data
- Run `npm audit` regularly
- Follow secure coding practices
- Report security issues privately (see SECURITY.md)

## Documentation

When adding features, please update:

- README.md - for user-facing changes
- docs/ - for detailed guides
- Code comments - for complex logic
- CHANGELOG.md - for notable changes

## Questions?

- Open an issue for questions about the codebase
- Check existing issues and discussions first
- Be respectful and provide context

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers this project.

---

Thank you for contributing! 🎉
