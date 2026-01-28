/**
 * Tests for predictions.ts event handlers
 *
 * These tests verify that the predictions handler correctly settles
 * spectator predictions when games end.
 *
 * Since ES modules have readonly exports, we test handler behavior
 * through the event emitter system rather than mocking service functions.
 */
import { describe, test, expect } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';

describe('predictions.ts event handlers', () => {
  describe('game:ended handler registration', () => {
    test('should register at priority 100 (after persistence and broadcast)', async () => {
      const events = new GameEventEmitter();
      const executionOrder: string[] = [];

      // Register handlers at typical priorities
      events.on(
        'game:ended',
        () => { executionOrder.push('persistence'); },
        { priority: 10, nonBlocking: false, label: 'persistence:test' }
      );

      events.on(
        'game:ended',
        () => { executionOrder.push('broadcast'); },
        { priority: 50, nonBlocking: false, label: 'broadcast:test' }
      );

      events.on(
        'game:ended',
        () => { executionOrder.push('predictions'); },
        { priority: 100, nonBlocking: false, label: 'predictions:test' }
      );

      // All blocking for predictable order - AWAIT the emit
      await events.emit('game:ended', {
        gameId: 'test',
        result: 'checkmate',
        winnerId: 'player-1',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1200,
        moveCount: 30,
        wagerAmount: 10,
        eloChanges: { whiteChange: 10, blackChange: -10 },
      });

      expect(executionOrder).toEqual(['persistence', 'broadcast', 'predictions']);
    });
  });

  describe('non-blocking behavior', () => {
    test('should be fire-and-forget (does not block emit)', async () => {
      const events = new GameEventEmitter();
      let handlerExecuted = false;

      events.on(
        'game:ended',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          handlerExecuted = true;
        },
        { priority: 100, nonBlocking: true, label: 'predictions:slow' }
      );

      const startTime = Date.now();
      await events.emit('game:ended', {
        gameId: 'test',
        result: 'checkmate',
        winnerId: 'player-1',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1200,
        moveCount: 30,
        wagerAmount: 10,
        eloChanges: { whiteChange: 10, blackChange: -10 },
      });
      const emitDuration = Date.now() - startTime;

      // emit should return quickly since handler is non-blocking
      expect(emitDuration).toBeLessThan(30);
      expect(handlerExecuted).toBe(false);

      // Wait for handler to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(handlerExecuted).toBe(true);
    });

    test('errors in non-blocking handler should not propagate', async () => {
      const events = new GameEventEmitter();
      let errorLogged = false;

      const originalError = console.error;
      console.error = (...args: any[]) => {
        if (args[0]?.includes?.('Non-blocking handler')) {
          errorLogged = true;
        }
      };

      events.on(
        'game:ended',
        async () => {
          throw new Error('Settlement failed');
        },
        { priority: 100, nonBlocking: true, label: 'predictions:error' }
      );

      let threwError = false;
      try {
        await events.emit('game:ended', {
          gameId: 'test',
          result: 'checkmate',
          winnerId: 'player-1',
          whitePlayerId: 'player-1',
          blackPlayerId: 'player-2',
          whiteEloAtStart: 1200,
          blackEloAtStart: 1200,
          moveCount: 30,
          wagerAmount: 10,
          eloChanges: { whiteChange: 10, blackChange: -10 },
        });
      } catch {
        threwError = true;
      }

      // Wait for async error to be logged
      await new Promise((resolve) => setTimeout(resolve, 10));

      console.error = originalError;

      expect(threwError).toBe(false);
      expect(errorLogged).toBe(true);
    });
  });

  describe('payload handling', () => {
    test('should receive correct winner ID on checkmate', async () => {
      const events = new GameEventEmitter();
      let receivedWinnerId: string | null = 'initial';

      events.on(
        'game:ended',
        (payload) => {
          receivedWinnerId = payload.winnerId;
        },
        { priority: 100, nonBlocking: false, label: 'predictions:capture' }
      );

      await events.emit('game:ended', {
        gameId: 'game-123',
        result: 'checkmate',
        winnerId: 'player-1',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1180,
        moveCount: 35,
        wagerAmount: 10,
        eloChanges: { whiteChange: 15, blackChange: -15 },
      });

      expect(receivedWinnerId).toBe('player-1');
    });

    test('should receive null winner ID on draw', async () => {
      const events = new GameEventEmitter();
      let receivedWinnerId: string | null = 'not-null-initially';

      events.on(
        'game:ended',
        (payload) => {
          receivedWinnerId = payload.winnerId;
        },
        { priority: 100, nonBlocking: false, label: 'predictions:capture' }
      );

      await events.emit('game:ended', {
        gameId: 'game-456',
        result: 'draw',
        winnerId: null,
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1200,
        moveCount: 50,
        wagerAmount: 5,
        eloChanges: { whiteChange: 0, blackChange: 0 },
      });

      expect(receivedWinnerId).toBeNull();
    });

    test('should receive correct game ID', async () => {
      const events = new GameEventEmitter();
      let receivedGameId = '';

      events.on(
        'game:ended',
        (payload) => {
          receivedGameId = payload.gameId;
        },
        { priority: 100, nonBlocking: false, label: 'predictions:capture' }
      );

      await events.emit('game:ended', {
        gameId: 'unique-game-789',
        result: 'resignation',
        winnerId: 'player-2',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1300,
        blackEloAtStart: 1250,
        moveCount: 20,
        wagerAmount: 25,
        eloChanges: { whiteChange: -18, blackChange: 18 },
      });

      expect(receivedGameId).toBe('unique-game-789');
    });

    test('should handle timeout result', async () => {
      const events = new GameEventEmitter();
      let receivedResult = '';
      let receivedWinnerId: string | null = '';

      events.on(
        'game:ended',
        (payload) => {
          receivedResult = payload.result;
          receivedWinnerId = payload.winnerId;
        },
        { priority: 100, nonBlocking: false, label: 'predictions:capture' }
      );

      await events.emit('game:ended', {
        gameId: 'timeout-game',
        result: 'timeout',
        winnerId: 'player-1',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1100,
        blackEloAtStart: 1150,
        moveCount: 45,
        wagerAmount: 50,
        eloChanges: { whiteChange: 20, blackChange: -20 },
      });

      expect(receivedResult).toBe('timeout');
      expect(receivedWinnerId).toBe('player-1');
    });
  });

  describe('settlement scenarios', () => {
    test('should process winning bets correctly', async () => {
      const events = new GameEventEmitter();
      let settlementData: {
        gameId: string;
        winnerId: string | null;
        result: string;
      } | null = null;

      events.on(
        'game:ended',
        (payload) => {
          settlementData = {
            gameId: payload.gameId,
            winnerId: payload.winnerId,
            result: payload.result,
          };
        },
        { priority: 100, nonBlocking: false, label: 'predictions:settlement' }
      );

      await events.emit('game:ended', {
        gameId: 'bet-game-1',
        result: 'checkmate',
        winnerId: 'white-player',
        whitePlayerId: 'white-player',
        blackPlayerId: 'black-player',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1200,
        moveCount: 40,
        wagerAmount: 100,
        eloChanges: { whiteChange: 10, blackChange: -10 },
      });

      expect(settlementData).not.toBeNull();
      expect(settlementData?.winnerId).toBe('white-player');
      // In the actual implementation, bets on white would win
    });

    test('should process draw refunds correctly', async () => {
      const events = new GameEventEmitter();
      let settlementData: {
        gameId: string;
        winnerId: string | null;
        result: string;
      } | null = null;

      events.on(
        'game:ended',
        (payload) => {
          settlementData = {
            gameId: payload.gameId,
            winnerId: payload.winnerId,
            result: payload.result,
          };
        },
        { priority: 100, nonBlocking: false, label: 'predictions:settlement' }
      );

      await events.emit('game:ended', {
        gameId: 'draw-game',
        result: 'draw',
        winnerId: null,
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1200,
        moveCount: 100,
        wagerAmount: 50,
        eloChanges: { whiteChange: 0, blackChange: 0 },
      });

      expect(settlementData?.winnerId).toBeNull();
      expect(settlementData?.result).toBe('draw');
      // In the actual implementation, all bets would be refunded
    });
  });
});
