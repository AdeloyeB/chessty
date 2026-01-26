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
 * For Twitter OAuth 2.0, we also store a codeVerifier for PKCE.
 */
interface StateEntry {
  createdAt: number; // Unix timestamp when the state was created
  codeVerifier?: string; // For Twitter OAuth 2.0 PKCE flow
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
const TWITTER_CLIENT_ID = Bun.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = Bun.env.TWITTER_CLIENT_SECRET;

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
 *
 * For Twitter OAuth 2.0, we also store a codeVerifier for PKCE (Proof Key for
 * Code Exchange). PKCE adds an extra layer of security by proving that the
 * same client that started the flow is the one completing it.
 */
const stateStore = new Map<string, StateEntry>();

/**
 * Generate a cryptographically random state token for CSRF protection.
 * Returns the state string that should be included in the OAuth redirect URL.
 *
 * @param codeVerifier - Optional PKCE code verifier for Twitter OAuth 2.0
 */
export function generateState(codeVerifier?: string): string {
  // crypto.randomUUID() generates a cryptographically secure random UUID
  // This is built into modern JavaScript runtimes (including Bun)
  const state = crypto.randomUUID();

  stateStore.set(state, {
    createdAt: Date.now(),
    codeVerifier,
  });

  return state;
}

/**
 * Validate a state token from an OAuth callback.
 * Returns the state entry if valid, null otherwise.
 *
 * This function:
 * 1. Checks if the state exists in our store
 * 2. Checks if it hasn't expired (10 minute limit)
 * 3. Deletes the state after use (one-time use)
 *
 * Returns the StateEntry so callers can access the codeVerifier for Twitter PKCE.
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
 * Validate a state token and return the full entry (including codeVerifier).
 * Used for Twitter OAuth 2.0 PKCE flow where we need the codeVerifier.
 *
 * @param state - The state token from the callback
 * @returns The state entry if valid, null otherwise
 */
export function validateStateAndGetEntry(state: string): StateEntry | null {
  const entry = stateStore.get(state);

  if (!entry) {
    return null;
  }

  // Delete immediately (one-time use, prevents replay attacks)
  stateStore.delete(state);

  // Check if expired
  const ageMs = Date.now() - entry.createdAt;
  if (ageMs > STATE_EXPIRY_MS) {
    return null;
  }

  return entry;
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
// Twitter OAuth 2.0 (with PKCE)
// ============================================================================

/**
 * Twitter OAuth 2.0 endpoints:
 * - Authorization: Where we redirect users to log in
 * - Token: Where we exchange the code for an access token
 * - User: Where we fetch the user's profile data
 *
 * What's different about Twitter?
 * Twitter uses OAuth 2.0 with PKCE (Proof Key for Code Exchange). PKCE is a
 * security enhancement designed for public clients (like mobile apps or SPAs)
 * but is now recommended for all OAuth 2.0 flows.
 *
 * PKCE works like this:
 * 1. We generate a random "code verifier" (a secret string)
 * 2. We hash it to create a "code challenge"
 * 3. We send the code challenge to Twitter (not the verifier)
 * 4. When we get the callback, we send the original verifier
 * 5. Twitter hashes it and verifies it matches the challenge
 *
 * This proves that the same client that started the flow is completing it,
 * even if the authorization code was somehow intercepted.
 */
const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_USER_URL = 'https://api.twitter.com/2/users/me';

/**
 * Generate a PKCE code verifier.
 *
 * What is this?
 * A code verifier is a high-entropy random string between 43-128 characters.
 * It's used as the "secret" in PKCE - only the client that generated it
 * should be able to provide it later.
 *
 * @returns A random 64-character URL-safe string
 */
export function generateCodeVerifier(): string {
  // Generate 48 random bytes and convert to base64url
  // 48 bytes = 64 base64 characters (within the 43-128 requirement)
  const randomBytes = crypto.getRandomValues(new Uint8Array(48));
  return base64UrlEncode(randomBytes);
}

/**
 * Generate a PKCE code challenge from a code verifier.
 *
 * What is this?
 * The code challenge is a SHA-256 hash of the code verifier, encoded in base64url.
 * We send this to Twitter, but NOT the verifier itself. Later, when exchanging
 * the code, we send the original verifier and Twitter verifies it matches.
 *
 * @param verifier - The code verifier to hash
 * @returns The SHA-256 hash of the verifier in base64url format
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // Hash the verifier using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to base64url
  return base64UrlEncode(new Uint8Array(hashBuffer));
}

/**
 * Encode bytes to base64url format.
 *
 * What is base64url?
 * It's like regular base64 but URL-safe. It replaces '+' with '-' and '/' with '_',
 * and removes padding ('='). This makes it safe to include in URLs without encoding.
 *
 * @param bytes - The bytes to encode
 * @returns The base64url-encoded string
 */
function base64UrlEncode(bytes: Uint8Array): string {
  // Convert to regular base64
  let base64 = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] || 0;
    const c = bytes[i + 2] || 0;

    const triplet = (a << 16) | (b << 8) | c;

    base64 += chars[(triplet >> 18) & 0x3f];
    base64 += chars[(triplet >> 12) & 0x3f];
    base64 += i + 1 < bytes.length ? chars[(triplet >> 6) & 0x3f] : '';
    base64 += i + 2 < bytes.length ? chars[triplet & 0x3f] : '';
  }

