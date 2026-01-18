import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
} from './routes/auth';
import {
  handleGetActiveGames,
  handleGetGame,
  handleGetUserGameHistory,
  handleGetUserActiveGame,
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
  handleWebSocketUpgrade,
  handleWebSocketOpen,
  handleWebSocketClose,
  handleWebSocketMessage,
} from './websocket/handler';
import type { WebSocketData } from './websocket/GameManager';

const PORT = parseInt(process.env.PORT || '3001');
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

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

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // WebSocket upgrade
    if (path === '/ws') {
      const response = await handleWebSocketUpgrade(req, server);
      return response || new Response(null, { status: 101 });
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
      // Game routes
      else if (path === '/api/games/active' && method === 'GET') {
        response = await handleGetActiveGames(req);
      } else if (path === '/api/games/history' && method === 'GET') {
        response = await handleGetUserGameHistory(req);
      } else if (path === '/api/games/current' && method === 'GET') {
        response = await handleGetUserActiveGame(req);
      } else if (path.startsWith('/api/games/') && method === 'GET') {
        const gameId = path.split('/')[3];
        response = await handleGetGame(req, gameId);
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
        response = await handleGetGameOdds(req, gameId);
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
      // User routes
      else if (path.match(/^\/api\/users\/[^/]+\/stats$/) && method === 'GET') {
        const userId = path.split('/')[3];
        response = await handleGetUserStats(req, userId);
      } else if (path.startsWith('/api/users/') && method === 'GET') {
        const userId = path.split('/')[3];
        response = await handleGetUser(req, userId);
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

    return jsonResponse(response);
  },

  websocket: {
    open: handleWebSocketOpen,
    close: handleWebSocketClose,
    message: handleWebSocketMessage,
  },
});

console.log(`🚀 Chess Game Server running on http://localhost:${PORT}`);
console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
