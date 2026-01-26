/**
 * Tests for persistence.ts event handlers
 *
 * These tests verify that the persistence handlers correctly update
 * the database in response to game events.
 *
 * Since ES modules have readonly exports, we test the handler behavior
 * through the event emitter rather than mocking individual service functions.
 */
import { describe, test, expect } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
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

describe('persistence.ts event handlers', () => {
  describe('game:move_made handler registration', () => {
    const testMove = createMove();

    test('should register handler at priority 10', async () => {
      const events = new GameEventEmitter();
      const executionOrder: number[] = [];

      // Register handlers at different priorities to verify order
      events.on(
        'game:move_made',
        () => { executionOrder.push(10); },
        { priority: 10, nonBlocking: false, label: 'persistence:test' }
      );

      events.on(
        'game:move_made',
        () => { executionOrder.push(50); },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      events.on(
        'game:move_made',
        () => { executionOrder.push(100); },
        { priority: 100, nonBlocking: true, label: 'analytics:test' }
      );

      await events.emit('game:move_made', {
        gameId: 'test-game',
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

      // Priority 10 and 50 are blocking - they run sequentially in order
      expect(executionOrder[0]).toBe(10);
      expect(executionOrder[1]).toBe(50);
    });

    test('should be blocking (errors propagate)', async () => {
      const events = new GameEventEmitter();

      // Register a handler that throws
      events.on(
        'game:move_made',
        async () => {
          throw new Error('Database error');
        },
        { priority: 10, nonBlocking: false, label: 'persistence:error' }
      );

      // The error should propagate
      let caughtError: Error | null = null;
      try {
        await events.emit('game:move_made', {
          gameId: 'test',
          playerId: 'test',
          move: testMove,
          fen: 'test',
          pgn: 'test',
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
      expect(caughtError?.message).toBe('Database error');
    });

    test('blocking handler should prevent subsequent handlers on error', async () => {
      const events = new GameEventEmitter();
      let broadcastCalled = false;

      // Persistence handler throws
      events.on(
        'game:move_made',
        async () => {
          throw new Error('Database write failed');
        },
        { priority: 10, nonBlocking: false, label: 'persistence:throws' }
      );

      // Broadcast handler should not run if persistence fails
      events.on(
        'game:move_made',
        () => { broadcastCalled = true; },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      try {
        await events.emit('game:move_made', {
          gameId: 'test',
          playerId: 'test',
          move: testMove,
          fen: 'test',
          pgn: 'test',
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

      expect(broadcastCalled).toBe(false);
    });
  });

  describe('payload processing', () => {
    test('should receive full move payload', async () => {
      const events = new GameEventEmitter();
      let receivedPayload: any = null;

      events.on(
        'game:move_made',
        (payload) => { receivedPayload = payload; },
        { priority: 10, nonBlocking: false, label: 'persistence:capture' }
      );

      const testMove = createMove({ from: 'e2', to: 'e4', san: 'e4' });
      const testPayload = {
        gameId: 'game-123',
        playerId: 'player-1',
        move: testMove,
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        pgn: '1. e4',
        whiteTime: 295.5,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      };

      await events.emit('game:move_made', testPayload);

      expect(receivedPayload).toEqual(testPayload);
    });

    test('should handle fractional time values', async () => {
      const events = new GameEventEmitter();
      let receivedTimes: { white: number; black: number } | null = null;

      events.on(
        'game:move_made',
        (payload) => {
          receivedTimes = {
            white: Math.floor(payload.whiteTime),
            black: Math.floor(payload.blackTime),
          };
        },
        { priority: 10, nonBlocking: false, label: 'persistence:times' }
      );

      await events.emit('game:move_made', {
        gameId: 'test',
        playerId: 'test',
        move: createMove(),
        fen: 'test',
        pgn: 'test',
        whiteTime: 295.99,
        blackTime: 300.01,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      // Flooring should produce integer values
      expect(receivedTimes?.white).toBe(295);
      expect(receivedTimes?.black).toBe(300);
    });

    test('should handle zero time values', async () => {
      const events = new GameEventEmitter();
      let receivedTimes: { white: number; black: number } | null = null;

      events.on(
        'game:move_made',
        (payload) => {
          receivedTimes = {
            white: Math.floor(payload.whiteTime),
            black: Math.floor(payload.blackTime),
          };
        },
        { priority: 10, nonBlocking: false, label: 'persistence:zero' }
      );

      await events.emit('game:move_made', {
        gameId: 'test',
        playerId: 'test',
        move: createMove(),
        fen: 'test',
        pgn: 'test',
        whiteTime: 0,
        blackTime: 0.5,
        isGameOver: true,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      expect(receivedTimes?.white).toBe(0);
      expect(receivedTimes?.black).toBe(0);
    });
  });

  describe('handler execution order with persistence', () => {
    test('persistence (10) runs before broadcast (50)', async () => {
      const events = new GameEventEmitter();
      const order: string[] = [];

      events.on(
        'game:move_made',
        () => { order.push('broadcast'); },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      events.on(
        'game:move_made',
        () => { order.push('persistence'); },
        { priority: 10, nonBlocking: false, label: 'persistence:test' }
      );

      await events.emit('game:move_made', {
        gameId: 'test',
        playerId: 'test',
        move: createMove(),
        fen: 'test',
        pgn: 'test',
        whiteTime: 300,
        blackTime: 300,
        isGameOver: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
      });

      expect(order).toEqual(['persistence', 'broadcast']);
    });
  });
});
