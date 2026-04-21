# Current Hardcoded Parameters in HubHelper

This document catalogs all hardcoded detection parameters, severity levels, and thresholds that will be externalized to YAML configuration files during the policy-driven refactoring.

**Last Updated**: 2026-04-21  
**Analysis Version**: v1.0.0  
**Purpose**: Migration reference for Phase 2-5 of policy refactoring plan

---

## Control HH-GH-001: Self-Merged Pull Requests

**Location**: `src/analyzers/security-analyzer.ts:14-30`

**Hardcoded Parameters**:
- **Severity (security-related PRs)**: `'high'` (line 17)
- **Severity (non-security PRs)**: `'medium'` (line 17)
- **Detection logic**: `pr.author === pr.merged_by && pr.merged_by !== null` (line 14)
- **Classifier dependency**: Uses `pr.is_security_related` from GitHubFetcher

**Future Catalog Parameters**:
```yaml
severity_if_security: high
severity_default: medium
classifier_control: HH-GH-003
```

---

## Control HH-GH-002: Unreviewed Security Pull Requests

**Location**: `src/analyzers/security-analyzer.ts:104-128`

**Hardcoded Parameters**:
- **Severity**: `'critical'` (fixed, line 111)
- **File limit**: `10` files (line 120 - `files_changed.slice(0, 10)`)
- **Detection logic**: `pr.is_security_related && pr.author === pr.merged_by` (line 108)
- **Classifier dependency**: Uses `pr.is_security_related` from GitHubFetcher

**Future Catalog Parameters**:
```yaml
severity: critical
file_limit: 10
classifier_control: HH-GH-003
```

---

## Control HH-GH-003: Security PR Classification (Classifier)

**Location**: `src/services/github-fetcher.ts:195-233`

**Hardcoded Parameters**:

### Keywords (20 total) - Lines 201-220
```typescript
[
  'security', 'vulnerability', 'cve', 'xss',
  'sql injection', 'csrf', 'auth', 'authentication',
  'authorization', 'encrypt', 'secret', 'token',
  'credential', 'dependabot', 'snyk', 'password',
  'privilege', 'permission'
]
```

### Security Labels (3 total) - Line 222
```typescript
['security', 'vulnerability', 'dependabot']
```

### File Patterns (4 total) - Line 223
```typescript
['.github/workflows/', 'security.md', 'Dockerfile', '.env']
```

### Detection Logic - Lines 225-232
- **Title/Body matching**: Case-insensitive substring match
- **Label matching**: Case-insensitive includes check
- **File matching**: Path includes check
- **Result**: OR logic (any match → security-related)

**Also Used In**:
- `analyzeSecurityPRs()` - lines 36-78 (severity keyword mapping)
- `analyzeSelfMerges()` - line 17 (conditional severity)
- `analyzeUnreviewedSecurityPRs()` - line 108 (filtering)

---

## Control HH-GH-003 (Extended): Security PR Severity Keywords

**Location**: `src/analyzers/security-analyzer.ts:36-78`

**Hardcoded Severity Keyword Mapping**:

### Base Severity - Line 45
```typescript
let severity = 'medium'; // Default
```

### Critical Keywords - Lines 48-49
```typescript
if (titleLower.includes('critical') || titleLower.includes('cve')) {
  severity = 'critical';
}
```
**Keywords**: `['critical', 'cve']`

### High Keywords - Lines 50-51
```typescript
else if (titleLower.includes('high') || titleLower.includes('vulnerability')) {
  severity = 'high';
}
```
**Keywords**: `['high', 'vulnerability']`

### Low Keywords - Lines 52-54
```typescript
else if (titleLower.includes('dependabot')) {
  severity = 'low';
}
```
**Keywords**: `['dependabot']`

### File Limit - Line 70
```typescript
files_changed: pr.files_changed.slice(0, 10)
```
**Value**: `10` files maximum in details

**Future Catalog Parameters**:
```yaml
keyword_severity_map:
  - keywords: [critical, cve]
    severity: critical
  - keywords: [high, vulnerability]
    severity: high
  - keywords: [dependabot]
    severity: low
base_severity: medium
file_limit: 10
```

---

## Control HH-GH-004: Disabled GitHub Actions

**Location**: `src/analyzers/security-analyzer.ts:80-102`

**Hardcoded Parameters**:
- **Severity**: `'medium'` (fixed, line 87)
- **Detection logic**: `!repo.actions_enabled` (line 84)

**Future Catalog Parameters**:
```yaml
severity: medium
```

---

## Control HH-GH-005: Paused Workflows

**Location**: `src/analyzers/security-analyzer.ts:130-158`

**Hardcoded Parameters**:
- **Workflow state filter**: `'disabled_inactivity'` (line 136)
- **Severity (scheduled workflows)**: `'medium'` (line 141)
- **Severity (non-scheduled workflows)**: `'low'` (line 141)
- **Inactivity period**: `60 days` (hardcoded in reason string, line 150)
- **Reason message**: `"Workflows are automatically disabled after 60 days of repository inactivity"` (line 150)

**Detection Logic** - Line 141:
```typescript
severity: workflow.is_scheduled ? 'medium' : 'low'
```

**Future Catalog Parameters**:
```yaml
workflow_state: disabled_inactivity
severity_if_scheduled: medium
severity_default: low
inactivity_period_days: 60
```

---

## Control HH-GH-006: Manually Disabled Workflows

**Location**: `src/analyzers/security-analyzer.ts:160-187`

**Hardcoded Parameters**:
- **Workflow state filter**: `'disabled_manually'` (line 166)
- **Severity**: `'low'` (fixed, line 171)

