/**
 * Tests for persistence.ts event handlers
 *
 * These tests verify that the REAL persistence handlers correctly call
 * the database service in response to game events.
 *
 * We mock the gameService layer to verify:
 * - Correct arguments are passed to makeMove()
 * - Errors from the DB layer propagate correctly
 * - Handler priority and blocking behavior work as expected
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
import { registerPersistenceHandlers } from './persistence';
import * as gameService from '../../services/game';
import type { Move } from '@chess-game/shared';

// Helper to create a valid Move object
function createMove(overrides: Partial<Move> = {}): Move {
  return {
    from: 'e2',
    to: 'e4',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    timestamp: Date.now(),
    ...overrides,
  };
}

// Mock game record returned by makeMove
const mockGameRecord = {
  id: 'game-123',
  whitePlayerId: 'player-1',
  blackPlayerId: 'player-2',
  status: 'active' as const,
  currentFen: 'test-fen',
  pgn: '1. e4',
  moves: [],
  whiteTimeRemaining: 300,
  blackTimeRemaining: 300,
  wagerAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: new Date(),
  endedAt: null,
  result: null,
  winnerId: null,
  timeControl: 300,
  increment: 0,
};

describe('persistence.ts event handlers', () => {
  let events: GameEventEmitter;
  let makeMovespy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    events = new GameEventEmitter();
    // Mock the gameService.makeMove function
    makeMovespy = spyOn(gameService, 'makeMove').mockResolvedValue(mockGameRecord as any);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('registerPersistenceHandlers()', () => {
    test('should register game:move_made handler at priority 10', async () => {
      // Register the REAL persistence handlers
      registerPersistenceHandlers(events);

      // Track execution order with a test handler
      const executionOrder: string[] = [];

      // Add a handler at priority 50 (like broadcast)
      events.on(
        'game:move_made',
        () => { executionOrder.push('broadcast'); },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      const testMove = createMove();
      await events.emit('game:move_made', {
        gameId: 'game-123',
        playerId: 'player-1',
        move: testMove,
        fen: 'test-fen',
        pgn: '1. e4',
        whiteTime: 300,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      // Persistence handler (priority 10) should have called makeMove
      // before broadcast handler (priority 50) ran
      expect(makeMovespy).toHaveBeenCalled();
      expect(executionOrder).toEqual(['broadcast']);
    });

    test('should be blocking (nonBlocking: false)', async () => {
      registerPersistenceHandlers(events);

      // Make the DB call slow to verify blocking behavior
      let dbCallCompleted = false;
      makeMovespy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        dbCallCompleted = true;
        return mockGameRecord as any;
      });

      let broadcastRanAfterDb = false;
      events.on(
        'game:move_made',
        () => { broadcastRanAfterDb = dbCallCompleted; },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      await events.emit('game:move_made', {
        gameId: 'game-123',
        playerId: 'player-1',
        move: createMove(),
        fen: 'test-fen',
        pgn: '1. e4',
        whiteTime: 300,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      // Broadcast should only run AFTER persistence completes (blocking)
      expect(broadcastRanAfterDb).toBe(true);
    });
  });

  describe('gameService.makeMove() integration', () => {
    test('should call makeMove with correct arguments', async () => {
      registerPersistenceHandlers(events);

      const testMove = createMove({
        from: 'd2',
        to: 'd4',
        san: 'd4',
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
      });

      await events.emit('game:move_made', {
        gameId: 'game-456',
        playerId: 'player-white',
        move: testMove,
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
        pgn: '1. d4',
        whiteTime: 295.75,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      expect(makeMovespy).toHaveBeenCalledTimes(1);
      expect(makeMovespy).toHaveBeenCalledWith(
        'game-456',           // gameId
        testMove,             // move object
        'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1', // fen
        '1. d4',              // pgn
        295,                  // whiteTime (floored from 295.75)
        300                   // blackTime (floored from 300)
      );
    });

    test('should floor fractional time values before passing to makeMove', async () => {
      registerPersistenceHandlers(events);

      await events.emit('game:move_made', {
        gameId: 'game-789',
        playerId: 'player-1',
        move: createMove(),
        fen: 'test-fen',
        pgn: '1. e4',
        whiteTime: 123.999,
        blackTime: 456.001,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      // Verify floored values
      const call = makeMovespy.mock.calls[0];
      expect(call[4]).toBe(123); // whiteTime floored
      expect(call[5]).toBe(456); // blackTime floored
    });

    test('should handle zero time values', async () => {
      registerPersistenceHandlers(events);

      await events.emit('game:move_made', {
        gameId: 'game-timeout',
        playerId: 'player-1',
        move: createMove(),
        fen: 'test-fen',
        pgn: '1. e4',
        whiteTime: 0,
        blackTime: 0.5,
        isGameOver: true,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      const call = makeMovespy.mock.calls[0];
      expect(call[4]).toBe(0); // whiteTime = 0
      expect(call[5]).toBe(0); // blackTime floored from 0.5
    });
  });

  describe('error propagation', () => {
    test('should propagate database errors (blocking handler)', async () => {
      registerPersistenceHandlers(events);

      // Make makeMove throw a database error
      makeMovespy.mockRejectedValue(new Error('Database connection failed'));

      let caughtError: Error | null = null;
      try {
        await events.emit('game:move_made', {
          gameId: 'game-error',
          playerId: 'player-1',
          move: createMove(),
          fen: 'test-fen',
          pgn: '1. e4',
          whiteTime: 300,
          blackTime: 300,
          isGameOver: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
        });
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.message).toBe('Database connection failed');
    });

    test('should prevent subsequent handlers when persistence fails', async () => {
      registerPersistenceHandlers(events);

      // Make makeMove throw
      makeMovespy.mockRejectedValue(new Error('Write failed'));

      let broadcastCalled = false;
      events.on(
        'game:move_made',
        () => { broadcastCalled = true; },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      try {
        await events.emit('game:move_made', {
          gameId: 'game-fail',
          playerId: 'player-1',
          move: createMove(),
          fen: 'test-fen',
          pgn: '1. e4',
          whiteTime: 300,
          blackTime: 300,
          isGameOver: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
        });
      } catch {
        // Expected to throw
      }

      // Broadcast should NOT have been called because persistence failed first
      expect(broadcastCalled).toBe(false);
    });

    test('should propagate "Game not found" error', async () => {
      registerPersistenceHandlers(events);

      makeMovespy.mockRejectedValue(new Error('Game not found'));

      let caughtError: Error | null = null;
      try {
        await events.emit('game:move_made', {
          gameId: 'nonexistent-game',
          playerId: 'player-1',
          move: createMove(),
          fen: 'test-fen',
          pgn: '1. e4',
          whiteTime: 300,
          blackTime: 300,
          isGameOver: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
        });
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError?.message).toBe('Game not found');
    });
  });

  describe('handler execution order with real persistence', () => {
    test('persistence (10) runs before broadcast (50) before analytics (100)', async () => {
      registerPersistenceHandlers(events);

      const order: string[] = [];

      // Track when makeMove is called
      makeMovespy.mockImplementation(async () => {
        order.push('persistence');
        return mockGameRecord as any;
      });

      events.on(
        'game:move_made',
        () => { order.push('broadcast'); },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      events.on(
        'game:move_made',
        () => { order.push('analytics'); },
        { priority: 100, nonBlocking: true, label: 'analytics:test' }
      );

      await events.emit('game:move_made', {
        gameId: 'game-order',
        playerId: 'player-1',
        move: createMove(),
        fen: 'test-fen',
        pgn: '1. e4',
        whiteTime: 300,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      // Wait for non-blocking handlers
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(order[0]).toBe('persistence');
      expect(order[1]).toBe('broadcast');
      // Analytics is non-blocking, might be in different position but should be present
      expect(order).toContain('analytics');
    });
  });

  describe('payload validation', () => {
    test('should pass complete move object to makeMove', async () => {
      registerPersistenceHandlers(events);

      const complexMove = createMove({
        from: 'e1',
        to: 'g1',
        san: 'O-O',
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4',
        flags: 'k', // Kingside castle flag
        piece: 'k',
      });

      await events.emit('game:move_made', {
        gameId: 'game-castle',
        playerId: 'player-white',
        move: complexMove,
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4',
        pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O',
        whiteTime: 280,
        blackTime: 290,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      const passedMove = makeMovespy.mock.calls[0][1];
      expect(passedMove.from).toBe('e1');
      expect(passedMove.to).toBe('g1');
      expect(passedMove.san).toBe('O-O');
      expect(passedMove.flags).toBe('k');
    });
  });
});
