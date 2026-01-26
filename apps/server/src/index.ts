import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
} from './routes/auth';
import {
  handleGoogleAuth,
  handleGoogleCallback,
  handleGithubAuth,
  handleGithubCallback,
  handleTwitterAuth,
  handleTwitterCallback,
} from './routes/oauth';
import {
  handleStartEnrollment,
  handleCompleteEnrollment,
  handleMFAVerify,
  handleGetStatus,
  handleDisableMFA,
  handleRegenerateBackupCodes,
} from './routes/mfa';
import {
  apiLimiter,
  rateLimitResponse,
  getClientIp,
} from './services/rateLimit';
import {
  applySecurityHeaders,
  botDetection,
  logSecurityWarning,
  validate,
} from './services/security';
import {
  handleGetActiveGames,
  handleGetGame,
  handleGetUserGameHistory,
  handleGetUserActiveGame,
  handleGetUserGameHistoryFiltered,
  handleGetUserHistoryStats,
  handleGetUserTransactionsFiltered,
  handleGetUserFinancialSummary,
} from './routes/games';
import {
  handleJoinQueue,
  handleLeaveQueue,
  handleGetQueueStatus,
} from './routes/matchmaking';
import {
  handlePlaceBet,
  handleGetGameOdds,
  handleGetBetHistory,
  handleGetBetStats,
} from './routes/betting';
import {
  handleGetBalance,
  handleGetTransactions,
} from './routes/wallet';
import {
  handleGetEloLeaderboard,
  handleGetWinningsLeaderboard,
} from './routes/leaderboard';
import {
  handleGetUser,
  handleGetUserStats,
} from './routes/users';
import {
  handleGetProfile,
  handleUpdateProfile,
  handleGetAchievements,
  handleGetPublicProfile,
} from './routes/profile';
import {
  handleGetFlags,
  handleGetFlag,
  handleUpdateFlag,
} from './routes/flags';
import {
  handleWebSocketUpgrade,
  handleWebSocketOpen,
  handleWebSocketClose,
  handleWebSocketMessage,
} from './websocket/handler';
import { initializeFeatureFlags } from './services/featureFlags';
import { db } from './drizzle';
import { sql } from 'drizzle-orm';
import type { WebSocketData } from './websocket/handler';

const PORT = parseInt(process.env.PORT || '3001');
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Validate nanoid format (21 chars, URL-safe alphabet)
const NANOID_REGEX = /^[a-zA-Z0-9_-]{21}$/;

function isValidId(id: string | undefined): id is string {
  return typeof id === 'string' && NANOID_REGEX.test(id);
}

