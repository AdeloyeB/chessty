import type {
  GameMovePayload,
  GameStartedPayload,
  Move,
  MatchFoundPayload,
  OddsUpdatePayload,
  SpectatorChatSendPayload,
  SpectatorChatMessagePayload,
  SpectatorPredictionCreatePayload,
  SpectatorPredictionCreatedPayload,
  SpectatorPredictionMatchedPayload,
  SpectatorPredictionsListPayload,
} from '@chess-game/shared';
import type { GameEventEmitter } from '../events/GameEventEmitter';
import type { GameStateManager } from './GameStateManager';
import type { ClockManager } from './ClockManager';
import type { RoomManager } from './RoomManager';
import type { ConnectionManager } from './ConnectionManager';
import type { BroadcastService } from './BroadcastService';
import * as gameService from '../services/game';
import * as matchmakingService from '../services/matchmaking';
import * as bettingService from '../services/betting';
import * as authService from '../services/auth';
import * as spectatorChatService from '../services/spectatorChat';
import * as spectatorPredictionService from '../services/spectatorPrediction';
import * as walletService from '../services/wallet';
import { isFeatureEnabled } from '../services/featureFlags';

// FIX #2: Timeout for pending games (2 minutes)
const PENDING_GAME_TIMEOUT = 2 * 60 * 1000;

/**
 * Thin orchestrator that coordinates game flow.
 * Delegates to focused managers and emits events.
 */
