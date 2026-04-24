/**
 * Policy Resolver
 *
 * Merges catalog definitions with profile tailoring to produce
 * a resolved policy ready for evaluation.
 *
 * Resolution process:
 * 1. Filter controls based on include/exclude lists
 * 2. Apply parameter overrides from profile tailoring
 * 3. Apply severity overrides
 * 4. Set default parameter values
 * 5. Validate all required parameters have values
 *
 * @module policy/resolver
 */

import { ParameterValidationError, PolicyResolutionError } from './errors.js';
import type {
  Catalog,
  Control,
  ControlTailoring,
  Parameter,
  Profile,
  ReportingConfig,
  ResolvedControl,
  ResolvedParameter,
  ResolvedPolicy,
  ScopeConfig,
} from './types.js';

/**
 * Resolve a profile against its catalog
 */
export function resolvePolicy(catalog: Catalog, profile: Profile): ResolvedPolicy {
  // Determine which controls to include
  const includedControls = filterControls(catalog.controls, profile);

  // Build tailoring lookup map
  const tailoringMap = new Map<string, ControlTailoring>();
  for (const tailoring of profile.controls.tailoring || []) {
    tailoringMap.set(tailoring['control-id'], tailoring);
  }

  // Resolve each control
  const resolvedControls: ResolvedControl[] = [];

  for (const control of includedControls) {
    const tailoring = tailoringMap.get(control.id);

    try {
      const resolved = resolveControl(control, tailoring);
      resolvedControls.push(resolved);
    } catch (error) {
      if (error instanceof ParameterValidationError || error instanceof PolicyResolutionError) {
        throw error;
      }
      throw new PolicyResolutionError(
        `Failed to resolve control ${control.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        control.id
      );
    }
  }

  // Sort by dependency order (classifiers first, then dependents)
  const sorted = topologicalSort(resolvedControls, catalog.controls);

  // Build resolved policy
  return {
    metadata: {
      catalogVersion: catalog.metadata.version,
      profileVersion: profile.metadata.version,
      profileTitle: profile.metadata.title,
    },
    controls: sorted,
    scope: profile.scope || { 'lookback-days': 30 },
    reporting: profile.reporting || {
      formats: ['console'],
      'include-recommendations': true,
    },
  };
}

/**
 * Filter controls based on include/exclude lists
 */
function filterControls(controls: Control[], profile: Profile): Control[] {
  const { include, exclude } = profile.controls;

  let filtered = controls;

  // If include list specified, only include those controls
  if (include && include.length > 0) {
    const includeSet = new Set(include);
    filtered = filtered.filter((c) => includeSet.has(c.id));

    // Verify all included controls exist
    const controlIds = new Set(controls.map((c) => c.id));
    for (const id of include) {
      if (!controlIds.has(id)) {
        throw new PolicyResolutionError(
          `Control ${id} specified in include list not found in catalog`,
          id
        );
      }
    }
  }

  // Apply exclude list
  if (exclude && exclude.length > 0) {
    const excludeSet = new Set(exclude);
    filtered = filtered.filter((c) => !excludeSet.has(c.id));
  }

  // Filter out disabled controls
  filtered = filtered.filter((c) => c.enabled !== false);

  return filtered;
}

/**
 * Resolve a single control with tailoring
 */
function resolveControl(control: Control, tailoring?: ControlTailoring): ResolvedControl {
  // Resolve parameters
  const parameters = resolveParameters(
    control.parameter || [],
    tailoring?.['parameter-values'] || {},
    control.id
  );

  // Determine severity (tailoring > control default)
  const severity = tailoring?.severity || control['default-severity'];

  // Determine enabled status
  const enabled = tailoring?.enabled ?? control.enabled ?? true;

  return {
    id: control.id,
    statement: control.statement,
    family: control.family,
    evaluator: control.evaluator,
    parameters,
    severity,
    mappings: control.mappings,
    enabled,
  };
}

/**
 * Resolve parameters with overrides
 */
function resolveParameters(
  parameterDefs: Parameter[],
  overrides: Record<string, unknown>,
  controlId = '<unknown>'
): ResolvedParameter[] {
  const resolved: ResolvedParameter[] = [];

  for (const param of parameterDefs) {
    let value: unknown;

    // Use override if provided, otherwise use default
    if (param.id in overrides) {
      value = overrides[param.id];
    } else if (param.default !== undefined) {
      value = param.default;
    } else if (param.required) {
      throw new ParameterValidationError(
        `Required parameter '${param.id}' has no value and no default`,
        controlId,
        param.id
      );
    } else {
      // Optional parameter with no value - skip or use null/undefined
      continue;
    }

    // Type validation
    validateParameterType(param, value);

    // Value constraints
    if (param.values && param.values.length > 0) {
      const valueStr = String(value);
      if (!param.values.includes(valueStr)) {
        throw new ParameterValidationError(
          `Parameter '${param.id}' value '${valueStr}' not in allowed values: ${param.values.join(', ')}`,
          '<unknown>',
          param.id
        );
      }
    }

    resolved.push({
      ...param,
      value,
    });
  }

  return resolved;
}

/**
 * Validate parameter value matches declared type
 */
function validateParameterType(param: Parameter, value: unknown): void {
  switch (param.type) {
    case 'string':
    case 'severity':
      if (typeof value !== 'string') {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects string, got ${typeof value}`,
          '<unknown>',
          param.id
        );
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects number, got ${typeof value}`,
          '<unknown>',
          param.id
        );
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects boolean, got ${typeof value}`,
          '<unknown>',
          param.id
        );
      }
      break;

    case 'string-array':
      if (!Array.isArray(value)) {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects array, got ${typeof value}`,
          '<unknown>',
          param.id
        );
      }
      if (param['item-type'] === 'string' && !value.every((v) => typeof v === 'string')) {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects string array, got mixed types`,
          '<unknown>',
          param.id
        );
      }
      break;

    case 'severity-map':
      // Expect array of { keywords: string[], severity: Severity }
      if (!Array.isArray(value)) {
        throw new ParameterValidationError(
          `Parameter '${param.id}' expects severity-map array`,
          '<unknown>',
          param.id
        );
      }
      for (const item of value) {
        if (!item.keywords || !Array.isArray(item.keywords) || !item.severity) {
          throw new ParameterValidationError(
            `Parameter '${param.id}' severity-map items must have keywords[] and severity`,
            '<unknown>',
            param.id
          );
        }
      }
      break;

    default:
      // Unknown type - allow it through
      break;
  }
}

