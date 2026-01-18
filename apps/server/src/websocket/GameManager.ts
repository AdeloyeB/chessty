import type { ServerWebSocket } from 'bun';
import { Chess } from 'chess.js';
import type {
  WSMessage,
  WSMessageType,
  Move,
  GameMovePayload,
  GameMovePayloadServer,
  GameStartedPayload,
  GameEndedPayload,
  ClockUpdatePayload,
  OddsUpdatePayload,
  MatchFoundPayload,
  ErrorPayload,
} from '@chess-game/shared';
import { CLOCK_SYNC_INTERVAL } from '@chess-game/shared';
import * as gameService from '../services/game';
import * as matchmakingService from '../services/matchmaking';
import * as bettingService from '../services/betting';
import * as authService from '../services/auth';

export interface WebSocketData {
  userId: string;
  gameId?: string;
  spectatingGameId?: string;
}

type ChessGameWS = ServerWebSocket<WebSocketData>;

class GameManager {
  // Map of userId -> WebSocket
  private connections = new Map<string, ChessGameWS>();
  // Map of gameId -> Set of player userIds
  private gameRooms = new Map<string, Set<string>>();
  // Map of gameId -> Set of spectator userIds
  private spectatorRooms = new Map<string, Set<string>>();
  // Map of gameId -> Chess instance
  private gameStates = new Map<string, Chess>();
  // Map of gameId -> clock interval
  private clockIntervals = new Map<string, ReturnType<typeof setInterval>>();
  // Map of gameId -> { whiteTime, blackTime, lastUpdate, isWhiteTurn }
  private gameClocks = new Map<
    string,
    { whiteTime: number; blackTime: number; lastUpdate: number; isWhiteTurn: boolean }
  >();
  // Draw offers: gameId -> offeringPlayerId
  private drawOffers = new Map<string, string>();

  addConnection(userId: string, ws: ChessGameWS) {
    this.connections.set(userId, ws);
  }

  removeConnection(userId: string) {
    const ws = this.connections.get(userId);
    if (ws?.data.gameId) {
      this.leaveGame(userId, ws.data.gameId);
    }
    if (ws?.data.spectatingGameId) {
      this.leaveSpectate(userId, ws.data.spectatingGameId);
    }
    this.connections.delete(userId);
  }

  getConnection(userId: string): ChessGameWS | undefined {
    return this.connections.get(userId);
  }

  // Game Room Management
  async joinGame(userId: string, gameId: string): Promise<boolean> {
    const game = await gameService.getGame(gameId);
    if (!game) return false;

    if (!gameService.isPlayerInGame(game, userId)) {
      return false;
    }

    // Initialize game room if needed
    if (!this.gameRooms.has(gameId)) {
      this.gameRooms.set(gameId, new Set());
    }

    this.gameRooms.get(gameId)!.add(userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.gameId = gameId;
    }

    // Initialize chess state if needed
    if (!this.gameStates.has(gameId)) {
      const chess = new Chess(game.currentFen);
      this.gameStates.set(gameId, chess);
    }

    // Initialize clock if needed
    if (!this.gameClocks.has(gameId)) {
      this.gameClocks.set(gameId, {
        whiteTime: game.whiteTimeRemaining,
        blackTime: game.blackTimeRemaining,
        lastUpdate: Date.now(),
        isWhiteTurn: game.currentFen.split(' ')[1] === 'w',
      });
    }

    // Check if both players have joined
    const room = this.gameRooms.get(gameId)!;
    if (room.size === 2 && game.status === 'pending') {
      await this.startGame(gameId);
    }

    return true;
  }