  // Convert to base64url (URL-safe variant)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Build the URL to redirect users to for Twitter login.
 *
 * @param state - CSRF protection token (from generateState())
 * @param codeChallenge - PKCE code challenge (hashed verifier)
 * @returns The full Twitter authorization URL
 */
export function getTwitterAuthUrl(state: string, codeChallenge: string): string {
  if (!TWITTER_CLIENT_ID) {
    throw new Error('Twitter OAuth is not configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: `${API_BASE_URL}/api/auth/twitter/callback`,
    scope: 'tweet.read users.read', // Basic read permissions
    state, // Our CSRF protection token
    code_challenge: codeChallenge,
    code_challenge_method: 'S256', // SHA-256 hashing method
  });

  return `${TWITTER_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token using PKCE.
 *
 * Twitter OAuth 2.0 requires:
 * 1. Basic Auth header with client_id:client_secret
 * 2. The code verifier (the original unhashed secret)
 *
 * @param code - The authorization code from the callback
 * @param codeVerifier - The original PKCE code verifier
 * @returns The access token
 */
export async function exchangeTwitterCode(code: string, codeVerifier: string): Promise<string> {
  if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
    throw new Error('Twitter OAuth is not configured');
  }

  try {
    // Twitter requires Basic Auth for the token endpoint
    const credentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${API_BASE_URL}/api/auth/twitter/callback`,
        code_verifier: codeVerifier, // The original verifier, not the hash
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] Twitter token exchange failed:', errorText);
      throw new Error('Failed to exchange Twitter authorization code');
    }

    const data = (await response.json()) as { access_token?: string; error?: string };

    if (data.error || !data.access_token) {
      console.error('[OAuth] Twitter token error:', data.error);
      throw new Error('Failed to obtain Twitter access token');
    }

    return data.access_token;
  } catch (error) {
    console.error('[OAuth] Twitter code exchange error:', error);
    throw new Error('Failed to authenticate with Twitter');
  }
}

/**
 * Fetch the user's profile from Twitter using an access token.
 *
 * Note: Twitter API v2 doesn't return email by default - you need elevated
 * API access (which requires approval from Twitter). For now, we'll generate
 * a placeholder email using the username.
 *
 * @param accessToken - The access token from exchangeTwitterCode()
 * @returns Normalized OAuth profile
 */
