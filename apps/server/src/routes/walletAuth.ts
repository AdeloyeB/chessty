/**
 * Wallet Authentication Route Handlers (SIWE - Sign-In with Ethereum)
 *
 * These handlers connect the wallet auth service to HTTP endpoints, enabling users
 * to log in with their Ethereum wallet using the SIWE (EIP-4361) standard.
 *
 * The SIWE flow works like this:
 * 1. User clicks "Sign In with Wallet" on the frontend
 * 2. Frontend calls POST /api/auth/wallet/nonce to get a challenge
 * 3. User signs the SIWE message with their wallet (MetaMask, etc.)
 * 4. Frontend calls POST /api/auth/wallet/verify with the signature
 * 5. We verify the signature and create/login the user
 * 6. If user is new and has no displayName, we return needsDisplayName: true
 * 7. Frontend redirects to profile setup if needed, then to dashboard
 *
 * Security features:
 * - Nonces expire after 5 minutes (prevents replay attacks)
 * - One-time use nonces (deleted after verification attempt)
 * - Rate limiting on verify endpoint (same as login)
 * - MFA support for existing accounts
 */

import {
  generateWalletNonce,
  validateWalletNonce,
  extractNonceFromMessage,
  extractAddressFromMessage,
  verifySiweSignature,
  findOrCreateWalletUser,
  linkWalletToUser,
  setDisplayName,
  isDisplayNameAvailable,
} from '../services/walletAuth';
import { generateTempToken, verifyToken, type LoginContext } from '../services/auth';
import { hasMFAEnabled } from '../services/mfa';
import { loginLimiter, getClientIp } from '../services/rateLimit';
import { toPublicUser } from '../services/auth';

// ============================================================================
// Configuration
// ============================================================================

// The frontend URL where we redirect after wallet auth (for consistency with OAuth)
const _FRONTEND_URL = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract request context (IP, user agent) for security tracking.
 * This is used when creating sessions to track where logins come from.
 */
function getRequestContext(req: Request): LoginContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

/**
 * Get Authorization header token from request.
 * Used for authenticated endpoints like /link and /display-name.
 */
function getAuthToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// ============================================================================
// Nonce Endpoint
// ============================================================================

/**
 * POST /api/auth/wallet/nonce
 *
 * Generates a random nonce for SIWE message signing.
 *
 * The nonce is a unique identifier that:
 * - Prevents replay attacks (can't reuse old signatures)
 * - Expires after 5 minutes
 * - Can only be used once
 *
 * Request body:
 * - address: The wallet address requesting a nonce
 *
 * Response:
 * - success: boolean
 * - data: { nonce: string }
 */