/**
 * Topological sort of controls by dependency
 *
 * Ensures classifier controls are evaluated before controls that depend on them.
 */
function topologicalSort(
  resolvedControls: ResolvedControl[],
  catalogControls: Control[]
): ResolvedControl[] {
  // Build dependency map from catalog
  const dependencyMap = new Map<string, string[]>();
  for (const control of catalogControls) {
    const deps = control.evaluator['depends-on'] || [];
    dependencyMap.set(control.id, deps);
  }

  // Build reverse map (who depends on me)
  const reverseDeps = new Map<string, Set<string>>();
  for (const [controlId, deps] of dependencyMap) {
    for (const dep of deps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep)!.add(controlId);
    }
  }

  // Topological sort using DFS with cycle detection
  const sorted: ResolvedControl[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const controlMap = new Map(resolvedControls.map((c) => [c.id, c]));

  function visit(controlId: string): void {
    if (visited.has(controlId)) return;
    if (visiting.has(controlId)) {
      throw new PolicyResolutionError(`Dependency cycle detected involving control '${controlId}'`);
    }

    visiting.add(controlId);
    const deps = dependencyMap.get(controlId) || [];
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(controlId);
    visited.add(controlId);
    const control = controlMap.get(controlId);
    if (control) {
      sorted.push(control);
    }
  }

  // Visit all controls
  for (const control of resolvedControls) {
    visit(control.id);
  }

  return sorted;
}