function invalidIdResponse(): Response {
  return Response.json(
    { success: false, error: { code: 'INVALID_ID', message: 'Invalid ID format' } },
    { status: 400 }
  );
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const server = Bun.serve<WebSocketData>({
  port: PORT,
  hostname: '0.0.0.0', // Listen on all interfaces (required for Docker)

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get('user-agent');

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // WebSocket upgrade (skip most middleware - handled separately)
    if (path === '/ws') {
      const response = await handleWebSocketUpgrade(req, server);
      return response || new Response(null, { status: 101 });
    }

    // Bot detection - log suspicious requests
    if (botDetection.isKnownBot(userAgent) && !path.startsWith('/health')) {
      logSecurityWarning('Bot detected', { ip: clientIp, userAgent, path });
    }

    // Global API rate limiting (skip for auth endpoints - they have their own limits)
    const skipRateLimit = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/google',
      '/api/auth/google/callback',
      '/api/auth/github',
      '/api/auth/github/callback',
      '/api/auth/twitter',
      '/api/auth/twitter/callback',
      '/api/auth/mfa/verify',
      '/api/mfa/enroll/start',
      '/api/mfa/enroll/complete',
      '/api/mfa/disable',
      '/health',
    ];
    if (!skipRateLimit.includes(path)) {
      const rateLimitResult = apiLimiter.consume(clientIp);
      if (!rateLimitResult.allowed) {
        return applySecurityHeaders(
          jsonResponse(rateLimitResponse(rateLimitResult.retryAfter!))
        );
      }
    }

    // Path traversal protection
    if (validate.isPathTraversal(path)) {
      logSecurityWarning('Path traversal attempt blocked', { ip: clientIp, path });
      return applySecurityHeaders(
        jsonResponse(
          Response.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Invalid request' } },
            { status: 403 }
          )
        )
      );
    }

    // Route handling
    let response: Response;

    try {
      // Auth routes
      if (path === '/api/auth/register' && method === 'POST') {
        response = await handleRegister(req);
      } else if (path === '/api/auth/login' && method === 'POST') {
        response = await handleLogin(req);
      } else if (path === '/api/auth/logout' && method === 'POST') {
        response = await handleLogout(req);
      } else if (path === '/api/auth/me' && method === 'GET') {
        response = await handleMe(req);
      }
      // OAuth routes
      else if (path === '/api/auth/google' && method === 'GET') {
        response = await handleGoogleAuth(req);
      } else if (path === '/api/auth/google/callback' && method === 'GET') {
        response = await handleGoogleCallback(req);
      } else if (path === '/api/auth/github' && method === 'GET') {
        response = await handleGithubAuth(req);
      } else if (path === '/api/auth/github/callback' && method === 'GET') {
        response = await handleGithubCallback(req);
      } else if (path === '/api/auth/twitter' && method === 'GET') {
        response = await handleTwitterAuth(req);
      } else if (path === '/api/auth/twitter/callback' && method === 'GET') {
        response = await handleTwitterCallback(req);
      }
      // MFA routes
      else if (path === '/api/mfa/enroll/start' && method === 'POST') {
        response = await handleStartEnrollment(req);
      } else if (path === '/api/mfa/enroll/complete' && method === 'POST') {
        response = await handleCompleteEnrollment(req);
      } else if (path === '/api/auth/mfa/verify' && method === 'POST') {
        response = await handleMFAVerify(req);
      } else if (path === '/api/mfa/status' && method === 'GET') {
        response = await handleGetStatus(req);
      } else if (path === '/api/mfa/disable' && method === 'POST') {
        response = await handleDisableMFA(req);
      } else if (path === '/api/mfa/backup-codes' && method === 'POST') {
        response = await handleRegenerateBackupCodes(req);
      }
      // Game routes
      else if (path === '/api/games/active' && method === 'GET') {
        response = await handleGetActiveGames(req);
      } else if (path === '/api/games/history' && method === 'GET') {
        response = await handleGetUserGameHistory(req);
      } else if (path === '/api/games/history/filtered' && method === 'GET') {
        response = await handleGetUserGameHistoryFiltered(req);
      } else if (path === '/api/games/history/stats' && method === 'GET') {
        response = await handleGetUserHistoryStats(req);
      } else if (path === '/api/games/history/transactions' && method === 'GET') {
        response = await handleGetUserTransactionsFiltered(req);
      } else if (path === '/api/games/history/financial' && method === 'GET') {
        response = await handleGetUserFinancialSummary(req);
      } else if (path === '/api/games/current' && method === 'GET') {
        response = await handleGetUserActiveGame(req);
      } else if (path.startsWith('/api/games/') && method === 'GET') {
        const gameId = path.split('/')[3];
        if (!isValidId(gameId)) {
          response = invalidIdResponse();
        } else {
          response = await handleGetGame(req, gameId);
        }
      }
      // Matchmaking routes
      else if (path === '/api/matchmaking/join' && method === 'POST') {
        response = await handleJoinQueue(req);
      } else if (path === '/api/matchmaking/leave' && method === 'POST') {
        response = await handleLeaveQueue(req);
      } else if (path === '/api/matchmaking/status' && method === 'GET') {
        response = await handleGetQueueStatus(req);
      }
      // Betting routes
      else if (path === '/api/betting/place' && method === 'POST') {
        response = await handlePlaceBet(req);
      } else if (path === '/api/betting/history' && method === 'GET') {
        response = await handleGetBetHistory(req);
      } else if (path === '/api/betting/stats' && method === 'GET') {
        response = await handleGetBetStats(req);
      } else if (path.startsWith('/api/betting/odds/') && method === 'GET') {
        const gameId = path.split('/')[4];
        if (!isValidId(gameId)) {
          response = invalidIdResponse();
        } else {
          response = await handleGetGameOdds(req, gameId);
        }
      }
      // Wallet routes
      else if (path === '/api/wallet/balance' && method === 'GET') {
        response = await handleGetBalance(req);
      } else if (path === '/api/wallet/transactions' && method === 'GET') {
        response = await handleGetTransactions(req);
      }
      // Leaderboard routes
      else if (path === '/api/leaderboard/elo' && method === 'GET') {
        response = await handleGetEloLeaderboard(req);
      } else if (path === '/api/leaderboard/winnings' && method === 'GET') {
        response = await handleGetWinningsLeaderboard(req);
      }
      // Profile routes
      else if (path === '/api/profile' && method === 'GET') {
        response = await handleGetProfile(req);
      } else if (path === '/api/profile' && method === 'PUT') {
        response = await handleUpdateProfile(req);
      } else if (path === '/api/profile/achievements' && method === 'GET') {
        response = await handleGetAchievements(req);
      } else if (path.match(/^\/api\/profile\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        if (!isValidId(userId)) {
          response = invalidIdResponse();
        } else {
          response = await handleGetPublicProfile(req, userId);
        }
      }
      // User routes
      else if (path.match(/^\/api\/users\/[^/]+\/stats$/) && method === 'GET') {
        const userId = path.split('/')[3];
        if (!isValidId(userId)) {
          response = invalidIdResponse();
        } else {
          response = await handleGetUserStats(req, userId);
        }
      } else if (path.startsWith('/api/users/') && method === 'GET') {
        const userId = path.split('/')[3];
        if (!isValidId(userId)) {
          response = invalidIdResponse();
        } else {
          response = await handleGetUser(req, userId);
        }
      }
      // Feature flags routes
      else if (path === '/api/flags' && method === 'GET') {
        response = await handleGetFlags();
      } else if (path.match(/^\/api\/flags\/[^/]+$/) && method === 'GET') {
        const flagId = path.split('/')[3];
        response = await handleGetFlag(flagId);
      } else if (path.match(/^\/api\/flags\/[^/]+$/) && method === 'PATCH') {
        const flagId = path.split('/')[3];
        const body = await req.json().catch(() => null);
        response = await handleUpdateFlag(flagId, body);
      }
      // Health check
      else if (path === '/health' && method === 'GET') {
        response = Response.json({ status: 'ok', timestamp: new Date().toISOString() });
      }
      // 404
      else {
        response = Response.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } },
          { status: 404 }
        );
      }
    } catch (error) {
      console.error('Server error:', error);
      response = Response.json(
        { success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
        { status: 500 }
      );
    }

    // Apply CORS and security headers to response
    return applySecurityHeaders(jsonResponse(response));
  },

  websocket: {
    open: handleWebSocketOpen,
    close: handleWebSocketClose,
    message: handleWebSocketMessage,
  },
});

// Wake Neon's compute node on server start (avoids cold-start on first real request)
db.execute(sql`SELECT 1`)
  .then(() => console.log('[Database] Neon connection established'))
  .catch((error) => console.error('[Database] Failed to connect to Neon:', error));

// Initialize feature flags on server start
initializeFeatureFlags().catch((error) => {
  console.error('[FeatureFlags] Failed to initialize:', error);
});

console.log(`🚀 Chess Game Server running on http://localhost:${PORT}`);
console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
