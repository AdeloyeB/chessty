/**
 * OAuth Service
 *
 * Handles OAuth authentication flows for Google and GitHub.
 *
 * What is OAuth?
 * OAuth is a way to let users log in using their existing accounts (Google, GitHub, etc.)
 * instead of creating a new username/password. The flow works like this:
 *
 * 1. User clicks "Login with Google/GitHub"
 * 2. We redirect them to Google/GitHub with a "state" token (for security)
 * 3. User logs in on Google/GitHub and approves our app
 * 4. Google/GitHub redirects back to us with a "code"
 * 5. We exchange that code for an access token
 * 6. We use the access token to fetch the user's profile (email, name, etc.)
 * 7. We create or find the user in our database and log them in
 *
 * The "state" token is for CSRF protection - it prevents attackers from tricking
 * users into logging into the attacker's account.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Standardized profile data from OAuth providers.
 * Both Google and GitHub return different formats, so we normalize them to this shape.
 */
export interface OAuthProfile {
  id: string; // Provider's unique ID for the user
  email: string; // User's email address
  name: string; // Display name (we'll use this as the username base)
  picture?: string; // Profile picture URL (optional)
}

/**
 * Internal type for tracking state tokens with their creation time.
 */
interface StateEntry {
  createdAt: number; // Unix timestamp when the state was created
}

// ============================================================================
// Configuration
// ============================================================================

// Get API base URL from environment (used for OAuth redirect URIs)
const API_BASE_URL = Bun.env.API_BASE_URL || 'http://localhost:3001';

// OAuth credentials from environment variables
const GOOGLE_CLIENT_ID = Bun.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = Bun.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = Bun.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = Bun.env.GITHUB_CLIENT_SECRET;

// State token expiry time (10 minutes in milliseconds)
const STATE_EXPIRY_MS = 10 * 60 * 1000;

// Cleanup interval for expired states (5 minutes)
const STATE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// State Management (CSRF Protection)
// ============================================================================

/**
 * In-memory storage for OAuth state tokens.
 *
 * Why do we need this?
 * When we redirect users to Google/GitHub, an attacker could try to redirect
 * a victim to our callback URL with the attacker's code. This would log the
 * victim into the attacker's account (called a "login CSRF" attack).
 *
 * To prevent this, we:
 * 1. Generate a random "state" token before redirecting
 * 2. Store it here with a timestamp
 * 3. Include it in the redirect URL to Google/GitHub
 * 4. When we get the callback, verify the state matches what we stored
 *
 * This proves the callback is from a flow we initiated, not an attacker.
 */
const stateStore = new Map<string, StateEntry>();

/**
 * Generate a cryptographically random state token for CSRF protection.
 * Returns the state string that should be included in the OAuth redirect URL.
 */
export function generateState(): string {
  // crypto.randomUUID() generates a cryptographically secure random UUID
  // This is built into modern JavaScript runtimes (including Bun)
  const state = crypto.randomUUID();

  stateStore.set(state, {
    createdAt: Date.now(),
  });

  return state;
}

/**
 * Validate a state token from an OAuth callback.
 * Returns true if the state is valid, false otherwise.
 *
 * This function:
 * 1. Checks if the state exists in our store
 * 2. Checks if it hasn't expired (10 minute limit)
 * 3. Deletes the state after use (one-time use)
 */
export function validateState(state: string): boolean {
  const entry = stateStore.get(state);

  if (!entry) {
    // State doesn't exist - either invalid or already used
    return false;
  }

  // Delete immediately (one-time use, prevents replay attacks)
  stateStore.delete(state);

  // Check if expired
  const ageMs = Date.now() - entry.createdAt;
  if (ageMs > STATE_EXPIRY_MS) {
    return false;
  }

  return true;
}

/**
 * Clean up expired state tokens to prevent memory leaks.
 * Called automatically every 5 minutes.
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [state, entry] of stateStore.entries()) {
    if (now - entry.createdAt > STATE_EXPIRY_MS) {
      stateStore.delete(state);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[OAuth] Cleaned up ${cleanedCount} expired state tokens`);
  }
}

// Start the cleanup interval
// setInterval returns a timer that we don't need to store since it runs forever
setInterval(cleanupExpiredStates, STATE_CLEANUP_INTERVAL_MS);

// ============================================================================
// Google OAuth
// ============================================================================

/**
 * Google OAuth endpoints:
 * - Authorization: Where we redirect users to log in
 * - Token: Where we exchange the code for an access token
 * - UserInfo: Where we fetch the user's profile data
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

/**
 * Build the URL to redirect users to for Google login.
 *
 * @param state - CSRF protection token (from generateState())
 * @returns The full Google authorization URL
 */
export function getGoogleAuthUrl(state: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${API_BASE_URL}/api/auth/google/callback`,
    response_type: 'code', // We want an authorization code
    scope: 'openid email profile', // What data we want access to
    state, // Our CSRF protection token
    access_type: 'offline', // Request refresh token (for future use)
    prompt: 'select_account', // Always show account selector
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 *
 * After the user logs in on Google, they're redirected back with a "code".
 * This code is short-lived and can only be used once. We exchange it for
 * an access token that lets us fetch the user's profile.
 *
 * @param code - The authorization code from the callback
 * @returns The access token
 */
export async function exchangeGoogleCode(code: string): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth is not configured');
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${API_BASE_URL}/api/auth/google/callback`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] Google token exchange failed:', errorText);
      throw new Error('Failed to exchange Google authorization code');
    }

    const data = (await response.json()) as { access_token: string };

    if (!data.access_token) {
      console.error('[OAuth] Google token response missing access_token');
      throw new Error('Failed to obtain Google access token');
    }

    return data.access_token;
  } catch (error) {
    // Log the actual error for debugging but don't expose details to clients
    console.error('[OAuth] Google code exchange error:', error);
    throw new Error('Failed to authenticate with Google');
  }
}

