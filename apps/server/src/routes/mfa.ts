/**
 * MFA (Multi-Factor Authentication) Route Handlers
 *
 * These endpoints handle the lifecycle of MFA for users:
 * - Enrollment: Starting and completing the MFA setup process
 * - Verification: Verifying MFA codes during login (after password is validated)
 * - Management: Checking status, disabling MFA, regenerating backup codes
 *
 * Security notes:
 * - All endpoints except /api/auth/mfa/verify require full authentication
 * - /api/auth/mfa/verify uses a temp token (issued after password validation)
 * - Disabling MFA requires both password AND current TOTP code
 * - Regenerating backup codes requires password verification
 */

import type { ApiResponse } from '@chess-game/shared';
import * as authService from '../services/auth';
import * as mfaService from '../services/mfa';
import {
  mfaVerifyLimiter,
  mfaEnrollLimiter,
  rateLimitResponse,
  getClientIp,
} from '../services/rateLimit';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract and verify the JWT token from the Authorization header
 * Returns the userId if valid, or a Response with an error if not
 */
async function authenticateRequest(
  req: Request
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' },
      } satisfies ApiResponse<never>,
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const payload = await authService.verifyToken(token);

  if (!payload) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      } satisfies ApiResponse<never>,
      { status: 401 }
    );
  }

  return { userId: payload.userId };
}

/**
 * Get request context for logging and session tracking
 */
function getRequestContext(req: Request): authService.LoginContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

// ============================================================================
// Enrollment Endpoints
// ============================================================================

/**
 * POST /api/mfa/enroll/start
 *
 * Start the MFA enrollment process. Generates a TOTP secret and returns
 * a QR code URI that the user can scan with their authenticator app.
 *
 * Requires: Full authentication (Bearer token)
 * Rate limited: 3 attempts per hour per user
 */