  leaveGame(userId: string, gameId: string) {
    const room = this.gameRooms.get(gameId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.gameRooms.delete(gameId);
        this.cleanupGame(gameId);
      }
    }

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.gameId = undefined;
    }
  }

  private cleanupGame(gameId: string) {
    this.gameStates.delete(gameId);
    this.gameClocks.delete(gameId);
    this.drawOffers.delete(gameId);

    const interval = this.clockIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.clockIntervals.delete(gameId);
    }
  }

  private async startGame(gameId: string) {
    const game = await gameService.startGame(gameId);
    const gameData = await gameService.getGameWithPlayers(gameId);

    if (!gameData) return;

    // Start clock
    this.startClock(gameId, game.timeControlIncrement);

    // Notify players
    const payload: GameStartedPayload = {
      game: {
        id: game.id,
        whitePlayerId: game.whitePlayerId,
        blackPlayerId: game.blackPlayerId,
        winnerId: game.winnerId,
        status: game.status as any,
        result: game.result as any,
        currentFen: game.currentFen,
        pgn: game.pgn,
        moves: game.moves as Move[],
        timeControl: {
          initial: game.timeControlInitial,
          increment: game.timeControlIncrement,
        },
        whiteTimeRemaining: game.whiteTimeRemaining,
        blackTimeRemaining: game.blackTimeRemaining,
        stakeAmount: parseFloat(game.stakeAmount),
        totalPot: parseFloat(game.totalPot),
        whiteEloAtStart: game.whiteEloAtStart,
        blackEloAtStart: game.blackEloAtStart,
        eloChange: game.eloChange,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        startedAt: game.startedAt,
        endedAt: game.endedAt,
      },
      whitePlayer: authService.toPublicUser(gameData.whitePlayer),
      blackPlayer: authService.toPublicUser(gameData.blackPlayer),
    };

    this.broadcastToGame(gameId, 'game:started', payload);
    this.broadcastToSpectators(gameId, 'game:started', payload);
  }

  private startClock(gameId: string, increment: number) {
    const interval = setInterval(() => {
      const clock = this.gameClocks.get(gameId);
      if (!clock) {
        clearInterval(interval);
        return;
      }

      const now = Date.now();
      const elapsed = (now - clock.lastUpdate) / 1000;

      if (clock.isWhiteTurn) {
        clock.whiteTime = Math.max(0, clock.whiteTime - elapsed);
      } else {
        clock.blackTime = Math.max(0, clock.blackTime - elapsed);
      }
      clock.lastUpdate = now;

      // Check for timeout
      if (clock.whiteTime <= 0 || clock.blackTime <= 0) {
        this.handleTimeout(gameId, clock.whiteTime <= 0 ? 'white' : 'black');
        return;
      }

      // Broadcast clock update
      const payload: ClockUpdatePayload = {
        gameId,
        whiteTimeRemaining: Math.floor(clock.whiteTime),
        blackTimeRemaining: Math.floor(clock.blackTime),
      };

      this.broadcastToGame(gameId, 'game:clock_update', payload);
      this.broadcastToSpectators(gameId, 'game:clock_update', payload);
    }, CLOCK_SYNC_INTERVAL);

    this.clockIntervals.set(gameId, interval);
  }

  private async handleTimeout(gameId: string, losingColor: 'white' | 'black') {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') return;

    const winnerId = losingColor === 'white' ? game.blackPlayerId : game.whitePlayerId;
    await this.endGame(gameId, 'timeout', winnerId);
  }

  // Move handling
  async handleMove(userId: string, payload: GameMovePayload): Promise<boolean> {
    const { gameId, from, to, promotion } = payload;

    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.sendError(userId, 'INVALID_GAME', 'Game not active');
      return false;
    }

    if (!gameService.isPlayerTurn(game, userId)) {
      this.sendError(userId, 'NOT_YOUR_TURN', 'Not your turn');
      return false;
    }

    const chess = this.gameStates.get(gameId);
    if (!chess) {
      this.sendError(userId, 'GAME_STATE_ERROR', 'Game state not found');
      return false;
    }

    // Attempt the move
    try {
      const moveResult = chess.move({ from, to, promotion });

      if (!moveResult) {
        this.sendError(userId, 'INVALID_MOVE', 'Invalid move');
        return false;
      }

      // Update clock
      const clock = this.gameClocks.get(gameId);
      if (clock) {
        // Add increment to the player who just moved
        if (clock.isWhiteTurn) {
          clock.whiteTime += game.timeControlIncrement;
        } else {
          clock.blackTime += game.timeControlIncrement;
        }
        clock.isWhiteTurn = !clock.isWhiteTurn;
        clock.lastUpdate = Date.now();
      }

      // Create move record
      const move: Move = {
        from,
        to,
        promotion,
        san: moveResult.san,
        fen: chess.fen(),
        timestamp: Date.now(),
      };

      // Update game in database
      await gameService.makeMove(
        gameId,
        move,
        chess.fen(),
        chess.pgn(),
        Math.floor(clock?.whiteTime || 0),
        Math.floor(clock?.blackTime || 0)
      );

      // Clear any draw offer
      this.drawOffers.delete(gameId);

      // Broadcast move
      const movePayload: GameMovePayloadServer = {
        gameId,
        move,
        whiteTimeRemaining: Math.floor(clock?.whiteTime || 0),
        blackTimeRemaining: Math.floor(clock?.blackTime || 0),
      };

      this.broadcastToGame(gameId, 'game:move_made', movePayload);
      this.broadcastToSpectators(gameId, 'game:move_made', movePayload);

      // Update odds for spectators
      this.broadcastOddsUpdate(gameId);

      // Check for game end
      if (chess.isGameOver()) {
        let result: string;
        let winnerId: string | null = null;

        if (chess.isCheckmate()) {
          // The player who just moved wins
          winnerId = userId;
          const playerColor = gameService.getPlayerColor(game, userId);
          result = playerColor === 'white' ? 'white_wins' : 'black_wins';
        } else if (chess.isDraw()) {
          if (chess.isStalemate()) {
            result = 'stalemate';
          } else {
            result = 'draw';
          }
        } else {
          result = 'draw';
        }

        await this.endGame(gameId, result as any, winnerId);
      }

      return true;
    } catch (error) {
      this.sendError(userId, 'MOVE_ERROR', 'Failed to make move');
      return false;
    }
  }

  // Resign
  async handleResign(userId: string, gameId: string) {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.sendError(userId, 'INVALID_GAME', 'Game not active');
      return;
    }

    if (!gameService.isPlayerInGame(game, userId)) {
      this.sendError(userId, 'NOT_IN_GAME', 'You are not in this game');
      return;
    }

    const winnerId = userId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    await this.endGame(gameId, 'resignation', winnerId);
  }

  // Draw handling
  async handleDrawOffer(userId: string, gameId: string) {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.sendError(userId, 'INVALID_GAME', 'Game not active');
      return;
    }

    if (!gameService.isPlayerInGame(game, userId)) {
      this.sendError(userId, 'NOT_IN_GAME', 'You are not in this game');
      return;
    }

    this.drawOffers.set(gameId, userId);

    // Notify opponent
    const opponentId = userId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    this.sendToUser(opponentId, 'game:draw_offered', { gameId, offeredBy: userId });
  }

  async handleDrawAccept(userId: string, gameId: string) {
    const offeredBy = this.drawOffers.get(gameId);
    if (!offeredBy || offeredBy === userId) {
      this.sendError(userId, 'NO_DRAW_OFFER', 'No draw offer to accept');
      return;
    }

    await this.endGame(gameId, 'draw', null);
  }

  async handleDrawDecline(userId: string, gameId: string) {
    const offeredBy = this.drawOffers.get(gameId);
    if (!offeredBy) return;

    this.drawOffers.delete(gameId);
    this.sendToUser(offeredBy, 'game:draw_declined', { gameId });
  }

  private async endGame(gameId: string, result: string, winnerId: string | null) {
    const { game, eloChanges } = await gameService.endGame(gameId, result as any, winnerId);

    // Stop clock
    const interval = this.clockIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.clockIntervals.delete(gameId);
    }

    // Broadcast game end
    const payload: GameEndedPayload = {
      gameId,
      result: result as any,
      winnerId,
      whiteEloChange: eloChanges.whiteChange,
      blackEloChange: eloChanges.blackChange,
    };

    this.broadcastToGame(gameId, 'game:ended', payload);
    this.broadcastToSpectators(gameId, 'game:ended', payload);

    // Cleanup
    this.cleanupGame(gameId);
  }

  // Spectator Management
  async joinSpectate(userId: string, gameId: string): Promise<boolean> {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      return false;
    }

    if (!this.spectatorRooms.has(gameId)) {
      this.spectatorRooms.set(gameId, new Set());
    }

    this.spectatorRooms.get(gameId)!.add(userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.spectatingGameId = gameId;
    }

    // Send current game state
    const gameData = await gameService.getGameWithPlayers(gameId);
    if (gameData) {
      this.sendToUser(userId, 'spectate:game_state', {
        game: {
          id: game.id,
          whitePlayer: authService.toPublicUser(gameData.whitePlayer),
          blackPlayer: authService.toPublicUser(gameData.blackPlayer),
          status: game.status,
          currentFen: game.currentFen,
          pgn: game.pgn,
          moves: game.moves,
          whiteTimeRemaining: game.whiteTimeRemaining,
          blackTimeRemaining: game.blackTimeRemaining,
          stakeAmount: parseFloat(game.stakeAmount),
          totalPot: parseFloat(game.totalPot),
        },
      });

      // Send current odds
      this.broadcastOddsUpdate(gameId);
    }

    return true;
  }

  leaveSpectate(userId: string, gameId: string) {
    const room = this.spectatorRooms.get(gameId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.spectatorRooms.delete(gameId);
      }
    }

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.spectatingGameId = undefined;
    }
  }

  // Queue Management
  async handleQueueJoin(userId: string, payload: any) {
    try {
      const entry = await matchmakingService.joinQueue(
        userId,
        payload.stakeAmount,
        payload.timeControl,
        payload.minElo,
        payload.maxElo
      );

      this.sendToUser(userId, 'queue:joined', { entry });

      // Try to find a match
      const match = await matchmakingService.findMatch(userId);

      if (match) {
        await this.notifyMatch(match);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join queue';
      this.sendError(userId, 'QUEUE_ERROR', message);
    }
  }

  async handleQueueLeave(userId: string) {
    await matchmakingService.leaveQueue(userId);
    this.sendToUser(userId, 'queue:left', {});
  }

  private async notifyMatch(match: matchmakingService.MatchResult) {
    const whitePlayer = await authService.getUserById(match.whitePlayerId);
    const blackPlayer = await authService.getUserById(match.blackPlayerId);

    if (!whitePlayer || !blackPlayer) return;

    // Notify white player
    const whitePayload: MatchFoundPayload = {
      gameId: match.gameId,
      opponent: authService.toPublicUser(blackPlayer),
      playerColor: 'white',
      stakeAmount: match.stakeAmount,
      timeControl: match.timeControl,
    };
    this.sendToUser(match.whitePlayerId, 'queue:match_found', whitePayload);

    // Notify black player
    const blackPayload: MatchFoundPayload = {
      gameId: match.gameId,
      opponent: authService.toPublicUser(whitePlayer),
      playerColor: 'black',
      stakeAmount: match.stakeAmount,
      timeControl: match.timeControl,
    };
    this.sendToUser(match.blackPlayerId, 'queue:match_found', blackPayload);
  }

  // Odds Broadcasting
  private async broadcastOddsUpdate(gameId: string) {
    try {
      const odds = await bettingService.getGameOdds(gameId);
      const payload: OddsUpdatePayload = {
        gameId,
        whiteOdds: odds.whiteOdds,
        blackOdds: odds.blackOdds,
      };

      this.broadcastToSpectators(gameId, 'odds:updated', payload);
    } catch {
      // Ignore errors
    }
  }

  // Messaging helpers
  private sendToUser<T>(userId: string, type: WSMessageType, payload: T) {
    const ws = this.connections.get(userId);
    if (ws) {
      const message: WSMessage<T> = {
        type,
        payload,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToGame<T>(gameId: string, type: WSMessageType, payload: T) {
    const room = this.gameRooms.get(gameId);
    if (!room) return;

    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const userId of room) {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(data);
      }
    }
  }

  private broadcastToSpectators<T>(gameId: string, type: WSMessageType, payload: T) {
    const room = this.spectatorRooms.get(gameId);
    if (!room) return;

    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const userId of room) {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(data);
      }
    }
  }

  private sendError(userId: string, code: string, message: string) {
    const payload: ErrorPayload = { code, message };
    this.sendToUser(userId, 'error', payload);
  }

  // Ping/Pong for keepalive
  handlePing(userId: string) {
    this.sendToUser(userId, 'pong', {});
  }

  // Get stats
  getStats() {
    return {
      connections: this.connections.size,
      activeGames: this.gameRooms.size,
      spectators: Array.from(this.spectatorRooms.values()).reduce((sum, room) => sum + room.size, 0),
    };
  }
}

export const gameManager = new GameManager();
