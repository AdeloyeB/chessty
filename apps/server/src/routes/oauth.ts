/**
 * OAuth Route Handlers
 *
 * These handlers connect the OAuth service to HTTP endpoints, enabling users
 * to log in with Google or GitHub instead of username/password.
 *
 * The OAuth flow works like this:
 * 1. User clicks "Login with Google" on the frontend
 * 2. Frontend redirects to /api/auth/google
 * 3. We generate a state token (for security) and redirect to Google
 * 4. User logs in on Google and approves our app
 * 5. Google redirects to /api/auth/google/callback with a code
 * 6. We exchange the code for an access token
 * 7. We fetch the user's profile from Google
 * 8. We create or find the user in our database
 * 9. We redirect to the frontend with a JWT token (or MFA prompt)
 */

import * as oauthService from '../services/oauth';
import * as authService from '../services/auth';
import { hasMFAEnabled } from '../services/mfa';
import { loginLimiter, getClientIp } from '../services/rateLimit';

// Import generateTempToken for MFA flow (short-lived token that can only be used for MFA verification)

// ============================================================================
// Configuration
// ============================================================================

// The frontend URL where we redirect after OAuth completes
const FRONTEND_URL = process.env.CORS_ORIGIN || 'http://localhost:3000';
const CALLBACK_PATH = '/auth/callback';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract request context (IP, user agent) for security tracking.
 * This is used when creating sessions to track where logins come from.
 */
function getRequestContext(req: Request): authService.LoginContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

/**
 * Create a redirect response to the frontend with query parameters.
 * Used for both success (with token) and error cases.
 *
 * @param params - Query parameters to include in the redirect URL
 * @returns A 302 redirect response
 */
function redirectToFrontend(params: Record<string, string>): Response {
  const url = new URL(CALLBACK_PATH, FRONTEND_URL);

  // Add each parameter to the URL
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return Response.redirect(url.toString(), 302);
}

// ============================================================================
// Google OAuth Routes
// ============================================================================

/**
 * GET /api/auth/google
 *
 * Initiates the Google OAuth flow by redirecting the user to Google's
 * authorization page. We include a state token for CSRF protection.
 *
 * Flow:
 * 1. Generate a random state token and store it
 * 2. Build the Google authorization URL with our client ID, redirect URI, etc.
 * 3. Redirect the user to Google
 */