export async function handleStartEnrollment(req: Request): Promise<Response> {
  // Authenticate the request
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const { userId } = auth;
  const _clientIp = getClientIp(req); // Reserved for future audit logging

  // Apply enrollment rate limiter (by user ID, not IP)
  const rateLimitResult = mfaEnrollLimiter.consume(userId);
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    // Get user's email for the authenticator app label
    const user = await authService.getUserById(userId);
    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    // Start enrollment
    const result = await mfaService.startEnrollment(userId, user.email ?? user.username);

    if (!result.started) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled for this account' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      data: {
        qrCodeUri: result.uri,
      },
    } satisfies ApiResponse<{ qrCodeUri: string }>);
  } catch (error) {
    console.error('MFA enrollment start error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to start MFA enrollment' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * POST /api/mfa/enroll/complete
 *
 * Complete MFA enrollment by verifying the user can generate valid codes.
 * Returns backup codes that the user should save securely.
 *
 * Body: { code: string } - The 6-digit TOTP code from the authenticator app
 * Requires: Full authentication (Bearer token)
 * Rate limited: 5 attempts per 5 minutes per IP
 */
export async function handleCompleteEnrollment(req: Request): Promise<Response> {
  // Authenticate the request
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const { userId } = auth;
  const _clientIp = getClientIp(req); // Reserved for future audit logging

  // Apply verification rate limiter
  const rateLimitResult = mfaVerifyLimiter.consume(_clientIp);
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    const body = await req.json();
    const { code } = body as { code?: string };

    if (!code || typeof code !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Verification code is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Complete enrollment
    const result = await mfaService.completeEnrollment(userId, code);

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_VERIFICATION_FAILED', message: result.error || 'Invalid verification code' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Reset rate limiter on successful enrollment
    mfaVerifyLimiter.reset(_clientIp);

    return Response.json({
      success: true,
      data: {
        // backupCodes is guaranteed to be present when success is true
        backupCodes: result.backupCodes!,
      },
    } satisfies ApiResponse<{ backupCodes: string[] }>);
  } catch (error) {
    console.error('MFA enrollment complete error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to complete MFA enrollment' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// ============================================================================
// MFA Verification (During Login)
// ============================================================================

/**
 * POST /api/auth/mfa/verify
 *
 * Verify MFA during the login flow. This is called AFTER password verification
 * when MFA is enabled. Uses a temporary token instead of the Authorization header.
 *
 * Body: { tempToken: string, code: string, isBackupCode?: boolean }
 * Note: isBackupCode is a hint but the service will try both automatically
 * Rate limited: 5 attempts per 5 minutes per IP
 */
export async function handleMFAVerify(req: Request): Promise<Response> {
  const clientIp = getClientIp(req);
  const context = getRequestContext(req);

  // Apply verification rate limiter
  const rateLimitResult = mfaVerifyLimiter.consume(clientIp);
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    const body = await req.json();
    const { tempToken, code } = body as { tempToken?: string; code?: string };

    // Validate required fields
    if (!tempToken || typeof tempToken !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Temporary token is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Verification code is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Verify the temp token
    const tempPayload = await authService.verifyTempToken(tempToken);
    if (!tempPayload) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired temporary token' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const { userId } = tempPayload;

    // Verify the MFA code
    const result = await mfaService.verifyMFA(userId, code);

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_VERIFICATION_FAILED', message: result.error || 'Invalid verification code' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // MFA verified! Generate a full session token
    const user = await authService.getUserById(userId);
    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    const token = await authService.generateToken(
      userId,
      context.ipAddress,
      context.userAgent
    );

    // Reset rate limiter on successful verification
    mfaVerifyLimiter.reset(clientIp);

    // Build response with user data (same format as login response)
    const responseData = {
      user: {
        ...authService.toPublicUser(user),
        email: user.email,
        balance: Number(user.balance),
      },
      token,
      // Include a hint if backup code was used (user should regenerate)
      usedBackupCode: result.usedBackupCode,
    };

    return Response.json({
      success: true,
      data: responseData,
    } satisfies ApiResponse<typeof responseData>);
  } catch (error) {
    console.error('MFA verification error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to verify MFA code' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// ============================================================================
// Status & Management Endpoints
// ============================================================================

/**
 * GET /api/mfa/status
 *
 * Get the current MFA status for the authenticated user.
 *
 * Requires: Full authentication (Bearer token)
 */
export async function handleGetStatus(req: Request): Promise<Response> {
  // Authenticate the request
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const { userId } = auth;

  try {
    const status = await mfaService.getMFAStatus(userId);

    return Response.json({
      success: true,
      data: {
        enabled: status.enabled,
        backupCodesRemaining: status.backupCodesRemaining,
      },
    } satisfies ApiResponse<{ enabled: boolean; backupCodesRemaining: number }>);
  } catch (error) {
    console.error('MFA status error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get MFA status' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * POST /api/mfa/disable
 *
 * Disable MFA for the authenticated user. Requires both password and
 * current TOTP code for security (prevents unauthorized disabling).
 *
 * Body: { password: string, code: string }
 * Requires: Full authentication (Bearer token)
 * Rate limited: 5 attempts per 5 minutes per IP
 */
export async function handleDisableMFA(req: Request): Promise<Response> {
  // Authenticate the request
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const { userId } = auth;
  const _clientIp = getClientIp(req); // Reserved for future audit logging

  // Apply verification rate limiter
  const rateLimitResult = mfaVerifyLimiter.consume(_clientIp);
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    const body = await req.json();
    const { password, code } = body as { password?: string; code?: string };

    // Validate required fields
    if (!password || typeof password !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Password is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Verification code is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Get user and verify password
    const user = await authService.getUserById(userId);
    if (!user || !user.passwordHash) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    const passwordValid = await authService.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Verify TOTP code (backup codes NOT accepted for disabling MFA —
    // we need proof the user has their authenticator device, not just a
    // one-time backup code that could have been stolen)
    const totpValid = await mfaService.verifyTOTPOnly(userId, code);
    if (!totpValid) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_VERIFICATION_FAILED', message: 'Invalid verification code. A TOTP code from your authenticator app is required.' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Both password and TOTP verified - disable MFA
    const disabled = await mfaService.disableMFA(userId);

    if (!disabled) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled for this account' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Reset rate limiter on success
    mfaVerifyLimiter.reset(_clientIp);

    return Response.json({
      success: true,
    } satisfies ApiResponse<null>);
  } catch (error) {
    console.error('MFA disable error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to disable MFA' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

/**
 * POST /api/mfa/backup-codes
 *
 * Regenerate backup codes for the authenticated user. Requires password
 * verification for security. This invalidates all previous backup codes.
 *
 * Body: { password: string }
 * Requires: Full authentication (Bearer token)
 */
export async function handleRegenerateBackupCodes(req: Request): Promise<Response> {
  // Authenticate the request
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const { userId } = auth;

  try {
    const body = await req.json();
    const { password } = body as { password?: string };

    // Validate required fields
    if (!password || typeof password !== 'string') {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Password is required' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    // Get user and verify password
    const user = await authService.getUserById(userId);
    if (!user || !user.passwordHash) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    const passwordValid = await authService.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    // Regenerate backup codes
    const backupCodes = await mfaService.regenerateBackupCodes(userId);

    if (!backupCodes) {
      return Response.json(
        {
          success: false,
          error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled for this account' },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      data: {
        backupCodes,
      },
    } satisfies ApiResponse<{ backupCodes: string[] }>);
  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to regenerate backup codes' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
