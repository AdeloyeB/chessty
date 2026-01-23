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

/**
 * Thin orchestrator that coordinates game flow.
 * Delegates to focused managers and emits events.
 */
export class GameCoordinator {
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
    this.gameState.initializeState(gameId, game.currentFen);

    // Initialize clock if needed
    if (!this.clock.getClockState(gameId)) {
      this.clock.initializeClock(
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
      this.cleanupGame(gameId);
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
        stakeAmount: Number(game.stakeAmount),
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

    const moveResult = this.gameState.validateAndApplyMove(gameId, from, to, promotion);
    if (!moveResult) {
      this.broadcast.sendError(userId, 'INVALID_MOVE', 'Invalid move');
      return false;
    }

    // Switch clock turn and add increment
    this.clock.switchTurn(gameId, game.timeControlIncrement);

    // Clear any draw offer
    this.gameState.clearDrawOffer(gameId);

    // Get current clock state
    const clockState = this.clock.getClockState(gameId);

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

    this.gameState.setDrawOffer(gameId, userId);

    const opponentId = userId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    await this.events.emit('game:draw_offered', {
      gameId,
      offeredBy: userId,
      opponentId,
    });
  }

  async handleDrawAccept(userId: string, gameId: string): Promise<void> {
    const offeredBy = this.gameState.getDrawOffer(gameId);
    if (!offeredBy || offeredBy === userId) {
      this.broadcast.sendError(userId, 'NO_DRAW_OFFER', 'No draw offer to accept');
      return;
    }

    await this.events.emit('game:draw_accepted', { gameId, acceptedBy: userId });
    await this.endGame(gameId, 'draw', null);
  }

  async handleDrawDecline(userId: string, gameId: string): Promise<void> {
    const offeredBy = this.gameState.getDrawOffer(gameId);
    if (!offeredBy) return;

    this.gameState.clearDrawOffer(gameId);
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
      stakeAmount: Number(game.stakeAmount),
      eloChanges: {
        whiteChange: eloChanges.whiteChange,
        blackChange: eloChanges.blackChange,
      },
    });

    // Cleanup
    this.cleanupGame(gameId);
  }

  private cleanupGame(gameId: string): void {
    this.gameState.cleanupState(gameId);
    this.clock.cleanup(gameId);
    this.rooms.deleteSpectatorRoom(gameId);
  }

  // --- Spectator Management ---

  async joinSpectate(userId: string, gameId: string): Promise<boolean> {
    const game = await gameService.getGame(gameId);
    if (!game || game.status !== 'active') {
      return false;
    }

    this.rooms.addSpectator(gameId, userId);

    const ws = this.connections.get(userId);
    if (ws) {
      ws.data.spectatingGameId = gameId;
    }

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
          stakeAmount: Number(game.stakeAmount),
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
      ws.data.spectatingGameId = undefined;
    }

    this.events.emit('spectator:left', { userId, gameId });
  }

  // --- Queue Management ---

  async handleQueueJoin(userId: string, payload: any): Promise<void> {
    try {
      const entry = await matchmakingService.joinQueue(
        userId,
        payload.stakeAmount,
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
      stakeAmount: match.stakeAmount,
      timeControl: match.timeControl,
    };
    this.broadcast.sendToUser(match.whitePlayerId, 'queue:match_found', whitePayload);

    const blackPayload: MatchFoundPayload = {
      gameId: match.gameId,
      opponent: authService.toPublicUser(whitePlayer),
      playerColor: 'black',
      stakeAmount: match.stakeAmount,
      timeControl: match.timeControl,
    };
    this.broadcast.sendToUser(match.blackPlayerId, 'queue:match_found', blackPayload);
  }

  // --- Spectator Chat ---

  async handleSpectatorChatSend(userId: string, payload: SpectatorChatSendPayload): Promise<void> {
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
