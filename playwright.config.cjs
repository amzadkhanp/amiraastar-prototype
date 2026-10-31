const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', timeout: 30000, expect: { timeout: 5000 }, fullyParallel: false, workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:8000', headless: true, screenshot: 'only-on-failure' },
  outputDir: './test-output',
});
