# Node.js Compatibility

This document outlines the Node.js version compatibility for GitHub Security Analysis Tools.

## Supported Versions

| Node.js Version | Status | Tested | Notes |
|----------------|--------|--------|-------|
| 18.x (LTS) | ✅ Supported | Yes | Minimum required version |
| 20.x (LTS) | ✅ Supported | Yes | Recommended for production |
| 22.x (Current) | ✅ Supported | Yes | Latest features and performance |
| 24.x | ✅ Compatible | CI* | Future-ready |
| Latest | ✅ Compatible | CI* | Continuous compatibility testing |

\* Tested in extended CI workflow with `continue-on-error` to catch future issues early

## Minimum Requirements

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0 (bundled with Node.js 18+)

## Tested Features

All versions are tested for:

- ✅ TypeScript compilation (ES2022 target)
- ✅ ES Modules support
- ✅ Biome linting and formatting
- ✅ Dependency compatibility
- ✅ CLI execution
- ✅ Build process

## ES Module Support

This package uses ES modules (`"type": "module"` in package.json). All supported Node.js versions have full ES module support.

## TypeScript Configuration

The project uses TypeScript with the following target configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"]
  }
}
```

This configuration ensures compatibility with all supported Node.js versions while enabling modern JavaScript features.

## Dependency Compatibility

All dependencies are tested for compatibility with Node.js 18+:

- `@github/copilot-sdk`: Supports Node.js 18+
- `@octokit/rest`: Supports Node.js 18+
- `chalk`: v5.x uses ES modules, requires Node.js 12+
- `commander`: Supports Node.js 14+
- `dotenv`: Supports all Node.js versions
- `ora`: v8.x requires Node.js 18+

## CI/CD Testing

### Standard CI (ci.yml)

Tests on every push and pull request:
- Node.js 18.x
- Node.js 20.x
- Node.js 22.x

### Extended CI (ci-extended.yml)

Tests on schedule and push with newer/future versions:
- Node.js 22.x
- Node.js 24.x
- Node.js latest

The extended CI uses `continue-on-error: true` to allow failures on unreleased versions while still providing early warning of potential compatibility issues.

## Publishing

npm packages are built and published using Node.js 22 to ensure compatibility with the latest features and best practices.

## Troubleshooting

### Node.js 18.x Issues

If you encounter issues with Node.js 18.x, ensure you're using at least 18.0.0:

```bash
node --version  # Should be >= v18.0.0
```

### Module Resolution

If you see `ERR_MODULE_NOT_FOUND` errors, ensure your Node.js version supports ES modules properly:

```bash
node --version  # ES modules fully supported in Node 18+
```

### Native Dependencies

All dependencies are pure JavaScript. No native modules are used, ensuring compatibility across platforms and Node.js versions.

## Reporting Issues

If you encounter compatibility issues with a specific Node.js version:

1. Check that you're using a supported version (>= 18.0.0)
2. Try updating to the latest patch version of your Node.js major version
3. Report the issue at https://github.com/sdh100shaun/gh-tools/issues with:
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Operating system
   - Error message or unexpected behavior

## Future Support

We aim to support:
- Current LTS versions (18.x, 20.x, 22.x)
- Current stable version
- Future versions (tested in extended CI)

Older versions (< 18) are not supported as they lack modern ES module features and security updates.
