/**
 * Authentication Test Fixtures
 *
 * These fixtures provide reusable authentication state for E2E tests.
 * Since our app uses wallet-based authentication (SIWE - Sign-In With Ethereum),
 * we need to mock wallet connections for testing.
 *
 * WHAT ARE FIXTURES?
 * In Playwright, fixtures are reusable test setup functions. They:
 * - Set up preconditions (like logging in a user)
 * - Clean up after tests
 * - Can be composed (fixture A can use fixture B)
 *
 * WHY MOCK WALLETS?
 * Real wallet connections require:
 * - Browser extensions (MetaMask, etc.)
 * - User interaction (approve popups)
 * - Actual blockchain transactions
 *
 * For testing, we inject mock wallet state directly.
 */

import { test as base, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockUser {
  address: string;
  displayName: string;
  balance: string;
  elo: number;
}

export interface AuthFixtures {
  /** A logged-in user context with mock wallet */
  authenticatedPage: Page;
  /** Mock user data for the authenticated session */
  mockUser: MockUser;
  /** Helper to mock wallet connection on any page */
  mockWalletConnection: (page: Page, user?: MockUser) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Mock User
// ---------------------------------------------------------------------------

export const DEFAULT_MOCK_USER: MockUser = {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  displayName: 'TestPlayer',
  balance: '1000.00',
  elo: 1200,
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Inject mock wallet state into the page.
 *
 * This bypasses the actual wallet connection flow by:
 * 1. Setting localStorage with auth tokens
 * 2. Mocking the wallet provider APIs
 * 3. Setting up the user session state
 */
async function injectMockWallet(page: Page, user: MockUser = DEFAULT_MOCK_USER): Promise<void> {
  // Wait for page to be ready
  await page.waitForLoadState('domcontentloaded');

  // Inject mock wallet state into localStorage
  // This simulates what happens after a successful SIWE auth
  await page.evaluate((userData) => {
    // Mock auth session
    localStorage.setItem('chess-gamble-auth', JSON.stringify({
      address: userData.address,
      displayName: userData.displayName,
      authenticated: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
    }));

    // Mock user profile data
    localStorage.setItem('chess-gamble-user', JSON.stringify({
      address: userData.address,
      displayName: userData.displayName,
      balance: userData.balance,
      elo: userData.elo,
    }));
  }, user);

  // Refresh to apply the mock state
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/**
 * Clear all auth state from the page.
 */
async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('chess-gamble-auth');
    localStorage.removeItem('chess-gamble-user');
  });
}

// ---------------------------------------------------------------------------
// Extended Test with Auth Fixtures
// ---------------------------------------------------------------------------

/**
 * Extended Playwright test with authentication fixtures.
 *
 * Usage:
 * ```ts
 * import { test, expect } from './fixtures/auth.fixture';
 *
 * test('authenticated user can see dashboard', async ({ authenticatedPage }) => {
 *   await authenticatedPage.goto('/dashboard');
 *   await expect(authenticatedPage.getByText('Dashboard')).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<AuthFixtures>({
  // Mock user data
  mockUser: DEFAULT_MOCK_USER,

  // Helper to mock wallet connection on any page
  // eslint-disable-next-line no-empty-pattern
  mockWalletConnection: async ({}, provide) => {
    await provide(injectMockWallet);
  },

  // Pre-authenticated page
  authenticatedPage: async ({ page, mockUser }, provide) => {
    // Navigate to the app
    await page.goto('/');

    // Inject mock wallet state
    await injectMockWallet(page, mockUser);

    // Provide the page to the test
    await provide(page);

    // Cleanup after test
    await clearAuthState(page);
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Additional Fixtures for Specific Test Scenarios
// ---------------------------------------------------------------------------

/**
 * Create a test fixture with a specific mock user.
 *
 * Usage:
 * ```ts
 * const highEloUser = createMockUser({ elo: 2000, displayName: 'GrandMaster' });
 * ```
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    ...DEFAULT_MOCK_USER,
    ...overrides,
  };
}

/**
 * Generate a random Ethereum address for testing.
 */
export function randomAddress(): string {
  const hex = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += hex[Math.floor(Math.random() * 16)];
  }
  return address;
}