export async function fetchTwitterProfile(accessToken: string): Promise<OAuthProfile> {
  try {
    const response = await fetch(TWITTER_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] Twitter profile fetch failed:', errorText);
      throw new Error('Failed to fetch Twitter profile');
    }

    const data = (await response.json()) as {
      data: {
        id: string;
        name: string;
        username: string;
      };
    };

    if (!data.data) {
      console.error('[OAuth] Twitter profile response missing data');
      throw new Error('Invalid Twitter profile response');
    }

    // Twitter API v2 doesn't return email without elevated access
    // We'll use a placeholder email that can be updated later
    // Format: username@twitter.user (clearly indicates it's a placeholder)
    const placeholderEmail = `${data.data.username}@twitter.user`;

    // Normalize to our standard profile format
    return {
      id: data.data.id,
      email: placeholderEmail,
      name: data.data.name || data.data.username,
      // Twitter API v2 doesn't include profile_image_url by default
      // Would need to add 'profile_image_url' to user.fields query param
    };
  } catch (error) {
    console.error('[OAuth] Twitter profile fetch error:', error);
    throw new Error('Failed to fetch Twitter profile');
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

/**
 * Check if Twitter OAuth is configured.
 * Useful for conditionally showing/hiding the Twitter login button.
 */
export function isTwitterConfigured(): boolean {
  return Boolean(TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET);
}

// ============================================================================
// Apple Sign In OAuth
// ============================================================================

/**
 * Apple Sign In OAuth endpoints and configuration.
 *
 * What's different about Apple Sign In?
 * 1. Apple uses `response_mode: form_post` - the callback data comes as a POST
 *    request with form data, not GET query parameters like other providers.
 * 2. Apple requires a client_secret that is a JWT signed with your private key.
 *    This JWT must be regenerated periodically (max 6 months validity).
 * 3. Apple returns user info (name, email) in an `id_token` JWT, not via a
 *    separate API call like Google/GitHub.
 * 4. The user's name is ONLY sent on the FIRST authorization - you must capture
 *    it immediately or it's lost forever.
 *
 * Environment variables needed:
 * - APPLE_CLIENT_ID: Your Services ID (e.g., com.yourapp.auth)
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (10 characters)
 * - APPLE_KEY_ID: Key ID for your Sign In with Apple key
 * - APPLE_PRIVATE_KEY: Contents of the .p8 private key file
 */
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

// Apple OAuth credentials from environment variables
const APPLE_CLIENT_ID = Bun.env.APPLE_CLIENT_ID;
const APPLE_TEAM_ID = Bun.env.APPLE_TEAM_ID;
const APPLE_KEY_ID = Bun.env.APPLE_KEY_ID;
const APPLE_PRIVATE_KEY = Bun.env.APPLE_PRIVATE_KEY;

/**
 * The decoded payload from an Apple ID token.
 * Apple returns user info as a JWT (id_token) rather than via an API endpoint.
 */
export interface AppleIdTokenPayload {
  iss: string; // Issuer: "https://appleid.apple.com"
  sub: string; // Subject: The unique Apple user ID (use this as provider ID)
  aud: string; // Audience: Your client ID
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  email?: string; // User's email (if they shared it)
  email_verified?: string | boolean; // "true" or true if email is verified
  is_private_email?: string | boolean; // "true" if using Apple's relay email
  auth_time: number; // When the user authenticated
  nonce_supported: boolean;
}

/**
 * Check if Apple Sign In is configured.
 * Requires all four environment variables to be set.
 */
export function isAppleConfigured(): boolean {
  return Boolean(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY);
}

/**
 * Generate the Apple client_secret JWT.
 *
 * What is this?
 * Unlike other OAuth providers that use a simple client_secret string, Apple
 * requires a JWT (JSON Web Token) signed with your private key. This proves
 * you own the private key that corresponds to the public key Apple has.
 *
 * The JWT contains:
 * - iss: Your Team ID
 * - iat: When the token was created
 * - exp: When the token expires (max 6 months)
 * - aud: "https://appleid.apple.com" (who this token is for)
 * - sub: Your Client ID (Services ID)
 *
 * @returns A JWT string to use as the client_secret
 */
export async function generateAppleClientSecret(): Promise<string> {
  if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    throw new Error('Apple Sign In is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 60 * 60 * 24 * 180; // 180 days (max allowed by Apple)

  // JWT Header
  const header = {
    alg: 'ES256', // Apple requires ES256 (ECDSA with P-256 and SHA-256)
    kid: APPLE_KEY_ID, // Key ID from Apple Developer
    typ: 'JWT',
  };

  // JWT Payload
  const payload = {
    iss: APPLE_TEAM_ID, // Team ID
    iat: now, // Issued at
    exp: expiry, // Expiration
    aud: 'https://appleid.apple.com', // Audience
    sub: APPLE_CLIENT_ID, // Subject (your Services ID)
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Import the private key and sign
  // Apple's private key is in PKCS#8 PEM format
  const privateKeyPem = APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  // Convert signature from DER format to raw format that JWT expects
  const signatureBytes = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(signatureBytes);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Build the URL to redirect users to for Apple Sign In.
 *
 * @param state - CSRF protection token (from generateState())
 * @returns The full Apple authorization URL
 */
export function getAppleAuthUrl(state: string): string {
  if (!APPLE_CLIENT_ID) {
    throw new Error('Apple Sign In is not configured');
  }

  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: `${API_BASE_URL}/api/auth/apple/callback`,
    response_type: 'code id_token', // We want both the code and the id_token
    response_mode: 'form_post', // Apple sends data as POST form data
    scope: 'name email', // Request name and email
    state, // Our CSRF protection token
  });

  return `${APPLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an Apple authorization code for tokens.
 *
 * Apple returns both an access_token and an id_token. The id_token contains
 * the user's info (email, etc.) and is what we actually need.
 *
 * @param code - The authorization code from the callback
 * @returns Both the access token and id token
 */
export async function exchangeAppleCode(code: string): Promise<{ accessToken: string; idToken: string }> {
  if (!APPLE_CLIENT_ID) {
    throw new Error('Apple Sign In is not configured');
  }

  try {
    // Generate the client secret JWT
    const clientSecret = await generateAppleClientSecret();

    const response = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${API_BASE_URL}/api/auth/apple/callback`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OAuth] Apple token exchange failed:', errorText);
      throw new Error('Failed to exchange Apple authorization code');
    }

    const data = (await response.json()) as {
      access_token?: string;
      id_token?: string;
      error?: string;
    };

    if (data.error || !data.access_token || !data.id_token) {
      console.error('[OAuth] Apple token error:', data.error);
      throw new Error('Failed to obtain Apple tokens');
    }

    return {
      accessToken: data.access_token,
      idToken: data.id_token,
    };
  } catch (error) {
    console.error('[OAuth] Apple code exchange error:', error);
    throw new Error('Failed to authenticate with Apple');
  }
}

