/**
 * Base Page Object
 *
 * Page Objects are a design pattern for organizing E2E tests. They:
 * - Encapsulate page-specific selectors and actions
 * - Make tests more readable and maintainable
 * - Allow selector changes in one place
 *
 * WHAT IS THE PAGE OBJECT PATTERN?
 * Instead of writing selectors directly in tests:
 *   await page.click('[data-testid="login-button"]');
 *
 * We encapsulate them in methods:
 *   await loginPage.clickLoginButton();
 *
 * Benefits:
 * - If a selector changes, update one place
 * - Tests read like user stories
 * - Complex interactions become simple method calls
 */

import { Page, Locator, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  // Common selectors available on all pages
  readonly header: Locator;
  readonly footer: Locator;
  readonly loadingSpinner: Locator;
  readonly errorToast: Locator;
  readonly successToast: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize common locators
    this.header = page.locator('header');
    this.footer = page.locator('footer');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    this.errorToast = page.locator('[data-testid="error-toast"]');
    this.successToast = page.locator('[data-testid="success-toast"]');
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Navigate to a path within the app.
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the page to fully load (no network activity).
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for loading spinner to disappear.
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for spinner to appear first (if it does)
    try {
      await this.loadingSpinner.waitFor({ state: 'visible', timeout: 1000 });
      // Then wait for it to disappear
      await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
    } catch {
      // Spinner never appeared, page loaded fast
    }
  }

  // ---------------------------------------------------------------------------
  // Common Actions
  // ---------------------------------------------------------------------------

  /**
   * Click a button by its text content.
   */
  async clickButton(text: string): Promise<void> {
    await this.page.getByRole('button', { name: text }).click();
  }

  /**
   * Click a link by its text content.
   */
  async clickLink(text: string): Promise<void> {
    await this.page.getByRole('link', { name: text }).click();
  }

  /**
   * Fill an input field by its label.
   */
  async fillInput(label: string, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Get the current URL path (without domain).
   */
  getCurrentPath(): string {
    const url = new URL(this.page.url());
    return url.pathname;
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  /**
   * Assert that the page title contains the expected text.
   */
  async expectTitleContains(text: string): Promise<void> {
    await expect(this.page).toHaveTitle(new RegExp(text));
  }

  /**
   * Assert that the URL path matches.
   */
  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${path}$`));
  }

  /**
   * Assert that text is visible on the page.
   */
  async expectTextVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  /**
   * Assert that an error toast is shown with the expected message.
   */
  async expectError(message: string): Promise<void> {
    await expect(this.errorToast).toBeVisible();
    await expect(this.errorToast).toContainText(message);
  }

  /**
   * Assert that a success toast is shown with the expected message.
   */
  async expectSuccess(message: string): Promise<void> {
    await expect(this.successToast).toBeVisible();
    await expect(this.successToast).toContainText(message);
  }

  // ---------------------------------------------------------------------------
  // Screenshot Helpers
  // ---------------------------------------------------------------------------

  /**
   * Take a screenshot with a descriptive name.
   * Useful for debugging and visual regression testing.
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `./e2e/screenshots/${name}.png`,
      fullPage: true,
    });
  }
}
