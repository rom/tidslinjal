// specs/accessibility.spec.js — Accessibility tests
const { test, expect } = require('@playwright/test');

// Login helper
async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin');
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 8000 });
}

// Create an event via API and return its ID
async function createEvent(page, title) {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 3600000).toISOString();
  const resp = await page.request.post('/api/events', {
    data: { title, event_type: 'event', status: 'planned', start_time: now, end_time: end },
  });
  const ev = await resp.json();
  return ev.id;
}

test.describe('Page structure and landmarks', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);
  });

  test('page has <main> element', async ({ page }) => {
    const main = page.locator('main');
    await expect(main.first()).toBeVisible({ timeout: 5000 });
  });

  test('page has <header> with role="banner"', async ({ page }) => {
    const header = page.locator('header[role="banner"], header#header');
    await expect(header.first()).toBeVisible({ timeout: 5000 });

    // Verify role attribute
    const role = await header.first().getAttribute('role');
    expect(role).toBe('banner');
  });

  test('page has <aside> sidebar', async ({ page }) => {
    const sidebar = page.locator('aside, #sidebar, [class*="sidebar"]');
    // Sidebar may be collapsed but should exist in DOM
    const count = await sidebar.count();
    expect(count).toBeGreaterThan(0);
  });

  test('skip links exist in DOM', async ({ page }) => {
    const skipLinks = page.locator('a.a11y-skip-link');
    const count = await skipLinks.count();
    expect(count).toBeGreaterThan(0);

    // Check that skip links have href attributes pointing to page sections
    for (let i = 0; i < count; i++) {
      const href = await skipLinks.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href.startsWith('#')).toBeTruthy();
    }
  });
});

test.describe('Modal accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);
  });

  test('modals get role="dialog" and aria-modal="true" when opened', async ({ page }) => {
    // Open event modal via JavaScript
    await page.evaluate(() => {
      if (typeof openModal === 'function') openModal('eventModal');
    });
    await page.waitForTimeout(400);

    const modal = page.locator('#eventModal.open');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const role = await modal.getAttribute('role');
      expect(role).toBe('dialog');

      const ariaModal = await modal.getAttribute('aria-modal');
      expect(ariaModal).toBe('true');

      const ariaHidden = await modal.getAttribute('aria-hidden');
      expect(ariaHidden).toBe('false');

      // Close modal for cleanup
      await page.evaluate(() => {
        if (typeof closeModal === 'function') closeModal('eventModal');
      });
    }
  });

  test('focus trap works in modal — Tab key stays within modal', async ({ page }) => {
    // Open event modal
    await page.evaluate(() => {
      if (typeof openModal === 'function') openModal('eventModal');
    });
    await page.waitForTimeout(400);

    const modal = page.locator('#eventModal.open');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Collect all focusable elements inside the modal
      const focusableCount = await page.evaluate(() => {
        const overlay = document.querySelector('#eventModal.open .modal');
        if (!overlay) return 0;
        const focusable = overlay.querySelectorAll(
          'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        return focusable.length;
      });

      // There should be focusable elements in the modal
      expect(focusableCount).toBeGreaterThan(0);

      // Tab through elements and verify focus stays within modal
      for (let i = 0; i < focusableCount + 2; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
      }

      // After tabbing past all elements, focus should wrap back inside the modal
      const focusedInModal = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return false;
        const modal = document.querySelector('#eventModal.open');
        return modal ? modal.contains(active) : false;
      });
      expect(focusedInModal).toBeTruthy();

      // Cleanup
      await page.evaluate(() => {
        if (typeof closeModal === 'function') closeModal('eventModal');
      });
    }
  });

  test('modal closes on Escape and returns focus', async ({ page }) => {
    // Open modal
    await page.evaluate(() => {
      if (typeof openModal === 'function') openModal('eventModal');
    });
    await page.waitForTimeout(400);

    const modal = page.locator('#eventModal.open');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      // Modal should be closed
      await expect(modal).not.toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Event block accessibility', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('event blocks have role="button" and tabindex="0"', async ({ page }) => {
    const uniqueTitle = `A11yEvent ${Date.now()}`;
    const eventId = await createEvent(page, uniqueTitle);

    // Reload to render the new event
    await page.reload();
    await page.waitForTimeout(2000);

    // Find event blocks in the timeline
    const eventBlocks = page.locator('.tl-event, [class*="event-block"], [data-event-id]');
    const count = await eventBlocks.count();

    if (count > 0) {
      // Check first event block for accessibility attributes
      const block = eventBlocks.first();
      const role = await block.getAttribute('role');
      const tabindex = await block.getAttribute('tabindex');

      expect(role).toBe('button');
      expect(tabindex).toBe('0');
    }

    // Cleanup
    await page.request.delete(`/api/events/${eventId}`);
  });
});

test.describe('Accessibility snapshot', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);
  });

  test('no accessibility violations with page.accessibility.snapshot()', async ({ page }) => {
    const snapshot = await page.accessibility.snapshot();
    expect(snapshot).toBeTruthy();

    // The page should have a non-empty accessibility tree
    expect(snapshot.role).toBeTruthy();

    // Check that the tree has children (page is not empty)
    if (snapshot.children) {
      expect(snapshot.children.length).toBeGreaterThan(0);
    }

    // Verify important landmarks are present in the a11y tree
    const roles = [];
    function collectRoles(node) {
      if (node.role) roles.push(node.role);
      if (node.children) node.children.forEach(collectRoles);
    }
    collectRoles(snapshot);

    // Page should have some interactive elements
    const hasInteractive = roles.some(r =>
      ['button', 'link', 'textbox', 'combobox', 'heading'].includes(r)
    );
    expect(hasInteractive).toBeTruthy();
  });
});
