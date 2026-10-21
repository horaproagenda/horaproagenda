import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium = process.env.PW_CHROMIUM_PATH
  ?? (existsSync('/bin/chromium') ? '/bin/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    launchOptions: systemChromium ? { executablePath: systemChromium } : undefined,
  },
});
