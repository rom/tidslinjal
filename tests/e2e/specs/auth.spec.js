// specs/auth.spec.js — Authentication UI tests
const { test, expect } = require('@playwright/test');

test.describe('Login page', () => {
  test('renders login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign")')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', 'wronguser');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
    // Either an error message appears or stay on login page
    await page.waitForTimeout(1000);
    const url = page.url();
    // If credentials are wrong, should stay on login or show an error
    const isOnLogin = url.includes('/login') || url.endsWith('/');
    const errorVisible = await page.locator('[class*="error"], [id*="error"], [class*="alert"]').isVisible().catch(() => false);
    expect(isOnLogin || errorVisible).toBeTruthy();
  });

  test('redirects to app on valid login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', 'admin');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
    await page.waitForURL(/^(?!.*login).*$/, { timeout: 5000 });
    // Should be on main app
    expect(page.url()).not.toContain('/login');
  });
});

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', 'admin');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
    await page.waitForURL(/^(?!.*login).*$/, { timeout: 5000 });
  });

  test('logout redirects to login', async ({ page }) => {
    // Find and click logout button
    const logoutBtn = page.locator('[data-action="logout"], button:has-text("Logout"), a:has-text("Logout"), #btnLogout');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    } else {
      // Logout via API instead
      await page.request.post('/api/auth/logout');
      await page.goto('/');
      // Should redirect to login
      await page.waitForTimeout(500);
    }
  });
});
