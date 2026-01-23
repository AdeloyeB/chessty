import type { WSMessage, WSMessageType, ChallengeListUpdatePayload, ErrorPayload } from '@chess-game/shared';
import type { ConnectionManager } from './ConnectionManager';
import type { RoomManager } from './RoomManager';
import * as challengeService from '../services/challenge';

/**
 * Handles sending WebSocket messages to users, game rooms, and spectator rooms.
 * Wraps connection lookup, room membership, and JSON serialization.
 */
export class BroadcastService {
  constructor(
    private connectionManager: ConnectionManager,
    private roomManager: RoomManager
  ) {}

  /**
   * Send a typed message to a single user.
   */
  sendToUser<T>(userId: string, type: WSMessageType, payload: T): void {
    const ws = this.connectionManager.get(userId);
    if (ws) {
      const message: WSMessage<T> = {
        type,
        payload,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all players in a game room.
   */
  broadcastToGame<T>(gameId: string, type: WSMessageType, payload: T): void {
    const room = this.roomManager.getPlayers(gameId);
    if (!room) return;

    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const userId of room) {
      const ws = this.connectionManager.get(userId);
      if (ws) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast a message to all spectators of a game.
   */
  broadcastToSpectators<T>(gameId: string, type: WSMessageType, payload: T): void {
    const room = this.roomManager.getSpectators(gameId);
    if (!room) return;

    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const userId of room) {
      const ws = this.connectionManager.get(userId);
      if (ws) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast a message to all connected users.
   */
  broadcastToAll<T>(type: WSMessageType, payload: T): void {
    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const [, ws] of this.connectionManager.getAll()) {
      ws.send(data);
    }
  }

  /**
   * Send an error message to a user.
   */
  sendError(userId: string, code: string, message: string): void {
    const payload: ErrorPayload = { code, message };
    this.sendToUser(userId, 'error', payload);
  }

  /**
   * Broadcast the current challenge list to all connected users.
   */
  async broadcastChallengeList(): Promise<void> {
    try {
      const challenges = await challengeService.getOpenChallenges();
      const payload: ChallengeListUpdatePayload = { challenges };

      for (const [userId] of this.connectionManager.getAll()) {
        this.sendToUser(userId, 'challenge:list_update', payload);
      }
    } catch {
      // Ignore errors
    }
  }
}