/**
 * Decode an Apple ID token to extract user information.
 *
 * What is an ID token?
 * It's a JWT (JSON Web Token) that contains claims about the user's identity.
 * Apple signs this token with their private key, so we can verify it's authentic.
 *
 * Note: For production, you should verify the token signature using Apple's
 * public keys (available at https://appleid.apple.com/auth/keys). For now,
 * we just decode it since it came directly from Apple's token endpoint.
 *
 * @param idToken - The JWT id_token from Apple
 * @returns The decoded payload with user info
 */
export function decodeAppleIdToken(idToken: string): AppleIdTokenPayload {
  try {
    // JWT format: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format');
    }

    // Decode the payload (second part)
    const payloadBase64 = parts[1];
    const payloadJson = base64UrlDecode(payloadBase64);
    const payload = JSON.parse(payloadJson) as AppleIdTokenPayload;

    // Verify basic claims
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new Error('Invalid token issuer');
    }

    if (payload.aud !== APPLE_CLIENT_ID) {
      throw new Error('Invalid token audience');
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token has expired');
    }

    return payload;
  } catch (error) {
    console.error('[OAuth] Failed to decode Apple ID token:', error);
    throw new Error('Invalid Apple ID token');
  }
}

// ============================================================================
// Helper Functions for Apple Sign In
// ============================================================================

/**
 * Encode a JSON object to base64url format (for JWT).
 */
function base64UrlEncodeJson(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncode(bytes);
}

/**
 * Decode a base64url string to a regular string.
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }

  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Convert a PEM-encoded private key to an ArrayBuffer.
 * Apple's private key comes in PKCS#8 PEM format.
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Remove PEM header/footer and whitespace
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
