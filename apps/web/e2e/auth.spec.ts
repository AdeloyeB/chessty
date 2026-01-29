/**
 * Authentication E2E Tests
 *
 * Tests the login screen, authentication flow, and logout functionality.
 * Uses the dev_login button for testing authenticated states.
 */

import { test, expect } from '@playwright/test';

// Extend timeout for all tests in this file
test.setTimeout(60000);

// ---------------------------------------------------------------------------
// Landing Page (Unauthenticated) Tests
// ---------------------------------------------------------------------------

test.describe('Landing Page (Unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh page visit - Playwright provides isolated context per test
    await page.goto('/');
    // Wait for the page to be interactive (faster than networkidle)
    await page.waitForLoadState('domcontentloaded');
    // Additional wait for React hydration
    await page.waitForTimeout(1000);
  });

  test('landing page loads correctly', async ({ page }) => {
    // Should show the tagline "play • predict • win"
    await expect(page.locator('text=play').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=predict').first()).toBeVisible();
  });

  test('OAuth buttons are visible', async ({ page }) => {
    // OAuth buttons for Google and Twitter are rendered as icon buttons
    const oauthButtons = page.locator('button').filter({ has: page.locator('svg') });
    await expect(oauthButtons.first()).toBeVisible({ timeout: 15000 });
  });

  test('wallet connection section is visible', async ({ page }) => {
    // Wallet section with "OR CONNECT WALLET" text (uppercase)
    await expect(page.locator('text=OR CONNECT WALLET')).toBeVisible({ timeout: 15000 });
  });

  test('login form elements are present', async ({ page }) => {
    // Email input with placeholder
    await expect(page.locator('input[placeholder="you@example.com"]')).toBeVisible({ timeout: 15000 });

    // Password input
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Login submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login and register tabs exist', async ({ page }) => {
    const loginTab = page.locator('button').filter({ hasText: 'login' }).first();
    const registerTab = page.locator('button').filter({ hasText: 'register' }).first();

    await expect(loginTab).toBeVisible({ timeout: 15000 });
    await expect(registerTab).toBeVisible();
  });

  test('can toggle between login and register modes', async ({ page }) => {
    const loginTab = page.locator('button').filter({ hasText: 'login' }).first();
    const registerTab = page.locator('button').filter({ hasText: 'register' }).first();

    // Click register tab
    await registerTab.click();

    // Username field should appear (placeholder: your_name)
    await expect(page.locator('input[placeholder="your_name"]')).toBeVisible({ timeout: 10000 });

    // Click login tab
    await loginTab.click();

    // Username field should disappear
    await expect(page.locator('input[placeholder="your_name"]')).not.toBeVisible();
  });

  test('dev login button is visible', async ({ page }) => {
    // The dev login button appears in development mode
    const devLoginButton = page.locator('button').filter({ hasText: 'dev_login' });
    await expect(devLoginButton).toBeVisible({ timeout: 15000 });
  });

  test('dev login works and shows dashboard', async ({ page }) => {
    // Click the dev login button
    const devLoginButton = page.locator('button').filter({ hasText: 'dev_login' });
    await devLoginButton.click();

    // Wait for dashboard to load - look for home tab button
    await expect(page.locator('button').filter({ hasText: 'home' }).first()).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Authenticated User Flow Tests
// ---------------------------------------------------------------------------

test.describe('Authenticated User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Go to app and use dev login to authenticate
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Use dev login
    const devLoginButton = page.locator('button').filter({ hasText: 'dev_login' });
    await devLoginButton.click({ timeout: 15000 });

    // Wait for dashboard to load
    await expect(page.locator('button').filter({ hasText: 'home' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('dashboard displays navigation tabs', async ({ page }) => {
    // All main navigation tabs should be visible
    await expect(page.locator('button').filter({ hasText: 'home' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'find_game' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'practice' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'history' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'rankings' }).first()).toBeVisible();
  });

  test('home tab shows your_profile section', async ({ page }) => {
    await expect(page.locator('text=your_profile')).toBeVisible({ timeout: 15000 });
  });

  test('home tab shows user stats', async ({ page }) => {
    // Win/loss/draw stats should be visible
    await expect(page.locator('text=wins').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=losses').first()).toBeVisible();
    await expect(page.locator('text=draws').first()).toBeVisible();
  });

  test('home tab shows live_matches section', async ({ page }) => {
    await expect(page.locator('text=live_matches')).toBeVisible({ timeout: 15000 });
  });

  test('home tab shows top_players section', async ({ page }) => {
    await expect(page.locator('text=top_players')).toBeVisible({ timeout: 15000 });
  });

  test('home tab shows daily_challenge section', async ({ page }) => {
    await expect(page.locator('text=daily_challenge')).toBeVisible({ timeout: 15000 });
  });

  test('can navigate to find_game tab', async ({ page }) => {
    const findGameTab = page.locator('button').filter({ hasText: 'find_game' }).first();
    await findGameTab.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('can navigate to practice tab', async ({ page }) => {
    const practiceTab = page.locator('button').filter({ hasText: 'practice' }).first();
    await practiceTab.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('can navigate to history tab', async ({ page }) => {
    const historyTab = page.locator('button').filter({ hasText: 'history' }).first();
    await historyTab.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('can navigate to rankings tab', async ({ page }) => {
    const rankingsTab = page.locator('button').filter({ hasText: 'rankings' }).first();
    await rankingsTab.click();

    await page.waitForLoadState('domcontentloaded');

    // Leaderboard should load - look for elo text
    await expect(page.locator('text=elo').first()).toBeVisible({ timeout: 15000 });
  });

  test('profile section with view link is visible', async ({ page }) => {
    // The profile section has "your_profile" header and "view →" link
    await expect(page.locator('text=your_profile')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=view →').first()).toBeVisible();
  });

  test('exit button is visible', async ({ page }) => {
    // Exit button is in the title bar / nav area
    const exitButton = page.locator('text=exit').first();
    await expect(exitButton).toBeVisible({ timeout: 15000 });
  });

  test('profile link exists and is clickable', async ({ page }) => {
    // Verify the profile section link exists - it wraps the profile card
    // The Link contains "your_profile" text
    const profileLink = page.locator('a[href="/profile"]').filter({ hasText: 'your_profile' }).first();

    // The link should exist in the DOM (even if visually hidden by overflow)
    await expect(profileLink).toBeAttached({ timeout: 15000 });

    // Check if we can get the href attribute to confirm it's a valid profile link
    const href = await profileLink.getAttribute('href');
    expect(href).toBe('/profile');
  });
});

// ---------------------------------------------------------------------------
// Logout Flow Tests
// ---------------------------------------------------------------------------

test.describe('Logout Flow', () => {
  test('exit button logs out and shows login screen', async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const devLoginButton = page.locator('button').filter({ hasText: 'dev_login' });
    await devLoginButton.click({ timeout: 15000 });

    // Wait for dashboard
    await expect(page.locator('button').filter({ hasText: 'home' }).first()).toBeVisible({ timeout: 15000 });

    // Click exit button/text
    const exitButton = page.locator('text=exit').first();
    await exitButton.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Should return to login screen - dev_login button should be visible again
    await expect(page.locator('button').filter({ hasText: 'dev_login' })).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Quick Play Buttons Tests
// ---------------------------------------------------------------------------

test.describe('Quick Play Buttons on Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const devLoginButton = page.locator('button').filter({ hasText: 'dev_login' });
    await devLoginButton.click({ timeout: 15000 });

    await expect(page.locator('button').filter({ hasText: 'home' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('find_game action button exists on home', async ({ page }) => {
    // The home content has large action buttons for find_game and practice
    const findGameButtons = page.locator('button').filter({ hasText: 'find_game' });
    const count = await findGameButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('practice action button exists on home', async ({ page }) => {
    const practiceButtons = page.locator('button').filter({ hasText: 'practice' });
    const count = await practiceButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
