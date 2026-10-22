import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm --prefix server start',
      url: 'http://127.0.0.1:4000/api/comps',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm start',
      url: 'http://127.0.0.1:4173/en',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
