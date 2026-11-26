# Node.js Compatibility

This document outlines the Node.js version compatibility for HubHelper.

## Supported Versions

| Node.js Version | Status | Tested | Notes |
|----------------|--------|--------|-------|
| 20.x | ❌ Not supported | No | End of life (April 2026); dependencies require newer Node.js |
| 22.x | ❌ Not supported | No | Dropped in favour of a single LTS baseline |
| 24.x (LTS) | ✅ Supported | Yes | Minimum required version; recommended for production |
| 26.x | ✅ Supported | Yes | Tested in standard CI |
| Latest | ✅ Compatible | CI* | Continuous compatibility testing |

\* Tested in extended CI workflow with `continue-on-error` to catch future issues early

## Minimum Requirements

- **Node.js**: >= 24.0.0
- **npm**: >= 11.0.0 (bundled with Node.js 24+)

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

All dependencies are tested for compatibility with Node.js 24+:

- `@github/copilot-sdk`: v1.x requires Node.js 20.19+ or 22.12+
- `@octokit/rest`: v22.x (ES modules only) requires Node.js 20+
- `chalk`: v6.x (ES modules only) requires Node.js 22+
- `commander`: v15.x requires Node.js 22.12+
- `dotenv`: Supports all Node.js versions
- `ora`: v10.x requires Node.js 22+
- `zod`: v4.x, used for policy schema validation

The Node.js 24 baseline satisfies every dependency's `engines` requirement.

## CI/CD Testing

### Standard CI (ci.yml)

Tests on every push and pull request:
- Node.js 24.x
- Node.js 26.x

### Extended CI (ci-extended.yml)

Tests on schedule and push with newer/future versions:
- Node.js 26.x
- Node.js latest

The extended CI uses `continue-on-error: true` to allow failures on unreleased versions while still providing early warning of potential compatibility issues.

## Publishing

npm packages are built and published using Node.js 24 to ensure compatibility with the latest features and best practices.

## Troubleshooting

### Version Check

Ensure you're using a supported Node.js version:

```bash
node --version  # Should be >= v24.0.0
```

### Module Resolution

If you see `ERR_MODULE_NOT_FOUND` errors, ensure your Node.js version supports ES modules properly:

```bash
node --version  # ES modules fully supported in Node 24+
```

### Native Dependencies

HubHelper's own code is pure JavaScript. `@github/copilot-sdk` pulls in `koffi`, which ships prebuilt native binaries for common platforms, so no compiler toolchain is needed on supported systems.

## Reporting Issues

If you encounter compatibility issues with a specific Node.js version:

1. Check that you're using a supported version (>= 24.0.0)
2. Try updating to the latest patch version of your Node.js major version
3. Report the issue at https://github.com/sdh100shaun/gh-tools/issues with:
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Operating system
   - Error message or unexpected behavior

## Future Support

We aim to support:
- Current LTS versions (24.x, 26.x)
- Current stable version
- Future versions (tested in extended CI)

Older versions (< 24) are not supported to ensure modern features, performance, and security updates.
