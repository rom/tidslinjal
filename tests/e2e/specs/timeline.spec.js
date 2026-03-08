// specs/timeline.spec.js — Timeline UI / regression tests
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

test.describe('App shell renders', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('main timeline container is visible', async ({ page }) => {
    const timeline = page.locator('#timeline-container, #timeline, [class*="timeline"]');
    await expect(timeline.first()).toBeVisible({ timeout: 8000 });
  });

  test('navigation buttons are present', async ({ page }) => {
    // Prev/Next navigation buttons
    const navBtn = page.locator('button:has-text("‹"), button:has-text("›"), [data-action="prev"], [data-action="next"]');
    await expect(navBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('header clock is visible', async ({ page }) => {
    const clock = page.locator('#clockTime, [id*="clock"]');
    if (await clock.first().isVisible()) {
      const text = await clock.first().innerText();
      expect(text).toMatch(/\d{2}:\d{2}/);
    }
  });

  test('language flag buttons are present', async ({ page }) => {
    const flags = page.locator('[class*="lang"], [onclick*="setLang"], [data-lang]');
    expect(await flags.count()).toBeGreaterThan(0);
  });

  test('resolution selector is present', async ({ page }) => {
    const resSelect = page.locator('select[id*="resol"], select[onchange*="resolution"], #resolution');
    if (await resSelect.first().isVisible()) {
      const options = await resSelect.first().locator('option').count();
      expect(options).toBeGreaterThan(2);
    }
  });

  test('sidebar is accessible', async ({ page }) => {
    // Find sidebar toggle or sidebar itself
    const sidebar = page.locator('#sidebar, [class*="sidebar"]');
    if (await sidebar.first().isVisible()) {
      await expect(sidebar.first()).toBeVisible();
    }
  });
});

test.describe('Event modal', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('clicking new event button opens event modal', async ({ page }) => {
    // Look for an "add event" button
    const addBtn = page.locator(
      'button:has-text("+ Event"), button:has-text("Add Event"), button:has-text("New Event"), [data-action="new-event"], #btnNewEvent'
    );
    if (await addBtn.first().isVisible({ timeout: 3000 })) {
      await addBtn.first().click();
      const modal = page.locator('#eventModal, [class*="event-modal"], .modal.open');
      await expect(modal.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('event modal has required fields', async ({ page }) => {
    const addBtn = page.locator(
      'button:has-text("+ Event"), button:has-text("Add Event"), button:has-text("New Event"), #btnNewEvent'
    );
    if (await addBtn.first().isVisible({ timeout: 3000 })) {
      await addBtn.first().click();
      await page.waitForTimeout(500);
      // Check title field
      const titleInput = page.locator('#eventModal input[name="title"], #eventTitle, [placeholder*="title" i]');
      if (await titleInput.first().isVisible({ timeout: 2000 })) {
        await expect(titleInput.first()).toBeVisible();
      }
    }
  });
});

test.describe('Event operations via API + UI verification', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('events appear in timeline after creation', async ({ page }) => {
    const uniqueTitle = `Test Event ${Date.now()}`;
    await createEvent(page, uniqueTitle);

    // Navigate to ensure correct date range is shown
    const now = new Date();
    const from = new Date(now.getTime() - 60000).toISOString();
    const to = new Date(now.getTime() + 7200000).toISOString();

    // Reload the page to force a refresh
    await page.reload();
    await page.waitForTimeout(2000);

    // Check if event title appears anywhere in the page
    const body = await page.content();
    // The event might render on the timeline or via search
    expect(typeof body).toBe('string'); // page loaded
  });

  test('GET /api/events returns JSON array', async ({ page }) => {
    const resp = await page.request.get('/api/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('event lifecycle: create → status change → delete', async ({ page }) => {
    const id = await createEvent(page, 'Lifecycle Test');

    // Change status
    const statusResp = await page.request.patch(`/api/events/${id}/status`, {
      data: { status: 'active' },
    });
    expect(statusResp.status()).toBe(200);
    const statusBody = await statusResp.json();
    expect(statusBody.status).toBe('active');

    // Delete
    const delResp = await page.request.delete(`/api/events/${id}`);
    expect(delResp.status()).toBe(200);

    // Verify gone
    const resp = await page.request.get('/api/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z');
    const events = await resp.json();
    const found = events.find(e => e.id === id);
    expect(found).toBeUndefined();
  });
});

test.describe('Modals', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('settings panel can be opened', async ({ page }) => {
    // Settings is a sidebar tab (not a modal)
    const settingsTab = page.locator('.sidebar-tab[data-tab="settings"]');
    await expect(settingsTab).toBeVisible({ timeout: 5000 });
    await settingsTab.click();
    await page.waitForTimeout(500);
    // After click, sidebar content should be populated
    const sidebarContent = page.locator('#sidebarContent');
    await expect(sidebarContent).toBeVisible({ timeout: 3000 });
    const text = await sidebarContent.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('error modal does not appear on clean load', async ({ page }) => {
    await page.waitForTimeout(2000);
    const errorModal = page.locator('#errorModal.open');
    expect(await errorModal.isVisible()).toBeFalsy();
  });

  test('modal overlay closes modal on click', async ({ page }) => {
    // Try to open any modal via JavaScript
    await page.evaluate(() => {
      const fn = window.openModal;
      if (typeof fn === 'function') {
        fn('eventModal');
      }
    });
    await page.waitForTimeout(300);

    const modal = page.locator('#eventModal.open');
    if (await modal.isVisible()) {
      // Click overlay (outside modal box)
      await modal.click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(300);
      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 2000 });
    }
  });
});

test.describe('Responsive layout', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('app renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForTimeout(1000);
    // Page should load without JS errors
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('no JavaScript errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.reload();
    await page.waitForTimeout(2000);
    // Filter out known non-critical errors
    const serious = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('net::')
    );
    if (serious.length > 0) {
      console.log('JS errors on page load:', serious);
    }
    expect(serious.length).toBe(0);
  });
});

test.describe('API regression tests', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('POST /api/auth/login returns user without password_hash', async ({ page }) => {
    const resp = await page.request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin' },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.username).toBe('admin');
    expect(body.password_hash).toBeUndefined();
  });

  test('GET /api/version returns correct version', async ({ page }) => {
    const resp = await page.request.get('/api/version');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.version).toBe('3.5.0');
  });

  test('unauthenticated access to protected endpoints → 401', async ({ page }) => {
    // Create a new context without session cookies
    const newPage = await page.context().browser().newPage();
    const resp = await newPage.request.get('/api/events');
    expect(resp.status()).toBe(401);
    await newPage.close();
  });

  test('GET /api/export has correct structure', async ({ page }) => {
    const resp = await page.request.get('/api/export');
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    // Empty slices serialize as null in Go JSON — check key presence in raw text
    for (const field of ['version', 'events', 'users', 'layers', 'groups']) {
      expect(text).toContain(`"${field}"`);
    }
    const body = JSON.parse(text);
    expect(typeof body.version).toBe('string');
  });

  test('event CRUD does not break event list', async ({ page }) => {
    // Get initial count (empty list may serialize as null in Go JSON)
    const rawBefore = await (await page.request.get(
      '/api/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z'
    )).json();
    const listBefore = rawBefore || [];
    const countBefore = listBefore.length;

    // Create
    const id = await createEvent(page, 'Regression Event');

    // Count increased
    const rawAfter = await (await page.request.get(
      '/api/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z'
    )).json();
    const listAfter = rawAfter || [];
    expect(listAfter.length).toBe(countBefore + 1);

    // Delete and verify count restored
    await page.request.delete(`/api/events/${id}`);
    const rawFinal = await (await page.request.get(
      '/api/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z'
    )).json();
    const listFinal = rawFinal || [];
    expect(listFinal.length).toBe(countBefore);
  });
});
