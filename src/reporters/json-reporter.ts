import { writeFileSync } from 'node:fs';
import type { AnalysisResult, ListReport } from '../types/index.js';
import { withFindingIdentity } from '../utils/finding-identity.js';

/**
 * Version of the JSON report layout. Bump the major part on breaking changes so
 * automated consumers (such as the agentic audit workflow) can detect them.
 */
export const JSON_SCHEMA_VERSION = '1.0';

export class JSONReporter {
  saveToFile(result: AnalysisResult | ListReport, filename: string): void {
    const output = {
      schema_version: JSON_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      ...this.withIdentity(result),
    };

    writeFileSync(filename, JSON.stringify(output, null, 2), 'utf-8');
  }

  print(result: AnalysisResult | ListReport): void {
    console.log(JSON.stringify(result, null, 2));
  }

  /**
   * Add `control_id` and `fingerprint` to every issue in an analysis result.
   * List reports carry no issue list and are returned unchanged.
   */
  private withIdentity(result: AnalysisResult | ListReport): AnalysisResult | ListReport {
    if (!('issues' in result)) {
      return result;
    }

    return {
      ...result,
      issues: result.issues.map(withFindingIdentity),
      ...(result.reviewIssues
        ? { reviewIssues: result.reviewIssues.map(withFindingIdentity) }
        : {}),
    };
  }
}
