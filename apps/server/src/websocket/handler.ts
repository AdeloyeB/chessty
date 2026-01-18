import type { ServerWebSocket } from 'bun';
import type { WSMessage, WSMessageType } from '@chess-game/shared';
import { gameManager, type WebSocketData } from './GameManager';
import * as authService from '../services/auth';

export async function handleWebSocketUpgrade(req: Request, server: any): Promise<Response | undefined> {
  // Extract token from query string or header
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await authService.verifyToken(token);
  if (!payload) {
    return new Response('Invalid token', { status: 401 });
  }

  const success = server.upgrade(req, {
    data: {
      userId: payload.userId,
    } as WebSocketData,
  });

  return success ? undefined : new Response('WebSocket upgrade failed', { status: 500 });
}

export function handleWebSocketOpen(ws: ServerWebSocket<WebSocketData>) {
  const { userId } = ws.data;
  console.log(`WebSocket connected: ${userId}`);
  gameManager.addConnection(userId, ws);
}

export function handleWebSocketClose(ws: ServerWebSocket<WebSocketData>) {
  const { userId } = ws.data;
  console.log(`WebSocket disconnected: ${userId}`);
  gameManager.removeConnection(userId);
}

export async function handleWebSocketMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
  const { userId } = ws.data;

  try {
    const data = JSON.parse(message.toString()) as WSMessage;
    const { type, payload } = data;

    switch (type as WSMessageType) {
      // Game actions
      case 'game:join':
        await gameManager.joinGame(userId, (payload as any).gameId);
        break;

      case 'game:leave':
        if (ws.data.gameId) {
          gameManager.leaveGame(userId, ws.data.gameId);
        }
        break;

      case 'game:move':
        await gameManager.handleMove(userId, payload as any);
        break;

      case 'game:resign':
        if (ws.data.gameId) {
          await gameManager.handleResign(userId, ws.data.gameId);
        }
        break;

      case 'game:offer_draw':
        if (ws.data.gameId) {
          await gameManager.handleDrawOffer(userId, ws.data.gameId);
        }
        break;

      case 'game:accept_draw':
        if (ws.data.gameId) {
          await gameManager.handleDrawAccept(userId, ws.data.gameId);
        }
        break;

      case 'game:decline_draw':
        if (ws.data.gameId) {
          await gameManager.handleDrawDecline(userId, ws.data.gameId);
        }
        break;

      // Queue actions
      case 'queue:join':
        await gameManager.handleQueueJoin(userId, payload);
        break;

      case 'queue:leave':
        await gameManager.handleQueueLeave(userId);
        break;

      // Spectator actions
      case 'spectate:join':
        await gameManager.joinSpectate(userId, (payload as any).gameId);
        break;

      case 'spectate:leave':
        if (ws.data.spectatingGameId) {
          gameManager.leaveSpectate(userId, ws.data.spectatingGameId);
        }
        break;

      // Challenge actions
      case 'challenge:create':
        await gameManager.handleChallengeCreate(userId, payload as any);
        break;

      case 'challenge:cancel':
        await gameManager.handleChallengeCancel(userId, (payload as any).challengeId);
        break;

      case 'challenge:accept':
        await gameManager.handleChallengeAccept(userId, (payload as any).challengeId);
        break;

      case 'challenge:confirm':
        await gameManager.handleChallengeConfirm(userId, (payload as any).challengeId);
        break;

      case 'challenge:decline':
        await gameManager.handleChallengeDecline(userId, (payload as any).challengeId);
        break;

      // Spectator chat
      case 'spectator:chat_send':
        await gameManager.handleSpectatorChatSend(userId, payload as any);
        break;

      // Spectator predictions
      case 'spectator:prediction_create':
        await gameManager.handleSpectatorPredictionCreate(userId, payload as any);
        break;

      case 'spectator:prediction_accept':
        await gameManager.handleSpectatorPredictionAccept(userId, (payload as any).predictionId);
        break;

      // Keepalive
      case 'ping':
        gameManager.handlePing(userId);
        break;

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('WebSocket message error:', error);
  }
}
