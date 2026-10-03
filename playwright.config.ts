import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/smoke',
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
      args: ['--no-sandbox']
    }
  },
  ...(process.env.BASE_URL ? {} : {
    webServer: {
      command: 'npm run dev:web',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30000
    }
  })
});
