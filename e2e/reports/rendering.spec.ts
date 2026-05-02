/**
 * HTML Report Rendering Tests
 *
 * Tests that HTML security reports render correctly across browsers:
 * - Statistics cards with correct values
 * - Severity badges with proper styling
 * - Issues grouped by type
 * - Recommendations section
 * - Empty state when no issues
 */

import { expect, test } from '@playwright/test';
import { createEmptyResult, createResultWithIssues } from '../fixtures/mock-analysis-results.js';
import { cleanupTestReports, generateTestReport } from '../fixtures/test-reports.js';

test.describe('HTML Report Rendering', () => {
  test.afterAll(() => {
    cleanupTestReports();
  });

  test('displays statistics cards with correct values', async ({ page }) => {
    const reportPath = await generateTestReport({
      statistics: {
        total_repos: 45,
        total_prs: 123,
        self_merges: 8,
        security_prs: 15,
        repos_with_disabled_actions: 5,
        paused_workflows: 3,
        disabled_workflows: 2,
      },
    });
    await page.goto(`file://${reportPath}`);

    // Check statistics cards are present
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(7);

    // Verify specific values
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Total Repositories' })
    ).toContainText('45');
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Total Pull Requests' })
    ).toContainText('123');
    await expect(page.locator('.stat-card').filter({ hasText: 'Self-Merges' })).toContainText('8');
    await expect(page.locator('.stat-card').filter({ hasText: 'Security PRs' })).toContainText(
      '15'
    );
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Repos with Disabled Actions' })
    ).toContainText('5');
    await expect(page.locator('.stat-card').filter({ hasText: 'Paused Workflows' })).toContainText(
      '3'
    );
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Disabled Workflows' })
    ).toContainText('2');
  });

  test('severity badges have correct styling and colors', async ({ page }) => {
    const result = createResultWithIssues();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Check for critical severity badge
    const criticalBadge = page.locator('.severity-critical').first();
    await expect(criticalBadge).toBeVisible();
    await expect(criticalBadge).toHaveText('critical');

    const criticalBg = await criticalBadge.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // #ef4444 = rgb(239, 68, 68)
    expect(criticalBg).toBe('rgb(239, 68, 68)');

    // Check for high severity badge
    const highBadge = page.locator('.severity-high').first();
    await expect(highBadge).toBeVisible();
    await expect(highBadge).toHaveText('high');

    const highBg = await highBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // #fc8181 = rgb(252, 129, 129)
    expect(highBg).toBe('rgb(252, 129, 129)');

    // Check for medium severity badge
    const mediumBadge = page.locator('.severity-medium').first();
    await expect(mediumBadge).toBeVisible();

    // Check for low severity badge
    const lowBadge = page.locator('.severity-low').first();
    await expect(lowBadge).toBeVisible();
  });

  test('issues are grouped and displayed correctly', async ({ page }) => {
    const result = createResultWithIssues();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Check that issue groups exist
    await expect(
      page
        .locator('h3')
        .filter({ hasText: /Self Merge|Disabled Actions/ })
        .first()
    ).toBeVisible();

    // Check that individual issues are displayed
    const issues = page.locator('.issue');
    await expect(issues).toHaveCount(4);

    // Verify first issue has required elements
    const firstIssue = issues.first();
    await expect(firstIssue).toBeVisible();
    await expect(firstIssue.locator('.severity-badge')).toBeVisible();
    await expect(firstIssue).toContainText('Security PR merged without review');
    await expect(firstIssue).toContainText('org/api-server');
  });

  test('displays repository names and links', async ({ page }) => {
    const result = createResultWithIssues();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Check for repository names
    await expect(page.locator('.issue').filter({ hasText: 'org/api-server' })).toBeVisible();
    await expect(page.locator('.issue').filter({ hasText: 'org/frontend' })).toBeVisible();

    // Check for GitHub PR links
    const links = page.locator('a[href*="github.com"]');
    await expect(links.first()).toHaveAttribute(
      'href',
      'https://github.com/org/api-server/pull/123'
    );
    await expect(links.first()).toHaveAttribute('target', '_blank');
  });

  test('shows empty state when no issues found', async ({ page }) => {
    const result = createEmptyResult();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Verify empty state message
    await expect(page.locator('h2').filter({ hasText: 'No Issues Found' })).toBeVisible();
    await expect(page.locator('text=Great job!')).toBeVisible();

    // Verify statistics are still shown
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Total Repositories' })
    ).toContainText('10');
  });

  test('displays recommendations section when present', async ({ page }) => {
    const result = createResultWithIssues();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Check recommendations section exists
    await expect(page.locator('h2').filter({ hasText: 'Recommendations' })).toBeVisible();

    // Check recommendation items
    await expect(page.locator('.recommendations')).toContainText('Enable branch protection rules');
    await expect(page.locator('.recommendations')).toContainText(
      'Require mandatory security team review'
    );
  });

  test('hides recommendations section when empty', async ({ page }) => {
    const result = createEmptyResult();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Recommendations section should not exist or be empty
    const recommendationsHeader = page.locator('h2').filter({ hasText: 'Recommendations' });
    await expect(recommendationsHeader).not.toBeVisible();
  });

  test('header section renders with correct title', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    // Check header elements
    await expect(page.locator('h1')).toContainText('GitHub Security Analysis');
    await expect(page.locator('.subtitle')).toContainText(
      'Organization Activity & Security Monitoring Report'
    );
  });

  test('footer displays generation timestamp', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    // Check footer exists and has timestamp
    const footer = page.locator('footer, .footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Generated');
  });

  test('responsive layout adapts to viewport', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithIssues());

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`file://${reportPath}`);

    const container = page.locator('.container');
    let boundingBox = await container.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(375);

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`file://${reportPath}`);

    boundingBox = await container.boundingBox();
    expect(boundingBox?.width).toBeGreaterThan(375);
  });

  test('statistics grid layout is responsive', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    const statsGrid = page.locator('.statistics-grid, .stats-grid');
    await expect(statsGrid).toBeVisible();

    // Check that grid has auto-fit columns
    const gridDisplay = await statsGrid.evaluate((el) => window.getComputedStyle(el).display);
    expect(gridDisplay).toBe('grid');
  });
});
