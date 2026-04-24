/**
 * Test report generator for Playwright tests
 * Creates temporary HTML reports for browser testing
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HTMLReporter } from '../../src/reporters/html-reporter.js';
import type { AnalysisResult } from '../../src/types/index.js';
import { createMockAnalysisResult } from './mock-analysis-results.js';

// Track temp directories for cleanup
let tempDirs: string[] = [];

/**
 * Generate a temporary HTML report file
 *
 * @param resultOverrides - Partial AnalysisResult to merge with defaults
 * @param aiInsights - Optional AI insights to include in report
 * @returns Absolute path to generated HTML file
 */
export const generateTestReport = async (
  resultOverrides?: Partial<AnalysisResult>,
  aiInsights?: string
): Promise<string> => {
  const reporter = new HTMLReporter();
  const result = createMockAnalysisResult(resultOverrides || {});

  // Create temp directory
  const tempDir = mkdtempSync(join(tmpdir(), 'playwright-report-'));
  tempDirs.push(tempDir);

  // Generate HTML report
  const reportPath = join(tempDir, 'test-report.html');
  const html = reporter.generateReport(result, aiInsights);
  writeFileSync(reportPath, html, 'utf-8');

  return reportPath;
};

/**
 * Cleanup all temporary report directories
 * Call this in test teardown or global teardown
 */
export const cleanupTestReports = (): void => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to cleanup ${dir}:`, error);
    }
  }
  tempDirs = [];
};

/**
 * Get temp directory count (for debugging)
 */
export const getTempDirCount = (): number => {
  return tempDirs.length;
};