export async function handleGoogleAuth(req: Request): Promise<Response> {
  try {
    // Check if Google OAuth is configured
    if (!oauthService.isGoogleConfigured()) {
      console.error('[OAuth] Google OAuth not configured');
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Generate a state token for CSRF protection
    const state = oauthService.generateState();

    // Get the Google authorization URL
    const authUrl = oauthService.getGoogleAuthUrl(state);

    // Redirect to Google
    return Response.redirect(authUrl, 302);
  } catch (error) {
    console.error('[OAuth] Error initiating Google auth:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

/**
 * GET /api/auth/google/callback
 *
 * Handles the callback from Google after the user authorizes our app.
 * This is where the actual authentication happens.
 *
 * Flow:
 * 1. Validate the state parameter (CSRF protection)
 * 2. Apply rate limiting
 * 3. Exchange the authorization code for an access token
 * 4. Fetch the user's profile from Google
 * 5. Find or create the user in our database
 * 6. Check if user has MFA enabled
 * 7. Redirect to frontend with token (or MFA prompt)
 */
export async function handleGoogleCallback(req: Request): Promise<Response> {
  const context = getRequestContext(req);
  const url = new URL(req.url);

  // Extract query parameters from the callback URL
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Check for errors from Google (e.g., user denied access)
  if (error) {
    console.error('[OAuth] Google returned error:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('[OAuth] Missing code or state in Google callback');
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate the state token (CSRF protection)
  if (!oauthService.validateState(state)) {
    console.error('[OAuth] Invalid state token in Google callback');
    return redirectToFrontend({ error: 'invalid_state' });
  }

  // Apply rate limiting (same as login)
  const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    console.error('[OAuth] Rate limited in Google callback');
    return redirectToFrontend({ error: 'rate_limited' });
  }

  try {
    // Exchange the authorization code for an access token
    const accessToken = await oauthService.exchangeGoogleCode(code);

    // Fetch the user's profile from Google
    const profile = await oauthService.fetchGoogleProfile(accessToken);

    // Find or create the user in our database
    const { user, token } = await authService.findOrCreateOAuthUser(
      'google',
      profile.id,
      profile.email,
      profile.name,
      context
    );

    // Reset rate limiter on successful authentication
    loginLimiter.reset(context.ipAddress || 'unknown');

    // Check if user has MFA enabled
    const mfaEnabled = await hasMFAEnabled(user.id);

    if (mfaEnabled) {
      // User has MFA enabled - they need to verify before getting a full token
      // Generate a temporary token that can only be used for MFA verification
      // SECURITY: Use generateTempToken, NOT the full session token
      const tempToken = await authService.generateTempToken(user.id);
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: tempToken,
      });
    }

    // No MFA - redirect with the full token
    return redirectToFrontend({ token });
  } catch (error) {
    console.error('[OAuth] Error in Google callback:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

// ============================================================================
// GitHub OAuth Routes
// ============================================================================

/**
 * GET /api/auth/github
 *
 * Initiates the GitHub OAuth flow by redirecting the user to GitHub's
 * authorization page. We include a state token for CSRF protection.
 *
 * Flow:
 * 1. Generate a random state token and store it
 * 2. Build the GitHub authorization URL with our client ID, redirect URI, etc.
 * 3. Redirect the user to GitHub
 */
export async function handleGithubAuth(req: Request): Promise<Response> {
  try {
    // Check if GitHub OAuth is configured
    if (!oauthService.isGithubConfigured()) {
      console.error('[OAuth] GitHub OAuth not configured');
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Generate a state token for CSRF protection
    const state = oauthService.generateState();

    // Get the GitHub authorization URL
    const authUrl = oauthService.getGithubAuthUrl(state);

    // Redirect to GitHub
    return Response.redirect(authUrl, 302);
  } catch (error) {
    console.error('[OAuth] Error initiating GitHub auth:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

/**
 * GET /api/auth/github/callback
 *
 * Handles the callback from GitHub after the user authorizes our app.
 * This is where the actual authentication happens.
 *
 * Flow:
 * 1. Validate the state parameter (CSRF protection)
 * 2. Apply rate limiting
 * 3. Exchange the authorization code for an access token
 * 4. Fetch the user's profile from GitHub
 * 5. Find or create the user in our database
 * 6. Check if user has MFA enabled
 * 7. Redirect to frontend with token (or MFA prompt)
 */
export async function handleGithubCallback(req: Request): Promise<Response> {
  const context = getRequestContext(req);
  const url = new URL(req.url);

  // Extract query parameters from the callback URL
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Check for errors from GitHub (e.g., user denied access)
  if (error) {
    console.error('[OAuth] GitHub returned error:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('[OAuth] Missing code or state in GitHub callback');
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate the state token (CSRF protection)
  if (!oauthService.validateState(state)) {
    console.error('[OAuth] Invalid state token in GitHub callback');
    return redirectToFrontend({ error: 'invalid_state' });
  }

  // Apply rate limiting (same as login)
  const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    console.error('[OAuth] Rate limited in GitHub callback');
    return redirectToFrontend({ error: 'rate_limited' });
  }

  try {
    // Exchange the authorization code for an access token
    const accessToken = await oauthService.exchangeGithubCode(code);

    // Fetch the user's profile from GitHub
    const profile = await oauthService.fetchGithubProfile(accessToken);

    // Find or create the user in our database
    const { user, token } = await authService.findOrCreateOAuthUser(
      'github',
      profile.id,
      profile.email,
      profile.name,
      context
    );

    // Reset rate limiter on successful authentication
    loginLimiter.reset(context.ipAddress || 'unknown');

    // Check if user has MFA enabled
    const mfaEnabled = await hasMFAEnabled(user.id);

    if (mfaEnabled) {
      // User has MFA enabled - they need to verify before getting a full token
      // SECURITY: Use generateTempToken, NOT the full session token
      const tempToken = await authService.generateTempToken(user.id);
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: tempToken,
      });
    }

    // No MFA - redirect with the full token
    return redirectToFrontend({ token });
  } catch (error) {
    console.error('[OAuth] Error in GitHub callback:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

// ============================================================================
// Twitter/X OAuth Routes
// ============================================================================

/**
 * GET /api/auth/twitter
 *
 * Initiates the Twitter OAuth 2.0 flow with PKCE by redirecting the user to
 * Twitter's authorization page.
 *
 * What's different about Twitter?
 * Twitter uses OAuth 2.0 with PKCE (Proof Key for Code Exchange). This adds
 * an extra layer of security by requiring us to prove that the same client
 * that started the OAuth flow is the one completing it.
 *
 * Flow:
 * 1. Generate a random code verifier (a secret string)
 * 2. Hash the verifier to create a code challenge
 * 3. Generate a state token and store it WITH the code verifier
 * 4. Build the Twitter authorization URL with the challenge
 * 5. Redirect the user to Twitter
 */
export async function handleTwitterAuth(req: Request): Promise<Response> {
  try {
    // Check if Twitter OAuth is configured
    if (!oauthService.isTwitterConfigured()) {
      console.error('[OAuth] Twitter OAuth not configured');
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Generate PKCE code verifier and challenge
    const codeVerifier = oauthService.generateCodeVerifier();
    const codeChallenge = await oauthService.generateCodeChallenge(codeVerifier);

    // Generate a state token and store it WITH the code verifier
    // We need the verifier later to exchange the code for a token
    const state = oauthService.generateState(codeVerifier);

    // Get the Twitter authorization URL
    const authUrl = oauthService.getTwitterAuthUrl(state, codeChallenge);

    // Redirect to Twitter
    return Response.redirect(authUrl, 302);
  } catch (error) {
    console.error('[OAuth] Error initiating Twitter auth:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

/**
 * GET /api/auth/twitter/callback
 *
 * Handles the callback from Twitter after the user authorizes our app.
 * This is where the actual authentication happens.
 *
 * Flow:
 * 1. Validate the state parameter and retrieve the code verifier
 * 2. Apply rate limiting
 * 3. Exchange the authorization code for an access token (using the verifier)
 * 4. Fetch the user's profile from Twitter
 * 5. Find or create the user in our database
 * 6. Check if user has MFA enabled
 * 7. Redirect to frontend with token (or MFA prompt)
 *
 * Note: Twitter API v2 doesn't return email without elevated access.
 * We use a placeholder email (username@twitter.user) that can be updated later.
 */
export async function handleTwitterCallback(req: Request): Promise<Response> {
  const context = getRequestContext(req);
  const url = new URL(req.url);

  // Extract query parameters from the callback URL
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Check for errors from Twitter (e.g., user denied access)
  if (error) {
    console.error('[OAuth] Twitter returned error:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('[OAuth] Missing code or state in Twitter callback');
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Validate the state token AND get the code verifier
  // We need the verifier to exchange the code for a token
  const stateEntry = oauthService.validateStateAndGetEntry(state);
  if (!stateEntry) {
    console.error('[OAuth] Invalid state token in Twitter callback');
    return redirectToFrontend({ error: 'invalid_state' });
  }

  if (!stateEntry.codeVerifier) {
    console.error('[OAuth] Missing code verifier in Twitter callback');
    return redirectToFrontend({ error: 'auth_failed' });
  }

  // Apply rate limiting (same as login)
  const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    console.error('[OAuth] Rate limited in Twitter callback');
    return redirectToFrontend({ error: 'rate_limited' });
  }

  try {
    // Exchange the authorization code for an access token
    // PKCE requires us to send the original code verifier here
    const accessToken = await oauthService.exchangeTwitterCode(code, stateEntry.codeVerifier);

    // Fetch the user's profile from Twitter
    const profile = await oauthService.fetchTwitterProfile(accessToken);

    // Find or create the user in our database
    // Note: Twitter uses a placeholder email since the API doesn't return email
    // without elevated access
    const { user, token } = await authService.findOrCreateOAuthUser(
      'twitter',
      profile.id,
      profile.email,
      profile.name,
      context
    );

    // Reset rate limiter on successful authentication
    loginLimiter.reset(context.ipAddress || 'unknown');

    // Check if user has MFA enabled
    const mfaEnabled = await hasMFAEnabled(user.id);

    if (mfaEnabled) {
      // User has MFA enabled - they need to verify before getting a full token
      // SECURITY: Use generateTempToken, NOT the full session token
      const tempToken = await authService.generateTempToken(user.id);
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: tempToken,
      });
    }

    // No MFA - redirect with the full token
    return redirectToFrontend({ token });
  } catch (error) {
    console.error('[OAuth] Error in Twitter callback:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

// ============================================================================
// Apple Sign In OAuth Routes
// ============================================================================

/**
 * GET /api/auth/apple
 *
 * Initiates the Apple Sign In OAuth flow by redirecting the user to Apple's
 * authorization page.
 *
 * What's different about Apple?
 * - Apple uses `response_mode: form_post`, meaning the callback will be a POST
 *   request with form data instead of GET query parameters.
 * - Apple's client_secret is a JWT we generate and sign with our private key.
 * - User info comes in the id_token JWT, not from a separate API call.
 *
 * Flow:
 * 1. Generate a random state token and store it
 * 2. Build the Apple authorization URL
 * 3. Redirect the user to Apple
 */
export async function handleAppleAuth(req: Request): Promise<Response> {
  try {
    // Check if Apple Sign In is configured
    if (!oauthService.isAppleConfigured()) {
      console.error('[OAuth] Apple Sign In not configured');
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Generate a state token for CSRF protection
    const state = oauthService.generateState();

    // Get the Apple authorization URL
    const authUrl = oauthService.getAppleAuthUrl(state);

    // Redirect to Apple
    return Response.redirect(authUrl, 302);
  } catch (error) {
    console.error('[OAuth] Error initiating Apple auth:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}

/**
 * POST /api/auth/apple/callback
 *
 * Handles the callback from Apple after the user authorizes our app.
 *
 * Important: Apple uses `response_mode: form_post`, so this is a POST request
 * with form-encoded data in the body, NOT a GET request with query parameters
 * like other OAuth providers.
 *
 * The form data contains:
 * - code: The authorization code to exchange for tokens
 * - state: Our CSRF protection token
 * - id_token: A JWT containing user info (always present)
 * - user: A JSON string with user's name (ONLY on first authorization!)
 *
 * Flow:
 * 1. Parse the form data from the POST body
 * 2. Validate the state parameter (CSRF protection)
 * 3. Apply rate limiting
 * 4. Exchange the authorization code for tokens
 * 5. Decode the id_token to get user info
 * 6. Capture the user's name if present (first auth only!)
 * 7. Find or create the user in our database
 * 8. Check if user has MFA enabled
 * 9. Redirect to frontend with token (or MFA prompt)
 */
export async function handleAppleCallback(req: Request): Promise<Response> {
  const context = getRequestContext(req);

  try {
    // Parse form data from POST body
    const formData = await req.formData();

    // Extract fields from form data
    const code = formData.get('code') as string | null;
    const state = formData.get('state') as string | null;
    const idTokenFromCallback = formData.get('id_token') as string | null;
    const userJson = formData.get('user') as string | null; // Only present on FIRST auth!
    const error = formData.get('error') as string | null;

    // Check for errors from Apple (e.g., user denied access)
    if (error) {
      console.error('[OAuth] Apple returned error:', error);
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('[OAuth] Missing code or state in Apple callback');
      return redirectToFrontend({ error: 'auth_failed' });
    }

    // Validate the state token (CSRF protection)
    if (!oauthService.validateState(state)) {
      console.error('[OAuth] Invalid state token in Apple callback');
      return redirectToFrontend({ error: 'invalid_state' });
    }

    // Apply rate limiting (same as login)
    const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
    if (!rateLimitResult.allowed) {
      console.error('[OAuth] Rate limited in Apple callback');
      return redirectToFrontend({ error: 'rate_limited' });
    }

    // Exchange the authorization code for tokens
    const { idToken } = await oauthService.exchangeAppleCode(code);

    // Decode the id_token to get user info
    const payload = oauthService.decodeAppleIdToken(idToken);

    // Get user's name from the 'user' field if present (first auth only!)
    // Apple only sends this on the FIRST authorization, so we must capture it now
    let userName = payload.sub; // Default to Apple user ID
    if (userJson) {
      try {
        const userData = JSON.parse(userJson) as {
          name?: { firstName?: string; lastName?: string };
        };
        if (userData.name) {
          const firstName = userData.name.firstName || '';
          const lastName = userData.name.lastName || '';
          userName = `${firstName} ${lastName}`.trim() || payload.sub;
        }
      } catch (parseError) {
        console.error('[OAuth] Failed to parse Apple user data:', parseError);
        // Continue with default name
      }
    }

    // Get email from the id_token
    const email = payload.email || `${payload.sub}@privaterelay.appleid.com`;

    // Find or create the user in our database
    const { user, token } = await authService.findOrCreateOAuthUser(
      'apple',
      payload.sub, // Apple's unique user ID
      email,
      userName,
      context
    );

    // Reset rate limiter on successful authentication
    loginLimiter.reset(context.ipAddress || 'unknown');

    // Check if user has MFA enabled
    const mfaEnabled = await hasMFAEnabled(user.id);

    if (mfaEnabled) {
      // User has MFA enabled - they need to verify before getting a full token
      // SECURITY: Use generateTempToken, NOT the full session token
      const tempToken = await authService.generateTempToken(user.id);
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: tempToken,
      });
    }

    // No MFA - redirect with the full token
    return redirectToFrontend({ token });
  } catch (error) {
    console.error('[OAuth] Error in Apple callback:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}
