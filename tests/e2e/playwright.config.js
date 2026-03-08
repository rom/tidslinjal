// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.TEST_PORT || '18081';
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,   // sequential — single server instance
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `../../tidslinjal --port ${PORT} --data /tmp/tidslinjal-e2e-${PORT}`,
    url: BASE_URL + '/api/version',
    reuseExistingServer: true,
    timeout: 15_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
        },
      },
    },
  ],
});
