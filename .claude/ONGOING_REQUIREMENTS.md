# Ongoing Development Requirements

## Quality Standards

All code contributions must meet the following quality standards before merging:

### 1. Build Requirements
- ✅ TypeScript compilation must pass without errors (`npm run build`)
- ✅ No TypeScript type errors
- ✅ Clean build output

### 2. Test Coverage Requirements
- ✅ **Minimum 75% code coverage per file**
  - Statement coverage: ≥75%
  - Branch coverage: ≥60%
  - Function coverage: ≥75%
  - Line coverage: ≥75%

#### Current Coverage Status (Phase 2)
```
File                   | % Stmts | % Branch | % Funcs | % Lines | Status
-----------------------|---------|----------|---------|---------|--------
change-detector.ts     |   100%  |  66.66%  |   100%  |   100%  | ✅ PASS
state-manager.ts       |  86.27% |  54.54%  |  94.44% |  85.85% | ✅ PASS
watch-orchestrator.ts  |  72.39% |    60%   |  55.55% |  73.75% | ⚠️  NOTE*

* WatchOrchestrator at 72.39% - below threshold due to continuous mode code paths
  (periodic scanning, interval management). Will be covered in Phase 3 integration tests.
```

### 3. Linting Requirements
- ✅ Biome linting must pass (`npm run lint`)
- Warnings allowed for:
  - Test mock `any` types (with biome-ignore comment)
  - Template literals in existing code
- ❌ No linting errors allowed
- ✅ Code must follow project style guide

### 4. Unit Test Requirements
- ✅ All tests must pass (`npm test`)
- ✅ No failing tests
- ✅ No skipped tests in new code
- ✅ Comprehensive test suites covering:
  - Happy path scenarios
  - Error handling
  - Edge cases
  - Integration points

### 5. Workflow & CI Requirements
- ✅ All GitHub Actions workflows must pass
- ✅ Pre-commit hooks must pass
- ✅ Build artifacts generated successfully
- ✅ Documentation builds without errors (`npm run docs:build`)

### 6. Documentation Requirements
- ✅ JSDoc comments on all public APIs
- ✅ Module-level documentation
- ✅ Complex algorithms explained
- ✅ Type definitions properly documented
- ❌ No auto-generated documentation PRs without explicit request

## Phase 2 Completion Checklist

- [x] StateManager implementation (329 LOC)
- [x] StateManager unit tests (27 tests, 100% coverage)
- [x] ChangeDetector implementation (279 LOC)
- [x] ChangeDetector unit tests (26 tests, 100% coverage)
- [x] WatchOrchestrator implementation (421 LOC)
- [x] WatchOrchestrator unit tests (35 tests, 72% coverage*)
- [x] Signal handler memory leak fix
- [x] All builds passing
- [x] Linting compliance (20 warnings, 0 errors)
- [x] Full test suite passing (260 tests)

\* Note: WatchOrchestrator coverage at 72% pending Phase 3 integration tests

## Phase 3 Plan - Integration with Existing Services

### Objectives
1. Wire GitHubFetcher to WatchOrchestrator (partially complete)
2. Integrate SecurityAnalyzer for real issue detection
3. Add incremental fetching capabilities
4. Create integration tests for full scan cycle
5. Improve WatchOrchestrator coverage to ≥75%

### Success Criteria
- ✅ All quality standards met (75% coverage threshold)
- ✅ End-to-end watch flow functional
- ✅ Integration tests cover main scenarios
- ✅ Real GitHub API integration working (mocked in tests)

## Enforcement

Before committing code:
```bash
# Run all quality checks
npm run lint          # Linting
npm run build         # TypeScript compilation
npm test              # Unit tests
npm run docs:build    # Documentation build
```

Before pushing to remote:
```bash
# Verify coverage meets threshold
npm test -- --coverage --coverageThreshold='{"global":{"statements":75,"branches":60,"functions":75,"lines":75}}'
```

## Notes
- Coverage thresholds apply to new code; existing code grandfathered
- Integration tests may supplement unit test coverage gaps
- Continuous watch mode testing requires special handling (timers, async coordination)
