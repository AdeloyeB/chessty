import type { ServerWebSocket } from 'bun';
import type { WSMessage, WSMessageType } from '@chess-game/shared';
import { ConnectionManager, type WebSocketData, type ChessGameWS } from './ConnectionManager';
import { RoomManager } from './RoomManager';
import { BroadcastService } from './BroadcastService';
import { ClockManager } from './ClockManager';
import { GameStateManager } from './GameStateManager';
import { ChallengeCoordinator } from './ChallengeCoordinator';
import { GameCoordinator } from './GameCoordinator';
import { gameEvents } from '../events/GameEventEmitter';
import { registerAllHandlers } from '../events/handlers';
import * as authService from '../services/auth';
import * as challengeService from '../services/challenge';

// --- Module Instances ---
const connectionManager = new ConnectionManager();
const roomManager = new RoomManager();
const broadcastService = new BroadcastService(connectionManager, roomManager);
const clockManager = new ClockManager(gameEvents);
const gameStateManager = new GameStateManager();
const challengeCoordinator = new ChallengeCoordinator(gameEvents, broadcastService, connectionManager);
const gameCoordinator = new GameCoordinator(
  gameStateManager,
  clockManager,
  roomManager,
  connectionManager,
  broadcastService,
  gameEvents
);

// Set up the circular reference between coordinators
// ChallengeCoordinator needs GameCoordinator to auto-join players after game creation
challengeCoordinator.setGameCoordinator(gameCoordinator);

// Register all event handlers
registerAllHandlers(gameEvents, broadcastService);

// --- Exports for index.ts ---
export { type WebSocketData } from './ConnectionManager';

// Export managers for game recovery on server restart
export { clockManager, gameStateManager };

export async function handleWebSocketUpgrade(req: Request, server: any): Promise<Response | undefined> {
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

export async function handleWebSocketOpen(ws: ServerWebSocket<WebSocketData>) {
  const { userId } = ws.data;
  console.log(`WebSocket connected: ${userId}`);
  connectionManager.add(userId, ws as ChessGameWS);

  // Send initial data to the newly connected user
  try {
    // Send current challenge list
    const challenges = await challengeService.getOpenChallenges();
    broadcastService.sendToUser(userId, 'challenge:list_update', { challenges });

    // If user has an active challenge, send it
    const myChallenge = await challengeService.getUserActiveChallenge(userId);
    if (myChallenge) {
      broadcastService.sendToUser(userId, 'challenge:created', { challenge: myChallenge });
    }
  } catch (error) {
    console.error('Failed to send initial data to user:', error);
  }

  gameEvents.emit('player:connected', { userId });
}

export function handleWebSocketClose(ws: ServerWebSocket<WebSocketData>) {
  const { userId } = ws.data;
  console.log(`WebSocket disconnected: ${userId}`);

  // Leave game if in one
  if (ws.data.gameId) {
    gameCoordinator.leaveGame(userId, ws.data.gameId);
  }
  // Leave all spectated games on disconnect
  if (ws.data.spectatingGameIds && ws.data.spectatingGameIds.size > 0) {
    gameCoordinator.leaveAllSpectating(userId);
  } else if (ws.data.spectatingGameId) {
    // Backward compat: legacy single-game field
    gameCoordinator.leaveSpectate(userId, ws.data.spectatingGameId);
  }

  gameEvents.emit('player:disconnected', {
    userId,
    gameId: ws.data.gameId,
    spectatingGameIds: ws.data.spectatingGameIds ? [...ws.data.spectatingGameIds] : [],
  });

  connectionManager.remove(userId);
}

export async function handleWebSocketMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
  const { userId } = ws.data;

  try {
    const data = JSON.parse(message.toString()) as WSMessage;
    const { type, payload } = data;

    switch (type as WSMessageType) {
      // Game actions
      case 'game:join':
        await gameCoordinator.joinGame(userId, (payload as any).gameId);
        break;

      case 'game:leave':
        if (ws.data.gameId) {
          gameCoordinator.leaveGame(userId, ws.data.gameId);
        }
        break;

      case 'game:move':
        await gameCoordinator.handleMove(userId, payload as any);
        break;

      case 'game:resign':
        if (ws.data.gameId) {
          await gameCoordinator.handleResign(userId, ws.data.gameId);
        }
        break;

      case 'game:offer_draw':
        if (ws.data.gameId) {
          await gameCoordinator.handleDrawOffer(userId, ws.data.gameId);
        }
        break;

      case 'game:accept_draw':
        if (ws.data.gameId) {
          await gameCoordinator.handleDrawAccept(userId, ws.data.gameId);
        }
        break;

      case 'game:decline_draw':
        if (ws.data.gameId) {
          await gameCoordinator.handleDrawDecline(userId, ws.data.gameId);
        }
        break;

      // Queue actions
      case 'queue:join':
        await gameCoordinator.handleQueueJoin(userId, payload);
        break;

      case 'queue:leave':
        await gameCoordinator.handleQueueLeave(userId);
        break;

      // Spectator actions
      case 'spectate:join':
        await gameCoordinator.joinSpectate(userId, (payload as any).gameId);
        break;

      case 'spectate:leave': {
        // Multi-game: leave a specific game by gameId in payload
        // Backward compat: if no gameId in payload, leave the legacy single game
        const leaveGameId = (payload as any)?.gameId || ws.data.spectatingGameId;
        if (leaveGameId) {
          gameCoordinator.leaveSpectate(userId, leaveGameId);
        }
        break;
      }

      case 'spectate:leave_all':
        gameCoordinator.leaveAllSpectating(userId);
        break;

      // Challenge actions
      case 'challenge:create':
        await challengeCoordinator.handleCreate(userId, payload as any);
        break;

      case 'challenge:cancel':
        await challengeCoordinator.handleCancel(userId, (payload as any).challengeId);
        break;

      case 'challenge:accept':
        await challengeCoordinator.handleAccept(userId, (payload as any).challengeId);
        break;

      case 'challenge:confirm':
        await challengeCoordinator.handleConfirm(userId, (payload as any).challengeId);
        break;

      case 'challenge:decline':
        await challengeCoordinator.handleDecline(userId, (payload as any).challengeId);
        break;

      // Spectator chat
      case 'spectator:chat_send':
        await gameCoordinator.handleSpectatorChatSend(userId, payload as any);
        break;

      // Spectator predictions
      case 'spectator:prediction_create':
        await gameCoordinator.handleSpectatorPredictionCreate(userId, payload as any);
        break;

      case 'spectator:prediction_accept':
        await gameCoordinator.handleSpectatorPredictionAccept(userId, (payload as any).predictionId);
        break;

      // Keepalive
      case 'ping':
        gameCoordinator.handlePing(userId);
        break;

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('WebSocket message error:', error);
  }
}
