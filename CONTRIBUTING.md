# Contributing to GitHub Security Analysis Tools

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/gh-tools.git
   cd gh-tools
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file with your credentials (see `.env.example`)

## Development Workflow

### Running the Project

Development mode (with hot reload):
```bash
npm run dev analyze
```

Build for production:
```bash
npm run build
npm start
```

### Code Quality

We use Biome for linting and formatting:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format
```

Before submitting a PR, make sure:
- ✅ Code passes linting: `npm run lint`
- ✅ Code is properly formatted: `npm run format`
- ✅ TypeScript compiles without errors: `npm run build`
- ✅ Tests pass (when implemented): `npm test`

## Project Structure

```
src/
├── types/           # TypeScript type definitions
│   └── index.ts
├── services/        # External service integrations
│   ├── github-fetcher.ts    # GitHub API integration
│   └── copilot-service.ts   # Copilot SDK integration
├── analyzers/       # Analysis and detection logic
│   ├── security-analyzer.ts # Core security analysis
│   └── ai-analyzer.ts       # AI-powered insights
├── reporters/       # Output formatting
│   ├── console-reporter.ts  # Terminal output
│   ├── json-reporter.ts     # JSON export
│   └── html-reporter.ts     # HTML reports
└── index.ts         # CLI entry point
```

## Adding New Features

### Adding a New Security Detector

1. Add detection logic to `src/analyzers/security-analyzer.ts`
2. Add a new issue type to `src/types/index.ts`
3. Update reporters to display the new issue type
4. Update documentation in README.md

Example:

```typescript
// In src/types/index.ts
export interface SecurityIssue {
  type: 'self-merge' | 'security-pr' | 'disabled-actions' | 'your-new-type';
  // ...
}

// In src/analyzers/security-analyzer.ts
analyzeYourNewIssue(data: SomeData[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  // Your detection logic here
  return issues;
}
```

### Adding a New Reporter

1. Create a new file in `src/reporters/`
2. Implement the reporter class
3. Export it from the reporter directory
4. Add CLI option in `src/index.ts`

Example:

```typescript
// src/reporters/markdown-reporter.ts
export class MarkdownReporter {
  generateReport(result: AnalysisResult): string {
    // Your markdown generation logic
  }

  saveToFile(result: AnalysisResult, filename: string): void {
    // Save to file
  }
}
```

## Testing

(Tests will be added in future versions)

When writing tests:
- Place test files next to the code they test with `.test.ts` extension
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies (GitHub API, etc.)

## Code Style

We follow these conventions:
- Use TypeScript for all code
- Use ES modules (`.js` extensions in imports)
- Prefer `async/await` over callbacks
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Commit Messages

Follow conventional commits format:

- `feat: add new security detector for API keys`
- `fix: correct self-merge detection logic`
- `docs: update README with examples`
- `refactor: simplify reporter interface`
- `test: add tests for security analyzer`
- `chore: update dependencies`

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style guidelines

3. Run quality checks:
   ```bash
   npm run lint:fix
   npm run format
   npm run build
   ```

4. Commit your changes with descriptive messages

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request with:
   - Clear description of changes
   - Reference to any related issues
   - Screenshots (if UI changes)
   - Test results

## Ideas for Contributions

### High Priority
- [ ] Add unit tests for all analyzers
- [ ] Implement full Copilot SDK integration
- [ ] Add support for GitHub Enterprise
- [ ] Create GitHub Action for automated monitoring

### Medium Priority
- [ ] Add more security detectors (exposed secrets, outdated dependencies, etc.)
- [ ] Implement watch mode for real-time monitoring
- [ ] Add Slack/Teams notifications
- [ ] Create dashboard UI

### Low Priority
- [ ] Add support for GitLab and Bitbucket
- [ ] Export to PDF
- [ ] Add historical trend analysis
- [ ] Integration with JIRA/Linear

## Questions?

Feel free to:
- Open an issue for bugs or feature requests
- Start a discussion for questions
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
