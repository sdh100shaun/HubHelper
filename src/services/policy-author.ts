/**
 * PolicyAuthorService
 *
 * Uses AI (Copilot SDK) to translate natural-language security requirements
 * into HubHelper policy artifacts:
 *   - A catalog.yaml snippet for the new control
 *   - A TypeScript evaluator stub
 *
 * Single-control authoring uses Sonnet 4.6; multi-control or complex
 * authoring should pass model: 'claude-opus-4-6'.
 *
 * @module services/policy-author
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateCatalogSnippet, generateEvaluatorStub } from '../templates/evaluator-stub.js';
import type { AIModel } from './copilot-ai-client.js';
import { CopilotAIClient } from './copilot-ai-client.js';

const DEFAULT_AUTHOR_MODEL: AIModel = 'claude-sonnet-4-6';

export interface PolicyAuthorOptions {
  /** Model used for authoring. Defaults to claude-sonnet-4-6. */
  model?: AIModel;
  /** Directory where generated policy files are written. */
  outputDir?: string;
}

export interface AuthoredPolicy {
  controlId: string;
  detectorSlug: string;
  className: string;
  statement: string;
  kind: string;
  severity: string;
  family: string;
  catalogSnippet: string;
  evaluatorStub: string;
  /** True if files were written to disk. */
  saved: boolean;
  outputPaths?: {
    evaluator: string;
    catalogSnippet: string;
  };
}

interface AIControlSpec {
  controlId: string;
  statement: string;
  family: string;
  detectorSlug: string;
  kind: string;
  severity: string;
  nistMappings: string[];
}

export class PolicyAuthorService {
  private readonly client: CopilotAIClient;
  private readonly outputDir: string;

  constructor(options: PolicyAuthorOptions = {}) {
    this.client = new CopilotAIClient({ model: options.model ?? DEFAULT_AUTHOR_MODEL });
    this.outputDir = options.outputDir ?? join('policies', 'generated');
  }

  /**
   * Author a new policy control from a natural-language description.
   * Returns the generated artifacts; optionally writes them to disk.
   */
  async authorControl(
    description: string,
    nextControlId: string,
    save = false
  ): Promise<AuthoredPolicy | null> {
    const prompt = buildAuthorPrompt(description, nextControlId);
    const response = await this.client.complete(prompt);
    if (!response) {
      return null;
    }

    const spec = parseAIControlSpec(response);
    if (!spec) {
      return null;
    }

    const className = toClassName(spec.detectorSlug);

    const catalogSnippet = generateCatalogSnippet({
      controlId: spec.controlId,
      statement: spec.statement,
      family: spec.family,
      detectorSlug: spec.detectorSlug,
      kind: spec.kind,
      severity: spec.severity,
      nistMappings: spec.nistMappings,
    });

    const evaluatorStub = generateEvaluatorStub({
      controlId: spec.controlId,
      detectorSlug: spec.detectorSlug,
      className,
      kind: spec.kind,
      statement: spec.statement,
    });

    const result: AuthoredPolicy = {
      ...spec,
      className,
      catalogSnippet,
      evaluatorStub,
      saved: false,
    };

    if (save) {
      await this.saveArtifacts(result);
    }

    return result;
  }

  private async saveArtifacts(policy: AuthoredPolicy): Promise<void> {
    const evaluatorDir = join('src', 'evaluators');
    const evaluatorPath = join(evaluatorDir, `${policy.detectorSlug}-evaluator.ts`);
    const snippetPath = join(this.outputDir, `${policy.controlId}.yaml`);

    await mkdir(this.outputDir, { recursive: true });
    await writeFile(evaluatorPath, policy.evaluatorStub, 'utf8');
    await writeFile(snippetPath, policy.catalogSnippet, 'utf8');

    policy.saved = true;
    policy.outputPaths = { evaluator: evaluatorPath, catalogSnippet: snippetPath };
  }

  async dispose(): Promise<void> {
    await this.client.dispose();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAuthorPrompt(description: string, nextControlId: string): string {
  return `You are a HubHelper policy author. Given a natural-language security requirement, produce a JSON control specification.

Control ID to use: ${nextControlId}
Requirement: "${description}"

Available evaluator kinds: github.pull-request, github.workflow, github.repository, classifier, meta
Available severities: low, medium, high, critical
Available families: pull-request, workflow, repository, meta

Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "controlId": "${nextControlId}",
  "statement": "<concise control statement>",
  "family": "<family>",
  "detectorSlug": "<kebab-case-detector-name>",
  "kind": "<evaluator-kind>",
  "severity": "<severity>",
  "nistMappings": ["<NIST-control-id>", ...]
}`;
}

function parseAIControlSpec(response: string): AIControlSpec | null {
  const stripped = response.replace(/```(?:json)?\n?/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.controlId !== 'string' ||
      typeof obj.statement !== 'string' ||
      typeof obj.family !== 'string' ||
      typeof obj.detectorSlug !== 'string' ||
      typeof obj.kind !== 'string' ||
      typeof obj.severity !== 'string'
    ) {
      return null;
    }

    return {
      controlId: obj.controlId,
      statement: obj.statement,
      family: obj.family,
      detectorSlug: obj.detectorSlug,
      kind: obj.kind,
      severity: obj.severity,
      nistMappings: Array.isArray(obj.nistMappings)
        ? obj.nistMappings.filter((m): m is string => typeof m === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function toClassName(slug: string): string {
  return `${slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}Evaluator`;
}
