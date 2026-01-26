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
      // For now, we'll use the same token but flag the frontend to require MFA
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: token,
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
      // Generate a temporary token that can only be used for MFA verification
      // For now, we'll use the same token but flag the frontend to require MFA
      return redirectToFrontend({
        requires_mfa: 'true',
        temp_token: token,
      });
    }

    // No MFA - redirect with the full token
    return redirectToFrontend({ token });
  } catch (error) {
    console.error('[OAuth] Error in GitHub callback:', error);
    return redirectToFrontend({ error: 'auth_failed' });
  }
}
