/**
 * HTML Report Security Tests
 *
 * Tests security controls in generated HTML reports:
 * - XSS prevention (HTML entity escaping)
 * - Content Security Policy (CSP) headers
 * - URL sanitization (no javascript:, data: URIs)
 * - External link security attributes
 */

import { expect, test } from '@playwright/test';
import { createResultWithXSSVectors } from '../fixtures/mock-analysis-results.js';
import { cleanupTestReports, generateTestReport } from '../fixtures/test-reports.js';

test.describe('HTML Report Security', () => {
  test.afterAll(() => {
    cleanupTestReports();
  });

  test('escapes HTML in user-provided content', async ({ page }) => {
    const result = createResultWithXSSVectors();
    const reportPath = await generateTestReport(result);

    // Set up alert detection
    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    await page.goto(`file://${reportPath}`);

    // Verify HTML is escaped, not executed
    const content = await page.content();
    expect(content).toContain('&lt;script&gt;');
    expect(content).toContain('&lt;img src=x');
    expect(content).not.toContain('<script>alert');
    expect(content).not.toContain('<script>document.cookie');

    // Verify no alerts were triggered
    expect(alertTriggered).toBe(false);
  });

  test('Content Security Policy meta tag is present and restrictive', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    // Check for CSP meta tag
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);

    const cspContent = await cspMeta.getAttribute('content');
    expect(cspContent).toContain("script-src 'none'");
    expect(cspContent).toContain("default-src 'self'");
  });

  test('no inline scripts are present', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    // Check that no <script> tags exist
    const scriptTags = page.locator('script');
    await expect(scriptTags).toHaveCount(0);

    // Check that no inline event handlers exist
    const content = await page.content();
    expect(content).not.toMatch(/on\w+\s*=/i); // No onclick, onerror, etc.
  });

  test('sanitizes malicious javascript: URLs', async ({ page }) => {
    const result = createResultWithXSSVectors();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Get all links
    const links = await page.locator('a').all();

    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href) {
        // Verify no javascript: URLs
        expect(href).not.toMatch(/^javascript:/i);
      }
    }
  });

  test('sanitizes malicious data: URLs', async ({ page }) => {
    const result = createResultWithXSSVectors();
    const reportPath = await generateTestReport(result);
    await page.goto(`file://${reportPath}`);

    // Get all links
    const links = await page.locator('a').all();

    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href) {
        // Verify no data: URLs
        expect(href).not.toMatch(/^data:/i);
      }
    }
  });

  test('external links have security attributes', async ({ page }) => {
    const reportPath = await generateTestReport({
      issues: [
        {
          type: 'self-merge',
          severity: 'low',
          repository: 'test/repo',
          description: 'Test issue',
          details: {
            url: 'https://github.com/test/repo/pull/123',
          },
          detected_at: new Date().toISOString(),
        },
      ],
    });
    await page.goto(`file://${reportPath}`);

    // Find external links (target="_blank")
    const externalLinks = page.locator('a[target="_blank"]');

    if ((await externalLinks.count()) > 0) {
      const firstLink = externalLinks.first();

      // Check for rel="noopener noreferrer"
      const rel = await firstLink.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('escapes HTML in repository names', async ({ page }) => {
    const reportPath = await generateTestReport({
      issues: [
        {
          type: 'self-merge',
          severity: 'low',
          repository: '<script>alert("repo")</script>',
          description: 'Test issue',
          details: {},
          detected_at: new Date().toISOString(),
        },
      ],
    });
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Verify repository name is escaped
    expect(content).toContain('&lt;script&gt;');
    expect(content).not.toContain('<script>alert("repo")');
  });

  test('escapes HTML in issue descriptions', async ({ page }) => {
    const reportPath = await generateTestReport({
      issues: [
        {
          type: 'self-merge',
          severity: 'low',
          repository: 'test/repo',
          description: '<img src=x onerror=alert(1)>',
          details: {},
          detected_at: new Date().toISOString(),
        },
      ],
    });
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Verify description is escaped
    expect(content).toContain('&lt;img');
    expect(content).not.toContain('<img src=x onerror=');
  });

  test('escapes HTML in recommendations', async ({ page }) => {
    const reportPath = await generateTestReport({
      recommendations: ['<script>malicious()</script>', 'Valid recommendation'],
    });
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Verify recommendations are escaped
    expect(content).toContain('&lt;script&gt;');
    expect(content).not.toContain('<script>malicious()');
  });

  test('handles special characters in issue details', async ({ page }) => {
    const reportPath = await generateTestReport({
      issues: [
        {
          type: 'self-merge',
          severity: 'low',
          repository: 'test/repo',
          description: 'Test with <, >, &, ", and \' characters',
          details: {
            title: 'Issue with & and < and >',
          },
          detected_at: new Date().toISOString(),
        },
      ],
    });
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Verify special characters are escaped
    expect(content).toContain('&lt;');
    expect(content).toContain('&gt;');
    expect(content).toContain('&amp;');
  });

  test('no inline styles that could leak data', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Check that styles are in <style> tags, not inline
    // This is okay: <style>...</style>
    // This should be minimized: <div style="...">

    // Count inline style attributes (should be minimal or none for security)
    const elementsWithStyle = await page.locator('[style]').count();

    // Allow some inline styles for legitimate layout, but flag excessive use
    expect(elementsWithStyle).toBeLessThan(10);
  });

  test('validates DOCTYPE and meta charset', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    const content = await page.content();

    // Verify proper DOCTYPE
    expect(content).toContain('<!DOCTYPE html>');

    // Verify UTF-8 charset
    const charsetMeta = page.locator('meta[charset="UTF-8"]');
    await expect(charsetMeta).toHaveCount(1);
  });

  test('no form elements that could submit data', async ({ page }) => {
    const reportPath = await generateTestReport();
    await page.goto(`file://${reportPath}`);

    // Verify no forms exist (reports should be read-only)
    const forms = page.locator('form');
    await expect(forms).toHaveCount(0);

    // Verify no input fields
    const inputs = page.locator('input, textarea');
    await expect(inputs).toHaveCount(0);
  });
});
