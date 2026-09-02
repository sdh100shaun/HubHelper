/**
 * Controls Under Review Section Tests
 *
 * Verifies that the HTML report correctly renders review-state issues in a
 * visually distinct "Controls Under Review" section and that those issues
 * are clearly separated from compliance-scoring active issues.
 *
 * Scenarios covered:
 * - Section present when reviewIssues populated
 * - Section absent when reviewIssues empty or undefined
 * - Informational notice ("not included in compliance scoring") is visible
 * - Review issues show correct type, severity badge, and repository
 * - Review section is visually distinct from the active issues section
 * - Active-issue count is not inflated by review issues
 * - XSS vectors in review issue fields are escaped
 * - External links in review issues have security attributes
 */

import { expect, test } from '@playwright/test';
import {
  createMockAnalysisResult,
  createMockSecurityIssue,
  createResultWithIssues,
  createResultWithReviewIssues,
} from '../fixtures/mock-analysis-results.js';
import { cleanupTestReports, generateTestReport } from '../fixtures/test-reports.js';

test.describe('Controls Under Review Section', () => {
  test.afterAll(() => {
    cleanupTestReports();
  });

  // ── Presence / absence ────────────────────────────────────────────────────

  test('renders review section when reviewIssues are present', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    await expect(reviewSection).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: /Controls Under Review/i })).toBeVisible();
  });

  test('does not render review section when reviewIssues is empty array', async ({ page }) => {
    const result = createMockAnalysisResult({ reviewIssues: [] });
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    await expect(page.locator('.review-issues-section')).toHaveCount(0);
  });

  test('does not render review section when reviewIssues is undefined', async ({ page }) => {
    const result = createResultWithIssues(); // no reviewIssues field
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    await expect(page.locator('.review-issues-section')).toHaveCount(0);
  });

  // ── Informational notice ──────────────────────────────────────────────────

  test('shows informational notice that review issues are not scored', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const notice = page.locator('.review-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/informational/i);
    await expect(notice).toContainText(/not included in compliance/i);
  });

  // ── Content rendering ─────────────────────────────────────────────────────

  test('review section shows review issue description', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    await expect(reviewSection).toContainText('Review: workflow paused due to inactivity');
    await expect(reviewSection).toContainText('Review: security-related pull request detected');
  });

  test('review section shows repository names', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    await expect(reviewSection).toContainText('org/review-repo-1');
    await expect(reviewSection).toContainText('org/review-repo-2');
  });

  test('review section shows severity badges', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    await expect(reviewSection.locator('.severity-low')).toBeVisible();
    await expect(reviewSection.locator('.severity-medium')).toBeVisible();
  });

  test('review issues carry the review-issue CSS class', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewIssues = page.locator('.review-issues-section .review-issue');
    await expect(reviewIssues).toHaveCount(2);
  });

  // ── Visual distinction ────────────────────────────────────────────────────

  test('review section has distinct styling from active issues section', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const activeSection = page.locator('.section').filter({ hasText: /Detected Issues/i });
    const reviewSection = page.locator('.review-issues-section');

    await expect(activeSection).toBeVisible();
    await expect(reviewSection).toBeVisible();

    // Review section should have a visually different heading colour
    const activeHeadingColor = await activeSection
      .locator('h2')
      .evaluate((el) => window.getComputedStyle(el).color);
    const reviewHeadingColor = await reviewSection
      .locator('h2')
      .evaluate((el) => window.getComputedStyle(el).color);

    expect(activeHeadingColor).not.toBe(reviewHeadingColor);
  });

  test('review section appears after the active issues section in document order', async ({
    page,
  }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const activeSection = page.locator('.section').filter({ hasText: /Detected Issues/i });
    const reviewSection = page.locator('.review-issues-section');

    const activeBox = await activeSection.boundingBox();
    const reviewBox = await reviewSection.boundingBox();

    expect(reviewBox?.y).toBeGreaterThan(activeBox?.y ?? 0);
  });

  // ── Issue count isolation ─────────────────────────────────────────────────

  test('active issues section count is not inflated by review issues', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    // Active section shows 2 active issues (self-merge + disabled-actions)
    const activeIssues = page
      .locator('.section')
      .filter({ hasText: /Detected Issues/i })
      .locator('.issue:not(.review-issue)');
    await expect(activeIssues).toHaveCount(2);
  });

  test('review issues do not appear inside the active issues section', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const activeSection = page.locator('.section').filter({ hasText: /Detected Issues/i });
    // review-repo-1 and review-repo-2 must not appear in the active section
    await expect(activeSection).not.toContainText('org/review-repo-1');
    await expect(activeSection).not.toContainText('org/review-repo-2');
  });

  test('active issues do not appear inside the review section', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    await expect(reviewSection).not.toContainText('org/active-repo');
    await expect(reviewSection).not.toContainText('org/another-repo');
  });

  // ── Security (XSS) ───────────────────────────────────────────────────────

  test('escapes HTML in review issue descriptions', async ({ page }) => {
    const result = createMockAnalysisResult({
      reviewIssues: [
        createMockSecurityIssue({
          type: 'paused-workflow',
          severity: 'low',
          repository: 'org/safe-repo',
          description: '<script>alert("review-xss")</script>',
          details: {},
        }),
      ],
    });

    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    const content = await page.content();
    expect(content).toContain('&lt;script&gt;');
    expect(content).not.toContain('<script>alert("review-xss")');
    expect(alertTriggered).toBe(false);
  });

  test('escapes HTML in review issue repository names', async ({ page }) => {
    const result = createMockAnalysisResult({
      reviewIssues: [
        createMockSecurityIssue({
          type: 'paused-workflow',
          severity: 'low',
          repository: '<img src=x onerror=alert(1)>',
          description: 'safe description',
          details: {},
        }),
      ],
    });

    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    const content = await page.content();
    expect(content).toContain('&lt;img');
    expect(alertTriggered).toBe(false);
  });

  // ── External link security ────────────────────────────────────────────────

  test('external links in review issues have noopener noreferrer', async ({ page }) => {
    const result = createMockAnalysisResult({
      reviewIssues: [
        createMockSecurityIssue({
          type: 'security-pr',
          severity: 'medium',
          repository: 'org/link-repo',
          description: 'Review issue with URL',
          details: { url: 'https://github.com/org/link-repo/pull/42' },
        }),
      ],
    });

    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('.review-issues-section');
    const link = reviewSection.locator('a[target="_blank"]').first();
    await expect(link).toBeVisible();

    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  // ── Accessibility ────────────────────────────────────────────────────────

  test('review section has aria-label', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithReviewIssues());
    await page.goto(`file://${reportPath}`);

    const reviewSection = page.locator('[aria-label="Controls Under Review"]');
    await expect(reviewSection).toBeVisible();
  });
});
