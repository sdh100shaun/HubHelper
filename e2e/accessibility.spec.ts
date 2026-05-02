import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:3000/HubHelper';

test.describe('WCAG AAA Accessibility', () => {
  test.describe.configure({ timeout: 60_000 });

  test('homepage has no critical accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'best-practice'])
      .exclude('.prism-code, [class*="codeBlock"], pre[class*="language-"]')
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (critical.length > 0) {
      const summary = critical.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance(s))`
      );
      console.error(`Critical/serious a11y violations:\n${summary.join('\n')}`);
    }

    expect(critical).toHaveLength(0);
  });

  test('docs intro page has no critical accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/intro`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'best-practice'])
      .exclude('.prism-code, [class*="codeBlock"], pre[class*="language-"]')
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (critical.length > 0) {
      const summary = critical.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance(s))`
      );
      console.error(`Critical/serious a11y violations:\n${summary.join('\n')}`);
    }

    expect(critical).toHaveLength(0);
  });

  test('homepage focus indicators are visible on interactive elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Tab to first interactive element and verify focus outline
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible');
    await expect(focused).toBeVisible();
  });

  test('PolicyShowcase tabs have correct ARIA roles', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toHaveCount(1);

    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);

    // First tab should be selected
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    const tabpanel = page.locator('[role="tabpanel"]');
    await expect(tabpanel).toHaveCount(1);
  });

  test('AIDemo scenario buttons have ARIA attributes', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const group = page.locator('[role="group"][aria-label="Demo scenarios"]');
    await expect(group).toHaveCount(1);

    const buttons = group.locator('button[aria-pressed]');
    await expect(buttons).toHaveCount(3);

    // First button should be pressed
    await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('decorative elements are hidden from assistive technology', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Terminal dots
    const dots = page.locator('.terminal-dot');
    for (const dot of await dots.all()) {
      await expect(dot).toHaveAttribute('aria-hidden', 'true');
    }

    // Feature card icons
    const icons = page.locator('.feature-card__icon');
    for (const icon of await icons.all()) {
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    }

    // Flow node icons
    const flowIcons = page.locator('.flow-node__icon');
    for (const icon of await flowIcons.all()) {
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
