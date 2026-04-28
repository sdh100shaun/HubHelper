/**
 * Tests for PolicyAuthorService and evaluator-stub template
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { PolicyAuthorService } from '../services/policy-author.js';
import { generateCatalogSnippet, generateEvaluatorStub } from '../templates/evaluator-stub.js';

// ─── Mock dependencies ────────────────────────────────────────────────────

const mockComplete = jest.fn();
const mockDispose = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/copilot-ai-client.js', () => ({
  CopilotAIClient: jest.fn().mockImplementation(() => ({
    complete: mockComplete,
    dispose: mockDispose,
  })),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeValidAIResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    controlId: 'HH-GH-011',
    statement: 'All repositories must have branch protection enabled',
    family: 'repository',
    detectorSlug: 'branch-protection-check',
    kind: 'github.repository',
    severity: 'high',
    nistMappings: ['CM-3', 'SA-15'],
    ...overrides,
  });
}

// ─── Tests: template functions ────────────────────────────────────────────

describe('generateEvaluatorStub()', () => {
  it('includes the control ID', () => {
    const stub = generateEvaluatorStub({
      controlId: 'HH-GH-011',
      detectorSlug: 'branch-protection-check',
      className: 'BranchProtectionCheckEvaluator',
      kind: 'github.repository',
      statement: 'All repos must have branch protection',
    });
    expect(stub).toContain('HH-GH-011');
  });

  it('uses the @registerEvaluator decorator with the detector slug', () => {
    const stub = generateEvaluatorStub({
      controlId: 'HH-GH-011',
      detectorSlug: 'branch-protection-check',
      className: 'BranchProtectionCheckEvaluator',
      kind: 'github.repository',
      statement: 'All repos must have branch protection',
    });
    expect(stub).toContain("@registerEvaluator('branch-protection-check')");
  });

  it('uses the provided class name', () => {
    const stub = generateEvaluatorStub({
      controlId: 'HH-GH-011',
      detectorSlug: 'branch-protection-check',
      className: 'BranchProtectionCheckEvaluator',
      kind: 'github.repository',
      statement: 'statement text',
    });
    expect(stub).toContain('class BranchProtectionCheckEvaluator extends BaseEvaluator');
  });

  it('includes the kind', () => {
    const stub = generateEvaluatorStub({
      controlId: 'HH-GH-011',
      detectorSlug: 'test-slug',
      className: 'TestEvaluator',
      kind: 'github.pull-request',
      statement: 'statement',
    });
    expect(stub).toContain("'github.pull-request'");
  });

  it('includes the statement as a comment', () => {
    const stub = generateEvaluatorStub({
      controlId: 'HH-GH-011',
      detectorSlug: 'test-slug',
      className: 'TestEvaluator',
      kind: 'github.repository',
      statement: 'Enforce branch protection everywhere',
    });
    expect(stub).toContain('Enforce branch protection everywhere');
  });
});

describe('generateCatalogSnippet()', () => {
  it('includes the control ID', () => {
    const snippet = generateCatalogSnippet({
      controlId: 'HH-GH-011',
      statement: 'test',
      family: 'repository',
      detectorSlug: 'test-slug',
      kind: 'github.repository',
      severity: 'high',
    });
    expect(snippet).toContain('HH-GH-011');
  });

  it('includes NIST mappings when provided', () => {
    const snippet = generateCatalogSnippet({
      controlId: 'HH-GH-011',
      statement: 'test',
      family: 'repository',
      detectorSlug: 'test-slug',
      kind: 'github.repository',
      severity: 'high',
      nistMappings: ['CM-3', 'SA-15'],
    });
    expect(snippet).toContain('CM-3');
    expect(snippet).toContain('SA-15');
  });

  it('omits mappings section when none provided', () => {
    const snippet = generateCatalogSnippet({
      controlId: 'HH-GH-011',
      statement: 'test',
      family: 'repository',
      detectorSlug: 'test-slug',
      kind: 'github.repository',
      severity: 'high',
    });
    expect(snippet).not.toContain('mappings');
  });
});

// ─── Tests: PolicyAuthorService ───────────────────────────────────────────

describe('PolicyAuthorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when AI is unavailable', async () => {
    mockComplete.mockResolvedValueOnce(null);
    const service = new PolicyAuthorService();
    const result = await service.authorControl('test description', 'HH-GH-011');
    expect(result).toBeNull();
  });

  it('returns null when AI returns invalid JSON', async () => {
    mockComplete.mockResolvedValueOnce('not valid json at all');
    const service = new PolicyAuthorService();
    const result = await service.authorControl('test description', 'HH-GH-011');
    expect(result).toBeNull();
  });

  it('returns null when AI JSON is missing required fields', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ controlId: 'HH-GH-011' }));
    const service = new PolicyAuthorService();
    const result = await service.authorControl('test description', 'HH-GH-011');
    expect(result).toBeNull();
  });

  it('returns AuthoredPolicy on valid AI response', async () => {
    mockComplete.mockResolvedValueOnce(makeValidAIResponse());
    const service = new PolicyAuthorService();
    const result = await service.authorControl('Branch protection requirement', 'HH-GH-011');

    expect(result).not.toBeNull();
    expect(result?.controlId).toBe('HH-GH-011');
    expect(result?.detectorSlug).toBe('branch-protection-check');
    expect(result?.className).toBe('BranchProtectionCheckEvaluator');
    expect(result?.saved).toBe(false);
  });

  it('generates a valid catalog snippet', async () => {
    mockComplete.mockResolvedValueOnce(makeValidAIResponse());
    const service = new PolicyAuthorService();
    const result = await service.authorControl('Branch protection', 'HH-GH-011');
    expect(result?.catalogSnippet).toContain('HH-GH-011');
    expect(result?.catalogSnippet).toContain('branch-protection-check');
  });

  it('generates a valid evaluator stub', async () => {
    mockComplete.mockResolvedValueOnce(makeValidAIResponse());
    const service = new PolicyAuthorService();
    const result = await service.authorControl('Branch protection', 'HH-GH-011');
    expect(result?.evaluatorStub).toContain('BranchProtectionCheckEvaluator');
    expect(result?.evaluatorStub).toContain('@registerEvaluator');
  });

  it('writes files to disk when save=true', async () => {
    mockComplete.mockResolvedValueOnce(makeValidAIResponse());
    // biome-ignore lint/suspicious/noExplicitAny: mock return
    mockMkdir.mockResolvedValueOnce(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);

    const service = new PolicyAuthorService({ outputDir: 'policies/generated' });
    const result = await service.authorControl('Branch protection', 'HH-GH-011', true);

    expect(result?.saved).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(result?.outputPaths?.evaluator).toContain('branch-protection-check-evaluator.ts');
    expect(result?.outputPaths?.catalogSnippet).toContain('HH-GH-011.yaml');
  });

  it('does not write files when save=false', async () => {
    mockComplete.mockResolvedValueOnce(makeValidAIResponse());
    const service = new PolicyAuthorService();
    await service.authorControl('Branch protection', 'HH-GH-011', false);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles AI response wrapped in markdown fences', async () => {
    const fenced = `\`\`\`json\n${makeValidAIResponse()}\n\`\`\``;
    mockComplete.mockResolvedValueOnce(fenced);
    const service = new PolicyAuthorService();
    const result = await service.authorControl('Branch protection', 'HH-GH-011');
    expect(result).not.toBeNull();
    expect(result?.controlId).toBe('HH-GH-011');
  });

  it('disposes the AI client', async () => {
    const service = new PolicyAuthorService();
    await service.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });
});
