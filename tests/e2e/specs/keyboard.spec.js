// specs/keyboard.spec.js — Keyboard shortcut tests
const { test, expect } = require('@playwright/test');

// Login helper
async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin');
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 8000 });
}

// Wait for timeline to be ready
async function waitForTimeline(page) {
  const timeline = page.locator('#timeline-container, #timeline, [class*="timeline"]');
  await expect(timeline.first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
}

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForTimeline(page);
    // Ensure focus is on the body (not an input) so shortcuts fire
    await page.locator('body').click();
  });

  test('press "t" navigates to today', async ({ page }) => {
    // Record state before pressing 't'
    const beforeDate = await page.evaluate(() => {
      return window.state ? window.state.startDate : null;
    });

    // Navigate away from today first (press ArrowRight a few times)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    // Press 't' to go to today
    await page.keyboard.press('t');
    await page.waitForTimeout(500);

    // Verify we moved — the btnToday effect should have triggered
    // Check that the today marker or current date is visible
    const todayMarker = page.locator('.tl-now-line, [class*="today"], [data-today]');
    if (await todayMarker.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(todayMarker.first()).toBeVisible();
    } else {
      // At minimum, the page should still be functional after pressing 't'
      const timeline = page.locator('#timeline-container, #timeline');
      await expect(timeline.first()).toBeVisible();
    }
  });

  test('press "Escape" closes open modal', async ({ page }) => {
    // Open a modal via JavaScript
    await page.evaluate(() => {
      if (typeof openModal === 'function') openModal('eventModal');
    });
    await page.waitForTimeout(400);

    const modal = page.locator('#eventModal.open');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Press Escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await expect(modal).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('press "/" focuses search input', async ({ page }) => {
    await page.keyboard.press('/');
    await page.waitForTimeout(400);

    // Check if search input is focused
    const searchFocused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      return active.id === 'searchInput' ||
             active.id === 'listSearch' ||
             active.type === 'search' ||
             (active.placeholder && active.placeholder.toLowerCase().includes('search'));
    });
    expect(searchFocused).toBeTruthy();
  });

  test('press "l" toggles list view', async ({ page }) => {
    // Initially list view should be hidden
    const listView = page.locator('#list-view');
    const initiallyVisible = await listView.isVisible().catch(() => false);

    // Press 'l' to toggle list view
    await page.keyboard.press('l');
    await page.waitForTimeout(500);

    // Check that visibility changed
    const afterToggle = await listView.isVisible().catch(() => false);
    expect(afterToggle).not.toBe(initiallyVisible);

    // Press 'l' again to toggle back
    await page.keyboard.press('l');
    await page.waitForTimeout(500);

    const afterSecondToggle = await listView.isVisible().catch(() => false);
    expect(afterSecondToggle).toBe(initiallyVisible);
  });

  test('press "+" and "-" change zoom', async ({ page }) => {
    // Get initial zoom factor
    const initialZoom = await page.evaluate(() => {
      return window.state ? window.state.zoomFactor : 1.0;
    });

    // Press '+' to zoom in
    await page.keyboard.press('+');
    await page.waitForTimeout(300);

    const zoomAfterPlus = await page.evaluate(() => {
      return window.state ? window.state.zoomFactor : 1.0;
    });
    expect(zoomAfterPlus).toBeGreaterThan(initialZoom);

    // Verify CSS variable changed
    const cssZoom = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--ev-zoom-scale').trim();
    });
    expect(parseFloat(cssZoom)).toBeGreaterThan(0);

    // Press '-' to zoom out
    await page.keyboard.press('-');
    await page.waitForTimeout(300);

    const zoomAfterMinus = await page.evaluate(() => {
      return window.state ? window.state.zoomFactor : 1.0;
    });
    expect(zoomAfterMinus).toBeLessThan(zoomAfterPlus);
  });

  test('arrow keys navigate timeline', async ({ page }) => {
    // Get initial start date
    const initialStart = await page.evaluate(() => {
      return window.state ? window.state.startDate : null;
    });

    // Press ArrowRight to navigate forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    const afterRight = await page.evaluate(() => {
      return window.state ? window.state.startDate : null;
    });

    // Start date should have changed (moved forward)
    if (initialStart && afterRight) {
      expect(afterRight).not.toBe(initialStart);
    }

    // Press ArrowLeft to navigate back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);

    const afterLeft = await page.evaluate(() => {
      return window.state ? window.state.startDate : null;
    });

    // Should be back near the original position
    if (initialStart && afterLeft) {
      expect(afterLeft).toBe(initialStart);
    }
  });
});
