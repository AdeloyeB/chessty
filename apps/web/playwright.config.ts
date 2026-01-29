/**
 * Playwright Configuration for E2E Tests
 *
 * This configures Playwright to test the Chess Gamble web application.
 * Tests run against the development server and simulate user interactions.
 *
 * WHAT IS PLAYWRIGHT?
 * Playwright is a browser automation tool that can:
 * - Launch real browsers (Chrome, Firefox, Safari)
 * - Simulate user actions (clicks, typing, navigation)
 * - Take screenshots and record videos
 * - Assert on page content and state
 *
 * WHY E2E TESTS?
 * End-to-end tests verify the entire user flow works correctly:
 * - Frontend renders properly
 * - API calls succeed
 * - State updates correctly
 * - UI responds to user actions
 *
 * RUN TESTS:
 * - pnpm test:e2e (all tests)
 * - pnpm test:e2e --ui (interactive mode)
 * - pnpm test:e2e auth.spec.ts (single file)
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Where test files are located
  testDir: './e2e',

  // Maximum time one test can run (30 seconds)
  // Increased from default because wallet connections can be slow
  timeout: 30 * 1000,

  // Expect assertions timeout (5 seconds)
  expect: {
    timeout: 5000,
  },

  // Run tests in parallel for speed
  fullyParallel: true,

  // Fail the build if test.only() is left in code (prevents accidents in CI)
  forbidOnly: !!process.env.CI,

  // Retry failed tests (more retries in CI due to flakiness)
  retries: process.env.CI ? 2 : 0,

  // Number of parallel workers
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    // Terminal output
    ['list'],
    // HTML report (for debugging failed tests)
    ['html', { open: 'never' }],
  ],

  // Shared settings for all projects below
  use: {
    // Base URL for all tests
    baseURL: 'http://localhost:3000',

    // Collect trace on failure (for debugging)
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',

    // Browser viewport
    viewport: { width: 1280, height: 720 },
  },

  // Test against different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment these for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for dev server to start
  },
});
