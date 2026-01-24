---
layout: page.njk
title: Contributing
description: Guide for contributing to GitHub Security Analysis Tools
githubEdit: true
---

## Welcome Contributors!

Thank you for your interest in contributing to GitHub Security Analysis Tools! This document provides guidelines and instructions for contributing to the project.

## Ways to Contribute

### 1. Report Bugs

Found a bug? Help us fix it!

**Before Reporting**:
- Check [existing issues](https://github.com/sdh100shaun/gh-tools/issues) to avoid duplicates
- Verify you're using the latest version
- Gather relevant information (Node version, command used, error message)

**How to Report**:
1. Open a [new issue](https://github.com/sdh100shaun/gh-tools/issues/new)
2. Use the bug report template
3. Provide:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs. actual behavior
   - Environment details (OS, Node version)
   - Error messages and stack traces

### 2. Suggest Features

Have an idea for improvement?

**Good Feature Requests Include**:
- Clear description of the feature
- Use cases and examples
- Why it would be valuable
- Potential implementation ideas (optional)

Open a [feature request issue](https://github.com/sdh100shaun/gh-tools/issues/new) to start the discussion.

### 3. Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples or use cases
- Improve API documentation
- Translate to other languages (future)

Edit pages directly using the "Edit this page on GitHub" links, or submit a pull request.

### 4. Submit Code

Ready to contribute code? Awesome!

## Development Setup

### Prerequisites

- **Node.js** 18.x, 20.x, or 22.x
- **npm** 8.x or later
- **Git** 2.x or later
- A **GitHub account**

### Getting Started

1. **Fork the Repository**

   Click "Fork" on [GitHub](https://github.com/sdh100shaun/gh-tools)

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/gh-tools.git
   cd gh-tools
   ```

3. **Add Upstream Remote**

   ```bash
   git remote add upstream https://github.com/sdh100shaun/gh-tools.git
   ```

4. **Install Dependencies**

   ```bash
   npm install
   ```

5. **Create a `.env` File**

   ```bash
   cp .env.example .env
   # Edit .env with your GitHub token and test organization
   ```

6. **Verify Setup**

   ```bash
   npm test        # Run tests
   npm run lint    # Check linting
   npm run build   # Build TypeScript
   ```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch Naming**:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements

### 2. Make Your Changes

**Code Style**:
- We use **Biome** for linting and formatting
- TypeScript strict mode is enabled
- Follow existing code patterns
- Add comments for complex logic

**Testing**:
- Write tests for new features
- Update tests for bug fixes
- Ensure all tests pass before submitting

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm run test:coverage # Coverage report
```

**Linting**:
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### 3. Commit Your Changes

We follow conventional commit messages:

```bash
git commit -m "feat: add workflow pause detection"
git commit -m "fix: handle null merged_by field"
git commit -m "docs: improve API reference examples"
git commit -m "test: add path traversal tests"
```

**Commit Types**:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting, whitespace
- `refactor:` - Code restructuring
- `test:` - Test updates
- `chore:` - Build, dependencies

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then:
1. Go to GitHub and click "Compare & pull request"
2. Fill out the PR template
3. Link related issues
4. Wait for CI checks to pass
5. Address review feedback

## Code Guidelines

### TypeScript

**Types**:
```typescript
// ✅ Good: Explicit types
function analyzeIssue(issue: SecurityIssue): AnalysisResult {
  // ...
}

// ❌ Bad: Implicit any
function analyzeIssue(issue) {
  // ...
}
```

**Strict Mode**:
- All code must pass TypeScript strict mode
- No `any` types unless absolutely necessary
- Proper null/undefined handling

### Testing

**Test Structure**:
```typescript
describe('SecurityAnalyzer', () => {
  describe('analyzeSelfMerges', () => {
    it('should detect self-merged PRs', () => {
      const pullRequests: PullRequest[] = [{
        author: 'user1',
        merged_by: 'user1',
        // ...
      }];

      const issues = analyzer.analyzeSelfMerges(pullRequests);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('self-merge');
    });
  });
});
```

**Coverage Goals**:
- Aim for >80% code coverage
- Test edge cases and error conditions
- Include integration tests for complex features

### Security

**CRITICAL**: All code changes must maintain security:

- ✅ Validate all user inputs
- ✅ Escape data before HTML output
- ✅ Validate file paths
- ✅ Add tests for security features
- ✅ Review for common vulnerabilities (XSS, injection, path traversal)

See [Security](/pages/security/) for detailed guidelines.

### Performance

**Best Practices**:
- Minimize API calls
- Use pagination for large datasets
- Cache when appropriate
- Avoid blocking operations in loops

## Pull Request Process

### 1. Before Submitting

**Checklist**:
- [ ] Tests pass locally (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run build`)
- [ ] Documentation updated (if needed)
- [ ] CHANGELOG updated (for significant changes)
- [ ] No merge conflicts with main branch

### 2. PR Requirements

**Title**: Clear, descriptive summary

```
✅ Good: feat: add detection for disabled scheduled workflows
❌ Bad: Update stuff
```

**Description**: Use the PR template to provide:
- Summary of changes
- Motivation and context
- Related issues
- Testing performed
- Screenshots (if UI changes)

### 3. Review Process

**What to Expect**:
- Automated CI checks (tests, linting, build)
- Code review from maintainers
- Possible requests for changes
- Discussion and feedback

**Timeframe**:
- Initial review: Usually within 3-5 days
- Follow-up: Based on complexity

**Getting Merged**:
1. All CI checks must pass
2. At least one approving review
3. No unresolved conversations
4. Up-to-date with main branch

## Project Structure

Understanding the codebase:

```
gh-tools/
├── src/
│   ├── types/              # TypeScript interfaces
│   ├── services/           # GitHub API integration
│   │   ├── github-fetcher.ts
│   │   └── copilot-service.ts
│   ├── analyzers/          # Security analysis logic
│   │   ├── security-analyzer.ts
│   │   └── ai-analyzer.ts
│   ├── reporters/          # Output formatting
│   │   ├── console-reporter.ts
│   │   ├── json-reporter.ts
│   │   └── html-reporter.ts
│   ├── utils/              # Utility functions
│   │   ├── html-sanitizer.ts
│   │   ├── path-validator.ts
│   │   └── input-validator.ts
│   ├── __tests__/          # Unit tests
│   └── index.ts            # CLI entry point
├── docs/                   # Documentation site
├── .github/workflows/      # CI/CD pipelines
└── package.json
```

**Key Files**:
- `src/analyzers/security-analyzer.ts` - Core detection logic
- `src/services/github-fetcher.ts` - GitHub API integration
- `src/utils/` - Security and validation utilities
- `src/__tests__/` - Test files

## Common Tasks

### Adding a New Security Detection

1. **Add Detection Logic** (`src/analyzers/security-analyzer.ts`):

```typescript
analyzeNewIssue(repositories: Repository[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const repo of repositories) {
    // Detection logic
    if (/* condition */) {
      issues.push({
        type: 'new-issue-type',
        severity: 'medium',
        repository: repo.name,
        description: 'Description of the issue',
        details: { /* issue details */ },
        detected_at: new Date().toISOString(),
      });
    }
  }

  return issues;
}
```

2. **Add Type** (`src/types/index.ts`):

```typescript
export type SecurityIssueType =
  | 'self-merge'
  | 'security-pr'
  | 'disabled-actions'
  | 'new-issue-type';  // Add new type
```

3. **Write Tests** (`src/__tests__/security-analyzer.test.ts`):

```typescript
describe('analyzeNewIssue', () => {
  it('should detect the new issue type', () => {
    // Test implementation
  });
});
```

4. **Update Documentation**:
   - Add to Getting Started guide
   - Add to API reference
   - Update README

### Adding a New CLI Command

1. **Add Command** (`src/index.ts`):

```typescript
program
  .command('new-command')
  .description('Description of the command')
  .option('-o, --option <value>', 'Option description')
  .action(async (options) => {
    // Command implementation
  });
```

2. **Add Tests**:

```typescript
describe('new-command', () => {
  it('should execute successfully', () => {
    // Test implementation
  });
});
```

3. **Update Documentation**:
   - Add to API reference
   - Add examples to Getting Started

## Release Process

Releases are managed by maintainers:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `v1.x.x`
4. Push tag: `git push origin v1.x.x`
5. GitHub Actions automatically:
   - Runs CI tests
   - Builds package
   - Publishes to npm
   - Creates GitHub release

## Community Guidelines

### Code of Conduct

**Be Respectful**:
- Treat everyone with respect
- Welcome newcomers
- Provide constructive feedback
- Assume good intentions

**Be Professional**:
- Focus on the code, not the person
- Avoid personal attacks or harassment
- Keep discussions on topic

**Be Helpful**:
- Answer questions when you can
- Help review pull requests
- Share knowledge and experiences

### Getting Help

**Questions?**
- Check the [documentation](/pages/getting-started/)
- Search [existing issues](https://github.com/sdh100shaun/gh-tools/issues)
- Ask in [GitHub Discussions](https://github.com/sdh100shaun/gh-tools/discussions)

**Stuck?**
- Comment on your PR or issue
- Ask for clarification
- Request help from maintainers

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes (for significant contributions)
- Project README (for major features)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Thank You!

Your contributions make this project better for everyone. Whether you're fixing a typo or adding a major feature, we appreciate your time and effort.

Happy coding! 🎉
