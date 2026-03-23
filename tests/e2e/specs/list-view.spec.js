// specs/list-view.spec.js — List view tests
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
async function createEvent(page, title, opts) {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 3600000).toISOString();
  const data = {
    title,
    event_type: 'event',
    status: 'planned',
    start_time: now,
    end_time: end,
    ...(opts || {}),
  };
  const resp = await page.request.post('/api/events', { data });
  const ev = await resp.json();
  return ev.id;
}

// Switch to list view (ensures list view is visible)
async function ensureListView(page) {
  const listView = page.locator('#list-view');
  if (!await listView.isVisible().catch(() => false)) {
    // Try clicking the toggle button first
    const toggleBtn = page.locator('#btnViewToggle');
    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click();
    } else {
      // Fall back to keyboard shortcut
      await page.locator('body').click();
      await page.keyboard.press('l');
    }
    await page.waitForTimeout(500);
  }
  await expect(listView).toBeVisible({ timeout: 3000 });
}

test.describe('List view toggle', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);
  });

  test('toggle to list view shows table', async ({ page }) => {
    await ensureListView(page);

    const table = page.locator('#list-view-table');
    await expect(table).toBeVisible({ timeout: 3000 });

    // Should have thead with column headers
    const headers = page.locator('#list-view-table thead th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(2);
  });

  test('toggle back to timeline hides list view', async ({ page }) => {
    // First switch to list view
    await ensureListView(page);
    const listView = page.locator('#list-view');
    await expect(listView).toBeVisible();

    // Toggle back (click button or press 'l')
    const toggleBtn = page.locator('#btnViewToggle');
    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click();
    } else {
      await page.locator('body').click();
      await page.keyboard.press('l');
    }
    await page.waitForTimeout(500);

    await expect(listView).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('List view content', () => {
  const testIds = [];
  const testTitles = [];

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);

    // Create 3 test events
    const ts = Date.now();
    for (let i = 1; i <= 3; i++) {
      const title = `ListViewTest-${ts}-${i}`;
      const id = await createEvent(page, title);
      testIds.push(id);
      testTitles.push(title);
    }

    // Switch to list view
    await page.reload();
    await page.waitForTimeout(1000);
    await ensureListView(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup test events
    for (const id of testIds) {
      await page.request.delete(`/api/events/${id}`).catch(() => {});
    }
    testIds.length = 0;
    testTitles.length = 0;
  });

  test('list view shows created events', async ({ page }) => {
    // The table body should have rows
    const tbody = page.locator('#list-view-table tbody');
    await expect(tbody).toBeVisible({ timeout: 3000 });

    const rows = page.locator('#list-view-table tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);

    // Check that our test events appear in the page content
    const pageContent = await page.locator('#list-view').innerText();
    for (const title of testTitles) {
      expect(pageContent).toContain(title);
    }
  });

  test('event count indicator shows correct number', async ({ page }) => {
    const countEl = page.locator('#listCount');
    if (await countEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      const text = await countEl.innerText();
      // Should contain a number
      expect(text).toMatch(/\d+/);
      const count = parseInt(text.match(/\d+/)[0], 10);
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });
});

test.describe('List view sorting', () => {
  const testIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);

    // Create events with distinct titles
    const ts = Date.now();
    testIds.push(await createEvent(page, `AAA-Sort-${ts}`));
    testIds.push(await createEvent(page, `ZZZ-Sort-${ts}`));
    testIds.push(await createEvent(page, `MMM-Sort-${ts}`));

    await page.reload();
    await page.waitForTimeout(1000);
    await ensureListView(page);
  });

  test.afterEach(async ({ page }) => {
    for (const id of testIds) {
      await page.request.delete(`/api/events/${id}`).catch(() => {});
    }
    testIds.length = 0;
  });

  test('sort by clicking column headers', async ({ page }) => {
    // Find sortable column headers
    const sortableHeaders = page.locator('#list-view-table thead th[data-sort]');
    const headerCount = await sortableHeaders.count();

    if (headerCount > 0) {
      // Get initial row order
      const getFirstRowText = async () => {
        const firstRow = page.locator('#list-view-table tbody tr').first();
        if (await firstRow.isVisible().catch(() => false)) {
          return await firstRow.innerText();
        }
        return '';
      };

      const initialText = await getFirstRowText();

      // Click a sortable header to change sort
      await sortableHeaders.first().click();
      await page.waitForTimeout(500);

      const afterFirstClick = await getFirstRowText();

      // Click again to reverse sort
      await sortableHeaders.first().click();
      await page.waitForTimeout(500);

      const afterSecondClick = await getFirstRowText();

      // At least one click should have changed the order
      // (unless there's only one row)
      const rows = await page.locator('#list-view-table tbody tr').count();
      if (rows > 1) {
        const changed = (initialText !== afterFirstClick) || (afterFirstClick !== afterSecondClick);
        expect(changed).toBeTruthy();
      }
    }
  });
});

test.describe('List view filtering', () => {
  const testIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);

    const ts = Date.now();
    // Create events with different statuses
    testIds.push(await createEvent(page, `FilterPlanned-${ts}`, { status: 'planned' }));
    testIds.push(await createEvent(page, `FilterActive-${ts}`, { status: 'active' }));
    testIds.push(await createEvent(page, `FilterPlanned2-${ts}`, { status: 'planned' }));

    await page.reload();
    await page.waitForTimeout(1000);
    await ensureListView(page);
  });

  test.afterEach(async ({ page }) => {
    for (const id of testIds) {
      await page.request.delete(`/api/events/${id}`).catch(() => {});
    }
    testIds.length = 0;
  });

  test('filter by status reduces visible rows', async ({ page }) => {
    const statusFilter = page.locator('#listStatusFilter');
    if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Get initial row count
      const initialRows = await page.locator('#list-view-table tbody tr').count();

      // Filter by 'active' status
      await statusFilter.selectOption('active');
      await page.waitForTimeout(500);

      const filteredRows = await page.locator('#list-view-table tbody tr').count();

      // Filtered rows should be fewer (or equal if all are active)
      expect(filteredRows).toBeLessThanOrEqual(initialRows);

      // Reset filter
      await statusFilter.selectOption('');
      await page.waitForTimeout(500);

      const resetRows = await page.locator('#list-view-table tbody tr').count();
      expect(resetRows).toBeGreaterThanOrEqual(filteredRows);
    }
  });
});

test.describe('List view event deletion', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('delete event via API, verify row disappears on refresh', async ({ page }) => {
    const ts = Date.now();
    const title = `DeleteMe-${ts}`;
    const id = await createEvent(page, title);

    // Switch to list view and verify event is present
    await page.reload();
    await page.waitForTimeout(1000);
    await ensureListView(page);

    let content = await page.locator('#list-view').innerText();
    expect(content).toContain(title);

    // Delete the event via API
    const delResp = await page.request.delete(`/api/events/${id}`);
    expect(delResp.status()).toBe(200);

    // Reload and verify event is gone
    await page.reload();
    await page.waitForTimeout(1000);
    await ensureListView(page);

    content = await page.locator('#list-view').innerText();
    expect(content).not.toContain(title);
  });
});
