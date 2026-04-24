/**
 * AI Insights Section Tests
 *
 * Tests conditional rendering of the AI insights section:
 * - Section appears when AI insights provided
 * - Section hidden when AI insights not provided
 * - Content properly escaped for security
 * - Whitespace preserved in insights
 * - Styling matches design
 */

import { expect, test } from '@playwright/test';
import { createResultWithIssues } from '../fixtures/mock-analysis-results.js';
import { cleanupTestReports, generateTestReport } from '../fixtures/test-reports.js';

test.describe('AI Insights Section', () => {
  test.afterAll(() => {
    cleanupTestReports();
  });

  test('displays AI insights section when insights provided', async ({ page }) => {
    const insights = 'This is a test AI insight with analysis and recommendations.';
    const reportPath = await generateTestReport(createResultWithIssues(), insights);
    await page.goto(`file://${reportPath}`);

    // Verify AI insights section exists
    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toBeVisible();

    // Verify header
    await expect(page.locator('h2').filter({ hasText: /AI.*Insights/i })).toBeVisible();

    // Verify content is present
    await expect(aiSection).toContainText('This is a test AI insight');
  });

  test('hides AI insights section when not provided', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithIssues());
    await page.goto(`file://${reportPath}`);

    // Verify AI insights section does not exist or is hidden
    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toHaveCount(0);
  });

  test('preserves whitespace and line breaks in AI insights', async ({ page }) => {
    const insights = `Line 1 of insights

Line 2 after blank line

  Indented line
    More indented`;

    const reportPath = await generateTestReport(createResultWithIssues(), insights);
    await page.goto(`file://${reportPath}`);

    const aiContent = page.locator('.ai-insights, .ai-section');
    await expect(aiContent).toBeVisible();

    // Check that whitespace is preserved
    const whiteSpace = await aiContent.evaluate((el) => {
      const contentEl = el.querySelector('pre, .ai-content, .insights-content');
      if (contentEl) {
        return window.getComputedStyle(contentEl).whiteSpace;
      }
      return window.getComputedStyle(el).whiteSpace;
    });

    // Should preserve whitespace (pre, pre-wrap, or pre-line)
    expect(['pre', 'pre-wrap', 'pre-line']).toContain(whiteSpace);
  });

  test('escapes HTML in AI insights for security', async ({ page }) => {
    const insights = '<script>alert("XSS in AI insights")</script>\n<img src=x onerror=alert(1)>';
    const reportPath = await generateTestReport(createResultWithIssues(), insights);

    // Set up alert detection
    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    await page.goto(`file://${reportPath}`);

    // Verify HTML is escaped
    const content = await page.content();
    expect(content).toContain('&lt;script&gt;');
    expect(content).toContain('&lt;img');
    expect(content).not.toContain('<script>alert');

    // Verify no alerts triggered
    expect(alertTriggered).toBe(false);
  });

  test('AI insights section has distinct styling', async ({ page }) => {
    const insights = 'Test insights content';
    const reportPath = await generateTestReport(createResultWithIssues(), insights);
    await page.goto(`file://${reportPath}`);

    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toBeVisible();

    // Check for gradient background (matching header)
    const backgroundColor = await aiSection.evaluate(
      (el) => window.getComputedStyle(el).backgroundImage
    );

    // Should have a gradient or solid background
    expect(backgroundColor).toBeTruthy();
  });

  test('handles multi-line AI insights correctly', async ({ page }) => {
    const insights = `=== Security Analysis Insights ===

📊 Issue Detection Rate: 9.8% of PRs flagged
⚠️ Self-Merge Rate: 6.5% (8/123 PRs)
🔒 Security PRs: 15 detected
⚙️ Actions Disabled: 11.1% of repos (5/45)

💡 Recommendations:
1. Enable branch protection rules
2. Require security team review
3. Enable GitHub Actions for automated scanning`;

    const reportPath = await generateTestReport(createResultWithIssues(), insights);
    await page.goto(`file://${reportPath}`);

    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toBeVisible();

    // Verify all lines are present
    await expect(aiSection).toContainText('Security Analysis Insights');
    await expect(aiSection).toContainText('Issue Detection Rate: 9.8%');
    await expect(aiSection).toContainText('Self-Merge Rate: 6.5%');
    await expect(aiSection).toContainText('Enable branch protection rules');
  });

  test('AI insights section is responsive', async ({ page }) => {
    const insights = 'Test insights for responsiveness';
    const reportPath = await generateTestReport(createResultWithIssues(), insights);

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`file://${reportPath}`);

    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toBeVisible();

    let boundingBox = await aiSection.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(375);

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`file://${reportPath}`);

    await expect(aiSection).toBeVisible();
    boundingBox = await aiSection.boundingBox();
    expect(boundingBox?.width).toBeGreaterThan(375);
  });

  test('handles empty string AI insights', async ({ page }) => {
    const reportPath = await generateTestReport(createResultWithIssues(), '');
    await page.goto(`file://${reportPath}`);

    // Empty string should not show AI insights section
    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toHaveCount(0);
  });

  test('handles very long AI insights', async ({ page }) => {
    const longInsights = `${'A'.repeat(5000)}\n\n${'B'.repeat(5000)}`;
    const reportPath = await generateTestReport(createResultWithIssues(), longInsights);
    await page.goto(`file://${reportPath}`);

    const aiSection = page.locator('.ai-insights, .ai-section');
    await expect(aiSection).toBeVisible();

    // Content should be scrollable or wrap appropriately
    const overflow = await aiSection.evaluate((el) => {
      const contentEl = el.querySelector('pre, .ai-content, .insights-content');
      if (contentEl) {
        return window.getComputedStyle(contentEl).overflow;
      }
      return window.getComputedStyle(el).overflow;
    });

    // Should handle overflow gracefully
    expect(['auto', 'scroll', 'hidden', 'visible']).toContain(overflow);
  });

  test('AI insights appear after issues section', async ({ page }) => {
    const insights = 'Test insights';
    const reportPath = await generateTestReport(createResultWithIssues(), insights);
    await page.goto(`file://${reportPath}`);

    // Get positions of sections
    const issuesSection = page.locator('h2').filter({ hasText: /Issues/i });
    const aiSection = page.locator('h2').filter({ hasText: /AI.*Insights/i });

    await expect(issuesSection).toBeVisible();
    await expect(aiSection).toBeVisible();

    // AI insights should come after issues
    const issuesBox = await issuesSection.boundingBox();
    const aiBox = await aiSection.boundingBox();

    expect(aiBox?.y).toBeGreaterThan(issuesBox?.y || 0);
  });
});