export class GameCoordinator {
  // FIX #2: Track pending game timeouts
  // When a game is created but players don't join within 2 minutes, cancel and refund
  private pendingGameTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private gameState: GameStateManager,
    private clock: ClockManager,
    private rooms: RoomManager,
    private connections: ConnectionManager,
    private broadcast: BroadcastService,
    private events: GameEventEmitter
  ) {
    // Listen for timeout events to end games
    this.events.on('game:timeout', async (payload) => {
      const game = await gameService.getGame(payload.gameId);
      if (!game || game.status !== 'active') return;
      await this.endGame(payload.gameId, 'timeout', payload.winnerId);
    }, { priority: 1, label: 'coordinator:timeout' });

    // Listen for challenge:confirmed to start pending game timeout
    this.events.on('challenge:confirmed', async (payload) => {
      this.startPendingGameTimeout(payload.gameId);
    }, { priority: 50, label: 'coordinator:pending_game_timeout' });
  }

  /**
   * FIX #2: Start a timeout for a pending game.
   * If both players don't join within 2 minutes, the game is cancelled and wagers refunded.
   */
  private startPendingGameTimeout(gameId: string): void {
    console.log(`[GameCoordinator] Starting pending game timeout for game ${gameId}`);

    const timeout = setTimeout(async () => {
      try {
        const game = await gameService.getGame(gameId);
        if (!game) {
          console.log(`[GameCoordinator] Game ${gameId} not found during timeout check`);
          return;
        }

        // Only cancel if game is still pending (hasn't started yet)
        if (game.status !== 'pending') {
          console.log(`[GameCoordinator] Game ${gameId} is no longer pending (status: ${game.status}), skipping timeout`);
          return;
        }

        console.log(`[GameCoordinator] Game ${gameId} timed out - players didn't join in time. Cancelling and refunding.`);

        // Cancel the game
        await this.cancelPendingGame(gameId);
      } catch (error) {
        console.error(`[GameCoordinator] Error during pending game timeout for ${gameId}:`, error);
      } finally {
        this.pendingGameTimeouts.delete(gameId);
      }
    }, PENDING_GAME_TIMEOUT);

    this.pendingGameTimeouts.set(gameId, timeout);
  }

  /**
   * FIX #2: Clear the pending game timeout when both players have joined.
   */
  private clearPendingGameTimeout(gameId: string): void {
    const timeout = this.pendingGameTimeouts.get(gameId);
    if (timeout) {
      console.log(`[GameCoordinator] Clearing pending game timeout for game ${gameId} - both players joined`);
      clearTimeout(timeout);
      this.pendingGameTimeouts.delete(gameId);
    }
  }

  /**
   * FIX #2: Cancel a pending game and refund wagers.
   */
  private async cancelPendingGame(gameId: string): Promise<void> {
    const game = await gameService.getGame(gameId);
    if (!game) return;

    const wagerAmount = parseFloat(game.wagerAmount);

    // Refund both players
    console.log(`[GameCoordinator] Refunding wagers for cancelled game ${gameId}`);
    await Promise.all([
      walletService.refundWager(game.whitePlayerId, wagerAmount, `game-cancelled-${gameId}`),
      walletService.refundWager(game.blackPlayerId, wagerAmount, `game-cancelled-${gameId}`),
    ]);

    // Update game status to cancelled
    await gameService.cancelGame(gameId);

    // Notify players if they're connected
    const whiteWs = this.connections.get(game.whitePlayerId);
    const blackWs = this.connections.get(game.blackPlayerId);

    const cancelPayload = {
      gameId,
      reason: 'Game cancelled - players did not join in time',
    };

    if (whiteWs) {
      this.broadcast.sendToUser(game.whitePlayerId, 'game:cancelled', cancelPayload);
    }
    if (blackWs) {
      this.broadcast.sendToUser(game.blackPlayerId, 'game:cancelled', cancelPayload);
    }

    // Cleanup any room state
    await this.cleanupGame(gameId);
  }

  // --- Game Lifecycle ---

  async joinGame(userId: string, gameId: string): Promise<boolean> {
    const game = await gameService.getGame(gameId);
    if (!game) return false;

    if (!gameService.isPlayerInGame(game, userId)) {
      return false;
    }

    // Add player to room
    this.rooms.addPlayer(gameId, userId);

    // Update ws data
    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.gameId = gameId;
    }

    // Initialize chess state if needed
    await this.gameState.initializeState(gameId, game.currentFen);

    // Initialize clock if needed (use sync version for quick check)
    const existingClock = this.clock.getClockStateSync(gameId);
    if (!existingClock) {
      await this.clock.initializeClock(
        gameId,
        game.whiteTimeRemaining,
        game.blackTimeRemaining,
        game.currentFen.split(' ')[1] === 'w'
      );
    }

    // Check if both players have joined
    const playerCount = this.rooms.getPlayerCount(gameId);
    const bothPresent = playerCount === 2;

    await this.events.emit('player:joined_game', {
      userId,
      gameId,
      bothPlayersPresent: bothPresent,
    });

    if (bothPresent && game.status === 'pending') {
      // FIX #2: Clear the pending game timeout since both players have joined
      this.clearPendingGameTimeout(gameId);

      await this.startGame(gameId);
    }

    return true;
  }

  leaveGame(userId: string, gameId: string): void {
    this.rooms.removePlayer(gameId, userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.gameId = undefined;
    }

    // Clean up if room is empty
    if (this.rooms.getPlayerCount(gameId) === 0) {
      this.rooms.deleteRoom(gameId);
      // Fire-and-forget async cleanup (don't block WebSocket handler)
      this.cleanupGame(gameId).catch((err) => {
        console.error(`[GameCoordinator] Error during cleanup for ${gameId}:`, err);
      });
    }
  }

  private async startGame(gameId: string): Promise<void> {
    const game = await gameService.startGame(gameId);
    const gameData = await gameService.getGameWithPlayers(gameId);

    if (!gameData) return;

    // Start clock
    this.clock.startClock(gameId, game.timeControlIncrement, async (gId, losingColor) => {
      const g = await gameService.getGame(gId);
      if (!g || g.status !== 'active') return null;
      return losingColor === 'white' ? g.blackPlayerId : g.whitePlayerId;
    });

    // Broadcast game started
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
        wagerAmount: Number(game.wagerAmount),
        totalPot: Number(game.totalPot),
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

    this.broadcast.broadcastToGame(gameId, 'game:started', payload);
    this.broadcast.broadcastToSpectators(gameId, 'game:started', payload);

    await this.events.emit('game:started', {
      gameId,
      whitePlayerId: game.whitePlayerId,
      blackPlayerId: game.blackPlayerId,
      timeControlInitial: game.timeControlInitial,
      timeControlIncrement: game.timeControlIncrement,
    });
  }

  // --- Move Handling ---

  async handleMove(userId: string, payload: GameMovePayload): Promise<boolean> {
    const { gameId, from, to, promotion } = payload;

    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.broadcast.sendError(userId, 'INVALID_GAME', 'Game not active');
      return false;
    }

    if (!gameService.isPlayerTurn(game, userId)) {
      this.broadcast.sendError(userId, 'NOT_YOUR_TURN', 'Not your turn');
      return false;
    }

    const moveResult = await this.gameState.validateAndApplyMove(gameId, from, to, promotion);
    if (!moveResult) {
      this.broadcast.sendError(userId, 'INVALID_MOVE', 'Invalid move');
      return false;
    }

    // Switch clock turn and add increment (async for Redis update)
    await this.clock.switchTurn(gameId, game.timeControlIncrement);

    // Clear any draw offer
    await this.gameState.clearDrawOffer(gameId);

    // Get current clock state (use sync for immediate response, state was just updated)
    const clockState = this.clock.getClockStateSync(gameId);

    // Emit move event (triggers persistence, broadcast, odds)
    await this.events.emit('game:move_made', {
      gameId,
      playerId: userId,
      move: moveResult.move,
      fen: moveResult.fen,
      pgn: moveResult.pgn,
      whiteTime: clockState?.whiteTime ?? 0,
      blackTime: clockState?.blackTime ?? 0,
      isGameOver: moveResult.isGameOver,
      isCheckmate: moveResult.isCheckmate,
      isDraw: moveResult.isDraw,
      isStalemate: moveResult.isStalemate,
    });

    // Check for game end
    if (moveResult.isGameOver) {
      let result: string;
      let winnerId: string | null = null;

      if (moveResult.isCheckmate) {
        winnerId = userId;
        const playerColor = gameService.getPlayerColor(game, userId);
        result = playerColor === 'white' ? 'white_wins' : 'black_wins';
      } else if (moveResult.isDraw) {
        result = moveResult.isStalemate ? 'stalemate' : 'draw';
      } else {
        result = 'draw';
      }

      await this.endGame(gameId, result, winnerId);
    }

    return true;
  }

  // --- Resign ---

  async handleResign(userId: string, gameId: string): Promise<void> {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.broadcast.sendError(userId, 'INVALID_GAME', 'Game not active');
      return;
    }

    if (!gameService.isPlayerInGame(game, userId)) {
      this.broadcast.sendError(userId, 'NOT_IN_GAME', 'You are not in this game');
      return;
    }

    const winnerId = userId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    await this.endGame(gameId, 'resignation', winnerId);
  }

  // --- Draw Handling ---

  async handleDrawOffer(userId: string, gameId: string): Promise<void> {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.broadcast.sendError(userId, 'INVALID_GAME', 'Game not active');
      return;
    }

    if (!gameService.isPlayerInGame(game, userId)) {
      this.broadcast.sendError(userId, 'NOT_IN_GAME', 'You are not in this game');
      return;
    }

    await this.gameState.setDrawOffer(gameId, userId);

    const opponentId = userId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    await this.events.emit('game:draw_offered', {
      gameId,
      offeredBy: userId,
      opponentId,
    });
  }

  async handleDrawAccept(userId: string, gameId: string): Promise<void> {
    const offeredBy = await this.gameState.getDrawOffer(gameId);
    if (!offeredBy || offeredBy === userId) {
      this.broadcast.sendError(userId, 'NO_DRAW_OFFER', 'No draw offer to accept');
      return;
    }

    await this.events.emit('game:draw_accepted', { gameId, acceptedBy: userId });
    await this.endGame(gameId, 'draw', null);
  }

  async handleDrawDecline(userId: string, gameId: string): Promise<void> {
    const offeredBy = await this.gameState.getDrawOffer(gameId);
    if (!offeredBy) return;

    await this.gameState.clearDrawOffer(gameId);
    await this.events.emit('game:draw_declined', { gameId, declinedBy: userId, offeredBy });
  }

  // --- End Game ---

  private async endGame(gameId: string, result: string, winnerId: string | null): Promise<void> {
    const { game, eloChanges } = await gameService.endGame(gameId, result as any, winnerId);

    // Stop clock
    this.clock.stopClock(gameId);

    // Emit game:ended event (triggers broadcast, achievements, predictions)
    await this.events.emit('game:ended', {
      gameId,
      result,
      winnerId,
      whitePlayerId: game.whitePlayerId,
      blackPlayerId: game.blackPlayerId,
      whiteEloAtStart: game.whiteEloAtStart,
      blackEloAtStart: game.blackEloAtStart,
      moveCount: Array.isArray(game.moves) ? game.moves.length : 0,
      wagerAmount: Number(game.wagerAmount),
      eloChanges: {
        whiteChange: eloChanges.whiteChange,
        blackChange: eloChanges.blackChange,
      },
    });

    // Cleanup
    await this.cleanupGame(gameId);
  }

  private async cleanupGame(gameId: string): Promise<void> {
    await this.gameState.cleanupState(gameId);
    await this.clock.cleanup(gameId);
    this.rooms.deleteSpectatorRoom(gameId);
  }

  // --- Spectator Management ---

  /** Max number of games a user can spectate concurrently */
  private static readonly MAX_SPECTATED_GAMES = 5;

  async joinSpectate(userId: string, gameId: string): Promise<boolean> {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      return false;
    }

    const ws = this.connections.get(userId);
    if (ws) {
      // Initialize the Set if it doesn't exist yet
      if (!ws.data.spectatingGameIds) {
        ws.data.spectatingGameIds = new Set();
      }

      // Enforce max concurrent spectated games
      if (ws.data.spectatingGameIds.size >= GameCoordinator.MAX_SPECTATED_GAMES && !ws.data.spectatingGameIds.has(gameId)) {
        this.broadcast.sendError(userId, 'MAX_SPECTATING', `Cannot spectate more than ${GameCoordinator.MAX_SPECTATED_GAMES} games at once`);
        return false;
      }

      ws.data.spectatingGameIds.add(gameId);
      // Keep legacy field pointing to the most recently joined game
      ws.data.spectatingGameId = gameId;
    }

    this.rooms.addSpectator(gameId, userId);

    // Send current game state
    const gameData = await gameService.getGameWithPlayers(gameId);
    if (gameData) {
      this.broadcast.sendToUser(userId, 'spectate:game_state', {
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
          wagerAmount: Number(game.wagerAmount),
          totalPot: Number(game.totalPot),
        },
      });

      // Send current odds
      try {
        const odds = await bettingService.getGameOdds(gameId);
        const oddsPayload: OddsUpdatePayload = {
          gameId,
          whiteOdds: odds.whiteOdds,
          blackOdds: odds.blackOdds,
        };
        this.broadcast.sendToUser(userId, 'odds:updated', oddsPayload);
      } catch {
        // Ignore odds errors
      }
    }

    await this.events.emit('spectator:joined', { userId, gameId });
    return true;
  }

  leaveSpectate(userId: string, gameId: string): void {
    this.rooms.removeSpectator(gameId, userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.spectatingGameIds?.delete(gameId);
      // Update legacy field: point to another game or clear it
      if (ws.data.spectatingGameId === gameId) {
        const remaining = ws.data.spectatingGameIds;
        ws.data.spectatingGameId = remaining && remaining.size > 0
          ? remaining.values().next().value
          : undefined;
      }
    }

    this.events.emit('spectator:left', { userId, gameId });
  }

  /**
   * Leave all spectated games at once (used on disconnect or explicit leave_all).
   */
  leaveAllSpectating(userId: string): void {
    const ws = this.connections.get(userId);
    const gameIds = ws?.data.spectatingGameIds;
    if (!gameIds || gameIds.size === 0) return;

    for (const gameId of gameIds) {
      this.rooms.removeSpectator(gameId, userId);
      this.events.emit('spectator:left', { userId, gameId });
    }

    if (ws) {
      ws.data.spectatingGameIds = new Set();
      ws.data.spectatingGameId = undefined;
    }
  }

  // --- Queue Management ---

  async handleQueueJoin(userId: string, payload: any): Promise<void> {
    try {
      const entry = await matchmakingService.joinQueue(
        userId,
        payload.wagerAmount,
        payload.timeControl,
        payload.minElo,
        payload.maxElo
      );

      this.broadcast.sendToUser(userId, 'queue:joined', { entry });

      // Try to find a match
      const match = await matchmakingService.findMatch(userId);
      if (match) {
        await this.notifyMatch(match);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join queue';
      this.broadcast.sendError(userId, 'QUEUE_ERROR', message);
    }
  }

  async handleQueueLeave(userId: string): Promise<void> {
    await matchmakingService.leaveQueue(userId);
    this.broadcast.sendToUser(userId, 'queue:left', {});
  }

  private async notifyMatch(match: matchmakingService.MatchResult): Promise<void> {
    const whitePlayer = await authService.getUserById(match.whitePlayerId);
    const blackPlayer = await authService.getUserById(match.blackPlayerId);

    if (!whitePlayer || !blackPlayer) return;

    const whitePayload: MatchFoundPayload = {
      gameId: match.gameId,
      opponent: authService.toPublicUser(blackPlayer),
      playerColor: 'white',
      wagerAmount: match.wagerAmount,
      timeControl: match.timeControl,
    };
    this.broadcast.sendToUser(match.whitePlayerId, 'queue:match_found', whitePayload);

    const blackPayload: MatchFoundPayload = {
      gameId: match.gameId,
      opponent: authService.toPublicUser(whitePlayer),
      playerColor: 'black',
      wagerAmount: match.wagerAmount,
      timeControl: match.timeControl,
    };
    this.broadcast.sendToUser(match.blackPlayerId, 'queue:match_found', blackPayload);
  }

  // --- Spectator Chat ---

  async handleSpectatorChatSend(userId: string, payload: SpectatorChatSendPayload): Promise<void> {
    if (!isFeatureEnabled('spectator_chat')) {
      this.broadcast.sendError(userId, 'FEATURE_DISABLED', 'Spectator chat is currently disabled');
      return;
    }

    try {
      const message = await spectatorChatService.sendMessage(
        payload.gameId,
        userId,
        payload.message
      );

      const chatPayload: SpectatorChatMessagePayload = { message };
      this.broadcast.broadcastToSpectators(payload.gameId, 'spectator:chat_message', chatPayload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      this.broadcast.sendError(userId, 'CHAT_ERROR', msg);
    }
  }

  // --- Spectator Predictions ---

  async handleSpectatorPredictionCreate(userId: string, payload: SpectatorPredictionCreatePayload): Promise<void> {
    if (!isFeatureEnabled('spectator_predictions')) {
      this.broadcast.sendError(userId, 'FEATURE_DISABLED', 'Spectator predictions are currently disabled');
      return;
    }

    try {
      const prediction = await spectatorPredictionService.createPrediction(
        payload.gameId,
        userId,
        payload.predictedWinnerId,
        payload.amount
      );

      const createdPayload: SpectatorPredictionCreatedPayload = { prediction };
      this.broadcast.sendToUser(userId, 'spectator:prediction_created', createdPayload);

      // Broadcast updated predictions list
      await this.broadcastPredictionsList(payload.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create prediction';
      this.broadcast.sendError(userId, 'PREDICTION_ERROR', message);
    }
  }

  async handleSpectatorPredictionAccept(userId: string, predictionId: string): Promise<void> {
    if (!isFeatureEnabled('spectator_predictions')) {
      this.broadcast.sendError(userId, 'FEATURE_DISABLED', 'Spectator predictions are currently disabled');
      return;
    }

    try {
      const prediction = await spectatorPredictionService.acceptPrediction(predictionId, userId);

      const matchedPayload: SpectatorPredictionMatchedPayload = { prediction };
      this.broadcast.sendToUser(prediction.creatorId, 'spectator:prediction_matched', matchedPayload);
      this.broadcast.sendToUser(userId, 'spectator:prediction_matched', matchedPayload);

      await this.broadcastPredictionsList(prediction.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept prediction';
      this.broadcast.sendError(userId, 'PREDICTION_ERROR', message);
    }
  }

  private async broadcastPredictionsList(gameId: string): Promise<void> {
    try {
      const predictions = await spectatorPredictionService.getGamePredictions(gameId);
      const payload: SpectatorPredictionsListPayload = { predictions };
      this.broadcast.broadcastToSpectators(gameId, 'spectator:predictions_list', payload);
    } catch {
      // Ignore errors
    }
  }

  // --- Ping/Pong ---

  handlePing(userId: string): void {
    this.broadcast.sendToUser(userId, 'pong', {});
  }

  // --- Stats ---

  getStats() {
    return {
      connections: this.connections.count(),
      activeGames: this.rooms.getActiveGameCount(),
      spectators: this.rooms.getTotalSpectatorCount(),
    };
  }
}