/**
 * Fetch the user's profile from Google using an access token.
 *
 * @param accessToken - The access token from exchangeGoogleCode()
 * @returns Normalized OAuth profile
 */
export async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] Google profile fetch failed:', errorText);
      throw new Error('Failed to fetch Google profile');
    }

    const data = (await response.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Normalize to our standard profile format
    return {
      id: data.id,
      email: data.email,
      name: data.name || data.email.split('@')[0], // Fall back to email prefix if no name
      picture: data.picture,
    };
  } catch (error) {
    console.error('[OAuth] Google profile fetch error:', error);
    throw new Error('Failed to fetch Google profile');
  }
}

// ============================================================================
// GitHub OAuth
// ============================================================================

/**
 * GitHub OAuth endpoints:
 * - Authorization: Where we redirect users to log in
 * - Token: Where we exchange the code for an access token
 * - User: Where we fetch the user's profile data
 * - Emails: Where we fetch the user's emails (needed when email is private)
 */
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

/**
 * Build the URL to redirect users to for GitHub login.
 *
 * @param state - CSRF protection token (from generateState())
 * @returns The full GitHub authorization URL
 */
export function getGithubAuthUrl(state: string): string {
  if (!GITHUB_CLIENT_ID) {
    throw new Error('GitHub OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${API_BASE_URL}/api/auth/github/callback`,
    scope: 'read:user user:email', // read:user for profile, user:email for private emails
    state, // Our CSRF protection token
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 *
 * GitHub's token endpoint is similar to Google's, but requires the
 * Accept header to get JSON response instead of form-encoded.
 *
 * @param code - The authorization code from the callback
 * @returns The access token
 */
export async function exchangeGithubCode(code: string): Promise<string> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth is not configured');
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json', // GitHub returns form-encoded by default, we want JSON
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${API_BASE_URL}/api/auth/github/callback`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] GitHub token exchange failed:', errorText);
      throw new Error('Failed to exchange GitHub authorization code');
    }

    const data = (await response.json()) as { access_token?: string; error?: string };

    // GitHub returns errors in the response body with 200 status
    if (data.error || !data.access_token) {
      console.error('[OAuth] GitHub token error:', data.error);
      throw new Error('Failed to obtain GitHub access token');
    }

    return data.access_token;
  } catch (error) {
    console.error('[OAuth] GitHub code exchange error:', error);
    throw new Error('Failed to authenticate with GitHub');
  }
}

/**
 * Fetch the user's profile from GitHub using an access token.
 *
 * Note: GitHub might not include the email in the profile if the user
 * has their email set to private. Use fetchGithubEmail() to get it.
 *
 * @param accessToken - The access token from exchangeGithubCode()
 * @returns Partial OAuth profile (email might be null)
 */
export async function fetchGithubProfile(accessToken: string): Promise<OAuthProfile> {
  try {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json', // Use GitHub API v3
        'User-Agent': 'Chess-Game-App', // GitHub requires User-Agent header
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] GitHub profile fetch failed:', errorText);
      throw new Error('Failed to fetch GitHub profile');
    }

    const data = (await response.json()) as {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
    };

    // If email is not in profile, we need to fetch it separately
    let email = data.email;
    if (!email) {
      email = await fetchGithubEmail(accessToken);
    }

    if (!email) {
      // This shouldn't happen if we have the user:email scope,
      // but handle it gracefully
      console.error('[OAuth] GitHub user has no email available');
      throw new Error('Unable to get email from GitHub');
    }

    // Normalize to our standard profile format
    return {
      id: data.id.toString(), // GitHub uses numeric IDs, convert to string
      email,
      name: data.name || data.login, // Fall back to username if no display name
      picture: data.avatar_url,
    };
  } catch (error) {
    console.error('[OAuth] GitHub profile fetch error:', error);
    throw new Error('Failed to fetch GitHub profile');
  }
}

/**
 * Fetch the user's primary email from GitHub.
 *
 * Why is this separate?
 * GitHub allows users to make their email private. When private, the email
 * field in /user is null. We need to call /user/emails to get the actual
 * email address. We look for the primary, verified email.
 *
 * @param accessToken - The access token from exchangeGithubCode()
 * @returns The user's primary email, or null if not found
 */
export async function fetchGithubEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(GITHUB_EMAILS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Chess-Game-App',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] GitHub emails fetch failed:', errorText);
      return null;
    }

    const emails = (await response.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    // Find the primary verified email
    const primaryEmail = emails.find((e) => e.primary && e.verified);
    if (primaryEmail) {
      return primaryEmail.email;
    }

    // Fall back to any verified email
    const verifiedEmail = emails.find((e) => e.verified);
    if (verifiedEmail) {
      return verifiedEmail.email;
    }

    // Last resort: any email
    if (emails.length > 0) {
      return emails[0].email;
    }

    return null;
  } catch (error) {
    console.error('[OAuth] GitHub emails fetch error:', error);
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Google OAuth is configured.
 * Useful for conditionally showing/hiding the Google login button.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Check if GitHub OAuth is configured.
 * Useful for conditionally showing/hiding the GitHub login button.
 */
export function isGithubConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}
