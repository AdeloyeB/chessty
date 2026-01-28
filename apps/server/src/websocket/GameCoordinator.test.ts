/**
 * Tests for GameCoordinator
 *
 * GameCoordinator is the orchestration layer that:
 * - Coordinates game flow (join, move, resign, draw)
 * - Delegates to focused managers (GameStateManager, ClockManager, etc.)
 * - Emits events for side effects (broadcast, persistence, achievements)
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { GameCoordinator } from './GameCoordinator';
import { GameStateManager } from './GameStateManager';
import { ClockManager } from './ClockManager';
import { RoomManager } from './RoomManager';
import { ConnectionManager } from './ConnectionManager';
import { BroadcastService } from './BroadcastService';
import { GameEventEmitter } from '../events/GameEventEmitter';
import * as gameService from '../services/game';
import * as authService from '../services/auth';
import * as redisClient from '../redis/client';

// Standard starting FEN
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Helper to create a mock game
const createMockGame = (overrides: Partial<any> = {}) => ({
  id: 'game-123',
  whitePlayerId: 'white-user',
  blackPlayerId: 'black-user',
  status: 'active',
  result: null,
  currentFen: STARTING_FEN,
  pgn: '',
  moves: [],
  timeControlInitial: 300,
  timeControlIncrement: 5,
  whiteTimeRemaining: 300,
  blackTimeRemaining: 300,
  wagerAmount: '10.00',
  totalPot: '20.00',
  whiteEloAtStart: 1500,
  blackEloAtStart: 1500,
  eloChange: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: null,
  endedAt: null,
  winnerId: null,
  ...overrides,
});

// Helper to create mock user
const createMockUser = (overrides: Partial<any> = {}) => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  profileImageUrl: null,
  eloRating: 1500,
  winCount: 0,
  lossCount: 0,
  drawCount: 0,
  createdAt: new Date(),
  ...overrides,
});

// Mock WebSocket
const createMockWs = () => ({
  send: mock(() => {}),
  data: {
    userId: 'user-123',
    gameId: undefined as string | undefined,
    spectatingGameId: undefined as string | undefined,
  },
});

describe('GameCoordinator', () => {
  let coordinator: GameCoordinator;
  let events: GameEventEmitter;
  let gameState: GameStateManager;
  let clock: ClockManager;
  let rooms: RoomManager;
  let connections: ConnectionManager;
  let broadcast: BroadcastService;

  // Spies
  let getGameSpy: ReturnType<typeof spyOn>;
  let getGameWithPlayersSpy: ReturnType<typeof spyOn>;
  let startGameSpy: ReturnType<typeof spyOn>;
  let endGameSpy: ReturnType<typeof spyOn>;
  let isPlayerInGameSpy: ReturnType<typeof spyOn>;
  let isPlayerTurnSpy: ReturnType<typeof spyOn>;
  let getPlayerColorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Mock Redis as unavailable
    spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
    spyOn(redisClient, 'getRedis').mockReturnValue(null);

    // Create real instances (with mocked Redis)
    events = new GameEventEmitter();
    gameState = new GameStateManager();
    clock = new ClockManager(events);
    rooms = new RoomManager();
    connections = new ConnectionManager();
    broadcast = new BroadcastService(connections, rooms);

    // Create coordinator
    coordinator = new GameCoordinator(
      gameState,
      clock,
      rooms,
      connections,
      broadcast,
      events
    );

    // Setup common spies
    getGameSpy = spyOn(gameService, 'getGame').mockResolvedValue(createMockGame());
    getGameWithPlayersSpy = spyOn(gameService, 'getGameWithPlayers').mockResolvedValue({
      ...createMockGame(),
      whitePlayer: createMockUser({ id: 'white-user', username: 'white' }),
      blackPlayer: createMockUser({ id: 'black-user', username: 'black' }),
    });
    startGameSpy = spyOn(gameService, 'startGame').mockResolvedValue(createMockGame({ status: 'active' }));
    endGameSpy = spyOn(gameService, 'endGame').mockResolvedValue({
      game: createMockGame({ status: 'completed' }),
      eloChanges: { whiteChange: 10, blackChange: -10 },
    });
    isPlayerInGameSpy = spyOn(gameService, 'isPlayerInGame').mockReturnValue(true);
    isPlayerTurnSpy = spyOn(gameService, 'isPlayerTurn').mockReturnValue(true);
    getPlayerColorSpy = spyOn(gameService, 'getPlayerColor').mockReturnValue('white');
    spyOn(authService, 'toPublicUser').mockImplementation((user: any) => ({
      id: user.id,
      username: user.username,
      profileImageUrl: user.profileImageUrl,
      eloRating: user.eloRating,
    }));
  });

  afterEach(() => {
    events.removeAllHandlers();
    mock.restore();
  });

  describe('joinGame()', () => {
    test('should add player to room', async () => {
      const gameId = 'game-123';
      const userId = 'white-user';

      // Add mock WebSocket connection
      const mockWs = createMockWs();
      mockWs.data.userId = userId;
      connections.add(userId, mockWs as any);

      const result = await coordinator.joinGame(userId, gameId);

      expect(result).toBe(true);
      expect(rooms.getPlayerCount(gameId)).toBe(1);
    });

    test('should return false if game not found', async () => {
      getGameSpy.mockResolvedValueOnce(null);

      const result = await coordinator.joinGame('user-123', 'non-existent');

      expect(result).toBe(false);
    });

    test('should return false if user not in game', async () => {
      isPlayerInGameSpy.mockReturnValueOnce(false);

      const result = await coordinator.joinGame('stranger', 'game-123');

      expect(result).toBe(false);
    });

    test('should emit player:joined_game event', async () => {
      const gameId = 'game-123';
      const userId = 'white-user';

      let emittedPayload: any = null;
      events.on('player:joined_game', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.joinGame(userId, gameId);

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.userId).toBe(userId);
      expect(emittedPayload.gameId).toBe(gameId);
    });

    test('should start game when both players join', async () => {
      const gameId = 'game-123';
      const game = createMockGame({ status: 'pending' });
      getGameSpy.mockResolvedValue(game);

      // Add white player
      connections.add('white-user', createMockWs() as any);
      await coordinator.joinGame('white-user', gameId);

      // Add black player
      connections.add('black-user', createMockWs() as any);
      await coordinator.joinGame('black-user', gameId);

      // startGame should have been called
      expect(startGameSpy).toHaveBeenCalledWith(gameId);
    });
  });

  describe('handleMove()', () => {
    beforeEach(async () => {
      // Setup game state
      const gameId = 'game-123';
      await gameState.initializeState(gameId, STARTING_FEN);
      await clock.initializeClock(gameId, 300, 300, true);
    });

    test('should validate it is the player\'s turn', async () => {
      isPlayerTurnSpy.mockReturnValueOnce(false);

      const sendErrorSpy = spyOn(broadcast, 'sendError');

      const result = await coordinator.handleMove('black-user', {
        gameId: 'game-123',
        from: 'e7',
        to: 'e5',
      });

      expect(result).toBe(false);
      expect(sendErrorSpy).toHaveBeenCalledWith('black-user', 'NOT_YOUR_TURN', 'Not your turn');
    });

    test('should validate move is legal via GameStateManager', async () => {
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      // Illegal move: pawn can't move 3 squares
      const result = await coordinator.handleMove('white-user', {
        gameId: 'game-123',
        from: 'e2',
        to: 'e5',
      });

      expect(result).toBe(false);
      expect(sendErrorSpy).toHaveBeenCalledWith('white-user', 'INVALID_MOVE', 'Invalid move');
    });

    test('should update clock after valid move', async () => {
      const switchTurnSpy = spyOn(clock, 'switchTurn');

      await coordinator.handleMove('white-user', {
        gameId: 'game-123',
        from: 'e2',
        to: 'e4',
      });

      expect(switchTurnSpy).toHaveBeenCalledWith('game-123', 5); // 5 = increment
    });

    test('should emit game:move_made event', async () => {
      let emittedPayload: any = null;
      events.on('game:move_made', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.handleMove('white-user', {
        gameId: 'game-123',
        from: 'e2',
        to: 'e4',
      });

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.gameId).toBe('game-123');
      expect(emittedPayload.playerId).toBe('white-user');
      expect(emittedPayload.move.san).toBe('e4');
    });

    test('should detect and handle checkmate', async () => {
      // Setup fool's mate position
      const foolsMateFen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
      await gameState.initializeState('checkmate-game', foolsMateFen);
      await clock.initializeClock('checkmate-game', 300, 300, false);

      const checkMateGame = createMockGame({
        id: 'checkmate-game',
        currentFen: foolsMateFen,
      });
      getGameSpy.mockResolvedValue(checkMateGame);

      // Black plays turn
      isPlayerTurnSpy.mockReturnValue(true);
      getPlayerColorSpy.mockReturnValue('black');

      let endedPayload: any = null;
      events.on('game:ended', (payload) => {
        endedPayload = payload;
      });

      // Qh4# checkmate
      await coordinator.handleMove('black-user', {
        gameId: 'checkmate-game',
        from: 'd8',
        to: 'h4',
      });

      // endGame should have been called
      expect(endGameSpy).toHaveBeenCalled();
    });

    test('should return false for non-active game', async () => {
      getGameSpy.mockResolvedValueOnce(createMockGame({ status: 'completed' }));
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      const result = await coordinator.handleMove('white-user', {
        gameId: 'game-123',
        from: 'e2',
        to: 'e4',
      });

      expect(result).toBe(false);
      expect(sendErrorSpy).toHaveBeenCalledWith('white-user', 'INVALID_GAME', 'Game not active');
    });
  });

  describe('handleResign()', () => {
    test('should end game with opponent as winner', async () => {
      await coordinator.handleResign('white-user', 'game-123');

      expect(endGameSpy).toHaveBeenCalledWith('game-123', 'resignation', 'black-user');
    });

    test('should send error if game not active', async () => {
      getGameSpy.mockResolvedValueOnce(createMockGame({ status: 'completed' }));
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      await coordinator.handleResign('white-user', 'game-123');

      expect(sendErrorSpy).toHaveBeenCalledWith('white-user', 'INVALID_GAME', 'Game not active');
    });

    test('should send error if user not in game', async () => {
      isPlayerInGameSpy.mockReturnValueOnce(false);
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      await coordinator.handleResign('stranger', 'game-123');

      expect(sendErrorSpy).toHaveBeenCalledWith('stranger', 'NOT_IN_GAME', 'You are not in this game');
    });
  });

  describe('handleDrawOffer()', () => {
    test('should notify opponent of draw offer', async () => {
      let emittedPayload: any = null;
      events.on('game:draw_offered', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.handleDrawOffer('white-user', 'game-123');

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.gameId).toBe('game-123');
      expect(emittedPayload.offeredBy).toBe('white-user');
      expect(emittedPayload.opponentId).toBe('black-user');
    });

    test('should send error if game not active', async () => {
      getGameSpy.mockResolvedValueOnce(null);
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      await coordinator.handleDrawOffer('white-user', 'game-123');

      expect(sendErrorSpy).toHaveBeenCalledWith('white-user', 'INVALID_GAME', 'Game not active');
    });
  });

  describe('handleDrawAccept()', () => {
    beforeEach(async () => {
      // Setup draw offer
      await gameState.initializeState('game-123', STARTING_FEN);
      await gameState.setDrawOffer('game-123', 'white-user');
    });

    test('should end game as draw', async () => {
      await coordinator.handleDrawAccept('black-user', 'game-123');

      expect(endGameSpy).toHaveBeenCalledWith('game-123', 'draw', null);
    });

    test('should emit game:draw_accepted event', async () => {
      let emittedPayload: any = null;
      events.on('game:draw_accepted', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.handleDrawAccept('black-user', 'game-123');

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.gameId).toBe('game-123');
      expect(emittedPayload.acceptedBy).toBe('black-user');
    });

    test('should send error if no draw offer exists', async () => {
      await gameState.clearDrawOffer('game-123');
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      await coordinator.handleDrawAccept('black-user', 'game-123');

      expect(sendErrorSpy).toHaveBeenCalledWith('black-user', 'NO_DRAW_OFFER', 'No draw offer to accept');
    });

    test('should send error if trying to accept own draw offer', async () => {
      const sendErrorSpy = spyOn(broadcast, 'sendError');

      await coordinator.handleDrawAccept('white-user', 'game-123'); // Same user who offered

      expect(sendErrorSpy).toHaveBeenCalledWith('white-user', 'NO_DRAW_OFFER', 'No draw offer to accept');
    });
  });

  describe('handleDrawDecline()', () => {
    beforeEach(async () => {
      await gameState.initializeState('game-123', STARTING_FEN);
      await gameState.setDrawOffer('game-123', 'white-user');
    });

    test('should clear draw offer', async () => {
      await coordinator.handleDrawDecline('black-user', 'game-123');

      const offer = await gameState.getDrawOffer('game-123');
      expect(offer).toBeUndefined();
    });

    test('should emit game:draw_declined event', async () => {
      let emittedPayload: any = null;
      events.on('game:draw_declined', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.handleDrawDecline('black-user', 'game-123');

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.declinedBy).toBe('black-user');
      expect(emittedPayload.offeredBy).toBe('white-user');
    });
  });

  describe('leaveGame()', () => {
    test('should remove player from room', async () => {
      const gameId = 'game-123';
      rooms.addPlayer(gameId, 'white-user');

      coordinator.leaveGame('white-user', gameId);

      expect(rooms.getPlayerCount(gameId)).toBe(0);
    });

    test('should clear gameId from WebSocket data', async () => {
      const mockWs = createMockWs();
      mockWs.data.gameId = 'game-123';
      connections.add('white-user', mockWs as any);

      coordinator.leaveGame('white-user', 'game-123');

      expect(mockWs.data.gameId).toBeUndefined();
    });
  });

  describe('joinSpectate()', () => {
    test('should add user to spectator room', async () => {
      const result = await coordinator.joinSpectate('spectator-1', 'game-123');

      expect(result).toBe(true);
      expect(rooms.getSpectatorCount('game-123')).toBe(1);
    });

    test('should return false for non-active game', async () => {
      getGameSpy.mockResolvedValueOnce(createMockGame({ status: 'completed' }));

      const result = await coordinator.joinSpectate('spectator-1', 'game-123');

      expect(result).toBe(false);
    });

    test('should emit spectator:joined event', async () => {
      let emittedPayload: any = null;
      events.on('spectator:joined', (payload) => {
        emittedPayload = payload;
      });

      await coordinator.joinSpectate('spectator-1', 'game-123');

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.userId).toBe('spectator-1');
      expect(emittedPayload.gameId).toBe('game-123');
    });
  });

  describe('leaveSpectate()', () => {
    test('should remove user from spectator room', () => {
      rooms.addSpectator('game-123', 'spectator-1');

      coordinator.leaveSpectate('spectator-1', 'game-123');

      expect(rooms.getSpectatorCount('game-123')).toBe(0);
    });

    test('should emit spectator:left event', () => {
      let emittedPayload: any = null;
      events.on('spectator:left', (payload) => {
        emittedPayload = payload;
      });

      coordinator.leaveSpectate('spectator-1', 'game-123');

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload.userId).toBe('spectator-1');
    });
  });

  describe('handlePing()', () => {
    test('should send pong response', () => {
      const mockWs = createMockWs();
      connections.add('user-123', mockWs as any);

      coordinator.handlePing('user-123');

      expect(mockWs.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('pong');
    });
  });

  describe('getStats()', () => {
    test('should return connection and room statistics', () => {
      // Add some test data
      connections.add('user-1', createMockWs() as any);
      connections.add('user-2', createMockWs() as any);
      rooms.addPlayer('game-1', 'user-1');
      rooms.addPlayer('game-1', 'user-2');
      rooms.addSpectator('game-1', 'spectator-1');
      rooms.addSpectator('game-1', 'spectator-2');

      const stats = coordinator.getStats();

      expect(stats.connections).toBe(2);
      expect(stats.activeGames).toBe(1);
      expect(stats.spectators).toBe(2);
    });
  });
});
