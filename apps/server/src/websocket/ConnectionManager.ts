import type { ServerWebSocket } from 'bun';

export interface WebSocketData {
  userId: string;
  gameId?: string;
  spectatingGameId?: string;           // Legacy single-game field (kept for backward compatibility)
  spectatingGameIds?: Set<string>;     // Multi-game spectating (max 5 concurrent games)
}

export type ChessGameWS = ServerWebSocket<WebSocketData>;

/**
 * Manages WebSocket connections, keyed by userId.
 */
export class ConnectionManager {
  private connections = new Map<string, ChessGameWS>();

  add(userId: string, ws: ChessGameWS): void {
    this.connections.set(userId, ws);
  }

  remove(userId: string): void {
    this.connections.delete(userId);
  }

  get(userId: string): ChessGameWS | undefined {
    return this.connections.get(userId);
  }

  getAll(): Map<string, ChessGameWS> {
    return this.connections;
  }

  count(): number {
    return this.connections.size;
  }
}
