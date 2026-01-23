import { LoginSchema, RegisterSchema, type ApiResponse, type AuthResponse } from '@chess-game/shared';
import * as authService from '../services/auth';
import {
  loginLimiter,
  registerLimiter,
  rateLimitResponse,
  getClientIp,
} from '../services/rateLimit';

/**
 * Extract request context (IP, user agent) for security tracking
 */
function getRequestContext(req: Request): authService.LoginContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

export async function handleRegister(req: Request): Promise<Response> {
  const context = getRequestContext(req);

  // Rate limit by IP
  const rateLimitResult = registerLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const { email, username, password } = parsed.data;
    const { user, token } = await authService.register(email, username, password, context);

    const response: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: {
          ...authService.toPublicUser(user),
          email: user.email,
          balance: Number(user.balance),
        },
        token,
      },
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return Response.json(
      {
        success: false,
        error: { code: 'REGISTRATION_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
}

export async function handleLogin(req: Request): Promise<Response> {
  const context = getRequestContext(req);

  // Rate limit by IP
  const rateLimitResult = loginLimiter.consume(context.ipAddress || 'unknown');
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfter!);
  }

  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const result = await authService.login(email, password, context);

    // Reset rate limiter on successful login
    loginLimiter.reset(context.ipAddress || 'unknown');

    const response: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: {
          ...authService.toPublicUser(result.user),
          email: result.user.email,
          balance: Number(result.user.balance),
        },
        token: result.token,
      },
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';

    // Determine status code based on error type
    const isLocked = message.includes('temporarily locked');
    const statusCode = isLocked ? 423 : 401; // 423 Locked for account lockout

    return Response.json(
      {
        success: false,
        error: {
          code: isLocked ? 'ACCOUNT_LOCKED' : 'LOGIN_ERROR',
          message,
        },
      } satisfies ApiResponse<never>,
      { status: statusCode }
    );
  }
}

export async function handleLogout(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = await authService.verifyToken(token);
      if (payload) {
        await authService.invalidateSession(payload.sessionId);
      }
    }

    return Response.json({ success: true } satisfies ApiResponse<null>);
  } catch {
    return Response.json({ success: true } satisfies ApiResponse<null>);
  }
}

export async function handleMe(req: Request): Promise<Response> {
  try {
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
          error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const user = await authService.getUserById(payload.userId);

    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        ...authService.toPublicUser(user),
        email: user.email,
        balance: parseFloat(user.balance),
      },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get user' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// Helper to extract user from request
export async function authenticateRequest(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  return authService.verifyToken(token);
}