**Future Catalog Parameters**:
```yaml
workflow_state: disabled_manually
severity: low
```

---

## Control HH-GH-007 & HH-GH-008: Action Failures

**Location**: `src/analyzers/security-analyzer.ts:189-249`

**Hardcoded Parameters**:

### Repeated Failures (HH-GH-007) - Lines 209-226
- **Failure count threshold**: `3` (line 209 - `failures.length >= 3`)
- **Severity**: `'high'` (line 213)
- **Recent runs limit**: `5` (line 219 - `failures.slice(0, 5)`)

### Single Failures (HH-GH-008) - Lines 227-245
- **Failure count threshold**: `1` (line 227)
- **Severity**: `'medium'` (line 232)

**Detection Logic**:
- Groups failures by `${repository}:${workflow_name}` (line 198)
- Filters for `run.conclusion === 'failure'` (line 196)

**Future Catalog Parameters**:

HH-GH-007 (Repeated):
```yaml
threshold: 3
severity: high
recent_limit: 5
```

HH-GH-008 (Single):
```yaml
severity: medium
```

---

## Control HH-GH-009: Meta-Recommendation (Security PR Volume)

**Location**: `src/analyzers/security-analyzer.ts:306-308`

**Hardcoded Parameters**:
- **Security PR count threshold**: `5` (line 306 - `securityPRIssues.length > 5`)
- **Recommendation text**: `"Consider implementing automated dependency updates with Dependabot"` (line 307-308)

**Future Catalog Parameters**:
```yaml
threshold: 5
recommendation: "Consider implementing automated dependency updates with Dependabot"
```

---

## Additional Hardcoded Values

### Severity Sorting Order

**Location**: `src/analyzers/security-analyzer.ts:273-274`

```typescript
const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
```

**Note**: This logic should remain in code (presentational concern), not externalized to policy.

---

### Default Lookback Period

**Location**: `src/services/github-fetcher.ts:127`

```typescript
async getRecentPullRequests(daysBack = 30): Promise<PullRequest[]>
```

**Value**: `30` days default  
**Note**: This is a method parameter default, overridable by caller. Will be moved to profile `scope.lookback-days`.

---

## Summary Statistics

### Total Controls: 9
- HH-GH-001: Self-Merge Detection
- HH-GH-002: Unreviewed Security PR  
- HH-GH-003: Security PR Classifier
- HH-GH-004: Disabled Actions
- HH-GH-005: Paused Workflows
- HH-GH-006: Disabled Workflows
- HH-GH-007: Repeated Action Failures
- HH-GH-008: Single Action Failures
- HH-GH-009: Security PR Volume Recommendation

### Parameter Types:
- **Fixed Severity**: 4 controls (HH-GH-002, HH-GH-004, HH-GH-006, HH-GH-008)
- **Conditional Severity**: 3 controls (HH-GH-001, HH-GH-003, HH-GH-005)
- **Threshold-Based**: 2 controls (HH-GH-007, HH-GH-009)
- **Keyword Arrays**: 1 control (HH-GH-003 - 20 keywords, 3 labels, 4 file patterns)

### Severity Distribution:
- **Critical**: 1 usage (unreviewed security PR)
- **High**: 2 usages (security self-merge, repeated failures)
- **Medium**: 5 usages (non-security self-merge, security PR base, disabled actions, scheduled paused workflows, single failure)
- **Low**: 2 usages (dependabot PRs, non-scheduled paused workflows, manually disabled workflows)

### Numeric Thresholds:
- `3`: Repeated failure threshold
- `5`: Security PR volume threshold, recent runs limit
- `10`: File change limit
- `30`: Default PR lookback days
- `60`: Workflow inactivity period (in message only)

---

## Migration Checklist

For each control during Phases 3-5:

- [ ] Extract hardcoded values to `catalog.yaml` parameter definitions
- [ ] Create evaluator class with parameter lookups
- [ ] Add unit tests comparing hardcoded vs. policy-driven output
- [ ] Document parameter purpose and valid ranges
- [ ] Update `default.yaml` profile with extracted values
- [ ] Verify behavior preservation with comparison test

---

## Notes for Implementers

1. **Classifier Dependency**: Controls HH-GH-001 and HH-GH-002 depend on HH-GH-003 running first. Profile must include HH-GH-003 before dependent controls.

2. **Keyword Duplication**: Security keywords appear in two places:
   - `GitHubFetcher.isSecurityRelated()` (classification)
   - `SecurityAnalyzer.analyzeSecurityPRs()` (severity mapping)
   
   Both will consolidate into HH-GH-003 classifier with a single `keywords` parameter.

3. **File Limit Duplication**: 10-file limit appears in both:
   - HH-GH-002 (unreviewed security PR)
   - HH-GH-003 (security PR tracking)
   
   Each control should have its own `file_limit` parameter (may have different defaults).

4. **Severity Logic**: Three patterns exist:
   - **Fixed**: Single severity value (simplest)
   - **Conditional**: Severity based on classifier result (e.g., `if security then high else medium`)
   - **Keyword-Mapped**: Severity based on title keyword matching (HH-GH-003 only)

5. **Workflow State Values**: Currently hardcoded as exact strings. Future: validate against enum in catalog.

---

## References

- **Refactoring Plan**: `docs/REFACTORING_PLAN.md`
- **Current Catalog**: Not yet created (Phase 3)
- **Current Profiles**: Not yet created (Phase 3)
- **Evaluator Pattern**: To be implemented in Phase 4-5

---

**End of Hardcoded Parameters Documentation**