export async function handleWalletNonce(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.address !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Address is required' },
        },
        { status: 400 }
      );
    }

    // Generate a nonce for this signing session
    const nonce = generateWalletNonce();

    return Response.json({
      success: true,
      data: { nonce },
    });
  } catch (error) {
    console.error('[WalletAuth] Error generating nonce:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to generate nonce' },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Verify Endpoint
// ============================================================================

/**
 * POST /api/auth/wallet/verify
 *
 * Verifies a SIWE signature and authenticates the user.
 *
 * This is the main authentication endpoint for wallet users. It:
 * 1. Validates the nonce from the SIWE message
 * 2. Verifies the signature matches the address
 * 3. Creates a new user or finds existing one
 * 4. Checks for MFA (if existing user)
 * 5. Returns JWT token and user info
 *
 * Request body:
 * - message: The SIWE message that was signed
 * - signature: The wallet signature (hex string starting with 0x)
 * - address: The wallet address
 *
 * Response:
 * - success: boolean
 * - data: { user, token, isNewUser, needsDisplayName?, requiresMfa?, tempToken? }
 */
export async function handleWalletVerify(req: Request): Promise<Response> {
  const context = getRequestContext(req);

  // Apply rate limiting (same as login)
  const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
        },
      },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    // Validate request body
    if (
      !body ||
      typeof body.message !== 'string' ||
      typeof body.signature !== 'string' ||
      typeof body.address !== 'string'
    ) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Message, signature, and address are required' },
        },
        { status: 400 }
      );
    }

    const { message, signature, address } = body;

    // Ensure signature starts with 0x
    const normalizedSignature = signature.startsWith('0x')
      ? (signature as `0x${string}`)
      : (`0x${signature}` as `0x${string}`);

    // Extract and validate the nonce from the message
    const nonce = extractNonceFromMessage(message);
    if (!nonce) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_MESSAGE', message: 'Could not extract nonce from message' },
        },
        { status: 400 }
      );
    }

    // Validate the nonce (one-time use, expires after 5 minutes)
    if (!validateWalletNonce(nonce)) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_NONCE', message: 'Nonce is invalid or expired' },
        },
        { status: 400 }
      );
    }

    // Extract address from message and verify it matches the claimed address
    const messageAddress = extractAddressFromMessage(message);
    if (!messageAddress) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_MESSAGE', message: 'Could not extract address from message' },
        },
        { status: 400 }
      );
    }

    // Ensure the address in the SIWE message matches the claimed address
    // (case-insensitive since Ethereum addresses are hex and 0xABC === 0xabc)
    if (messageAddress.toLowerCase() !== address.toLowerCase()) {
      return Response.json(
        {
          success: false,
          error: { code: 'ADDRESS_MISMATCH', message: 'Message address does not match claimed address' },
        },
        { status: 400 }
      );
    }

    // Verify signature matches the address
    const isValid = await verifySiweSignature({
      message,
      signature: normalizedSignature,
      address,
    });

    if (!isValid) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
        },
        { status: 401 }
      );
    }

    // Signature is valid - find or create user
    const { user, token, isNewUser } = await findOrCreateWalletUser(address, context);

    // Reset rate limiter on successful authentication
    loginLimiter.reset(context.ipAddress || 'unknown');

    // Check if user has MFA enabled (existing users only)
    if (!isNewUser) {
      const mfaEnabled = await hasMFAEnabled(user.id);
      if (mfaEnabled) {
        // User has MFA enabled - return temp token for MFA verification
        const tempToken = await generateTempToken(user.id);
        return Response.json({
          success: true,
          data: {
            requiresMfa: true,
            tempToken,
          },
        });
      }
    }

    // Check if user needs to set a display name
    const needsDisplayName = !user.displayName;

    // Return success with user info and token
    return Response.json({
      success: true,
      data: {
        user: {
          ...toPublicUser(user),
          email: user.email,
          balance: user.balance,
          walletAddress: user.walletAddress,
        },
        token,
        isNewUser,
        needsDisplayName,
      },
    });
  } catch (error) {
    console.error('[WalletAuth] Error verifying wallet:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Wallet verification failed' },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Link Wallet Endpoint
// ============================================================================

/**
 * POST /api/auth/wallet/link
 *
 * Links a wallet to an existing user account.
 * Requires authentication (JWT token).
 *
 * This allows users who signed up with email/OAuth to add wallet authentication.
 *
 * Request body:
 * - message: The SIWE message that was signed
 * - signature: The wallet signature
 * - address: The wallet address to link
 *
 * Response:
 * - success: boolean
 * - data: { user }
 */
export async function handleWalletLink(req: Request): Promise<Response> {
  const _context = getRequestContext(req);

  // Verify authentication
  const token = getAuthToken(req);
  if (!token) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 }
    );
  }

  const authPayload = await verifyToken(token);
  if (!authPayload) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    // Validate request body
    if (
      !body ||
      typeof body.message !== 'string' ||
      typeof body.signature !== 'string' ||
      typeof body.address !== 'string'
    ) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Message, signature, and address are required' },
        },
        { status: 400 }
      );
    }

    const { message, signature, address } = body;

    // Ensure signature starts with 0x
    const normalizedSignature = signature.startsWith('0x')
      ? (signature as `0x${string}`)
      : (`0x${signature}` as `0x${string}`);

    // Extract and validate the nonce from the message
    const nonce = extractNonceFromMessage(message);
    if (!nonce || !validateWalletNonce(nonce)) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_NONCE', message: 'Nonce is invalid or expired' },
        },
        { status: 400 }
      );
    }

    // Verify signature matches the address
    const isValid = await verifySiweSignature({
      message,
      signature: normalizedSignature,
      address,
    });

    if (!isValid) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
        },
        { status: 401 }
      );
    }

    // Link the wallet to the authenticated user
    const updatedUser = await linkWalletToUser(authPayload.userId, address);

    return Response.json({
      success: true,
      data: {
        user: {
          ...toPublicUser(updatedUser),
          email: updatedUser.email,
          balance: updatedUser.balance,
          walletAddress: updatedUser.walletAddress,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to link wallet';
    console.error('[WalletAuth] Error linking wallet:', error);

    // Return user-friendly error for known cases
    if (errorMessage.includes('already linked')) {
      return Response.json(
        {
          success: false,
          error: { code: 'WALLET_ALREADY_LINKED', message: errorMessage },
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to link wallet' },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Display Name Endpoints
// ============================================================================

/**
 * POST /api/auth/wallet/display-name
 *
 * Sets the display name for the authenticated user.
 * This is required for new wallet users before they can play games.
 *
 * Request body:
 * - displayName: The desired display name (3-20 chars, alphanumeric + _-)
 *
 * Response:
 * - success: boolean
 * - data: { user }
 */
export async function handleSetDisplayName(req: Request): Promise<Response> {
  // Verify authentication
  const token = getAuthToken(req);
  if (!token) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 }
    );
  }

  const authPayload = await verifyToken(token);
  if (!authPayload) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.displayName !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Display name is required' },
        },
        { status: 400 }
      );
    }

    const { displayName } = body;

    // Set the display name (validates format and uniqueness)
    const updatedUser = await setDisplayName(authPayload.userId, displayName);

    return Response.json({
      success: true,
      data: {
        user: {
          ...toPublicUser(updatedUser),
          email: updatedUser.email,
          balance: updatedUser.balance,
          walletAddress: updatedUser.walletAddress,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to set display name';
    console.error('[WalletAuth] Error setting display name:', error);

    // Return user-friendly error for known validation cases
    if (
      errorMessage.includes('at least 3') ||
      errorMessage.includes('at most 20') ||
      errorMessage.includes('can only contain') ||
      errorMessage.includes('already taken')
    ) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errorMessage },
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to set display name' },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/wallet/display-name/check?name=<displayName>
 *
 * Checks if a display name is available.
 * This is a public endpoint (no auth required) for real-time validation.
 *
 * Query params:
 * - name: The display name to check
 *
 * Response:
 * - success: boolean
 * - data: { available: boolean, valid: boolean, error?: string }
 */
export async function handleCheckDisplayName(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const displayName = url.searchParams.get('name');

    if (!displayName) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Display name is required' },
        },
        { status: 400 }
      );
    }

    // Check availability (this also validates format)
    const available = await isDisplayNameAvailable(displayName);

    // Determine if the format is valid (separate from availability)
    const trimmed = displayName.trim();
    let valid = true;
    let validationError: string | undefined;

    if (trimmed.length < 3) {
      valid = false;
      validationError = 'Display name must be at least 3 characters';
    } else if (trimmed.length > 20) {
      valid = false;
      validationError = 'Display name must be at most 20 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      valid = false;
      validationError = 'Display name can only contain letters, numbers, underscores, and hyphens';
    }

    return Response.json({
      success: true,
      data: {
        available: valid && available,
        valid,
        error: validationError,
      },
    });
  } catch (error) {
    console.error('[WalletAuth] Error checking display name:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to check display name' },
      },
      { status: 500 }
    );
  }
}
