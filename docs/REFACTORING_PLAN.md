# HubHelper Policy-Driven Security Analysis Refactoring Plan

## Context

HubHelper currently uses hardcoded detection logic. This refactoring transforms it to a declarative YAML-based policy system using the user's actual catalog.yaml and profile.yaml schemas.

## Implementation Phases

### Phase 1: Enumerate Parameters (3h)
Document all hardcoded values in `docs/current-hardcoded-parameters.md`

### Phase 2: Policy Infrastructure (8h)
Create types, loader, resolver using Zod + YAML

### Phase 3: Write Catalog + Profiles (6h)  
Create `policies/catalog.yaml` (9 controls), `default.yaml`, `strict.yaml`

### Phase 4: First Evaluator (10h)
Implement `SelfMergeEvaluator` + `SecurityPRClassifier` as proof-of-concept

### Phase 5: Remaining Evaluators (16h)
Port 7 more detectors to evaluators

### Phase 6: Default Flip (8h)
Add `--profile` flag, make policy-driven the default

### Phase 7: SARIF Reporter (10h)
GitHub Code Scanning integration

### Phase 8: Framework Mappings (6h)
Optional compliance reporting

**Total: 67.5 hours**

## User's Schema Structure

Catalog: Controls with `id`, `statement`, `family`, `evaluator.kind`, `evaluator.detector`, `parameter[]`, `default-severity`

Profile: `catalog-ref`, `controls.include`, `controls.tailoring`, `scope`, `reporting`

## Success Criteria
- Zero breaking changes
- Default profile = identical findings  
- SARIF works with GitHub
- README <200 words

See full plan at: https://claude.ai/code/session_013sbxhgHPBWxVEuzT9Jn4Xb
