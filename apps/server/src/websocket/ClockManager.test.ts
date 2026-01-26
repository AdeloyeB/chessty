/**
 * Tests for ClockManager
 *
 * ClockManager manages chess game clocks with:
 * - In-memory storage (primary when Redis unavailable)
 * - Redis storage (for persistence and multi-server scenarios)
 * - Circuit breaker pattern for Redis failures
 * - Lua scripts for atomic operations
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { ClockManager, type ClockState } from './ClockManager';
import { GameEventEmitter } from '../events/GameEventEmitter';
import * as redisClient from '../redis/client';
import * as scriptLoader from '../redis/scripts/loader';

// Mock Redis client
const mockRedis = {
  hset: mock(() => Promise.resolve(1)),
  hget: mock(() => Promise.resolve(null)),
  hgetall: mock(() => Promise.resolve({})),
  hsetnx: mock(() => Promise.resolve(1)),
  expire: mock(() => Promise.resolve(1)),
  del: mock(() => Promise.resolve(1)),
  evalsha: mock(() => Promise.resolve(['300', '300', '0'])),
};

describe('ClockManager', () => {
  let clockManager: ClockManager;
  let events: GameEventEmitter;
  let isRedisAvailableSpy: ReturnType<typeof spyOn>;
  let getRedisSpy: ReturnType<typeof spyOn>;
  let areScriptsLoadedSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create fresh event emitter
    events = new GameEventEmitter();

    // Mock Redis as unavailable by default (tests focus on in-memory behavior)
    isRedisAvailableSpy = spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
    getRedisSpy = spyOn(redisClient, 'getRedis').mockReturnValue(null);
    areScriptsLoadedSpy = spyOn(scriptLoader, 'areScriptsLoaded').mockReturnValue(false);
    spyOn(scriptLoader, 'loadClockScripts').mockResolvedValue(undefined);

    // Create ClockManager
    clockManager = new ClockManager(events);
  });

  afterEach(() => {
    // Clean up any running intervals
    events.removeAllHandlers();
    mock.restore();
  });

  describe('initializeClock()', () => {
    test('should store clock state with correct initial values', async () => {
      const gameId = 'test-game-1';
      const whiteTime = 300; // 5 minutes
      const blackTime = 300;
      const isWhiteTurn = true;

      await clockManager.initializeClock(gameId, whiteTime, blackTime, isWhiteTurn);

      // Verify state is stored
      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      expect(state!.whiteTime).toBe(300);
      expect(state!.blackTime).toBe(300);
      expect(state!.isWhiteTurn).toBe(true);
      expect(state!.lastUpdate).toBeGreaterThan(0);
    });

    test('should initialize with black to move if specified', async () => {
      const gameId = 'test-game-2';

      await clockManager.initializeClock(gameId, 600, 600, false);

      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      expect(state!.isWhiteTurn).toBe(false);
    });

    test('should support different initial times for each player', async () => {
      const gameId = 'test-game-3';

      // Odds game: white has more time
      await clockManager.initializeClock(gameId, 600, 300, true);

      const state = clockManager.getClockStateSync(gameId);
      expect(state!.whiteTime).toBe(600);
      expect(state!.blackTime).toBe(300);
    });

    test('should attempt to save to Redis when available', async () => {
      // Enable Redis for this test
      isRedisAvailableSpy.mockReturnValue(true);
      getRedisSpy.mockReturnValue(mockRedis as any);

      const gameId = 'test-game-redis';
      await clockManager.initializeClock(gameId, 300, 300, true);

      // Verify Redis hset was called
      expect(mockRedis.hset).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    test('should fall back to in-memory if Redis unavailable', async () => {
      // Redis is unavailable (default mock)
      const gameId = 'test-game-fallback';
      await clockManager.initializeClock(gameId, 300, 300, true);

      // Should still have state in-memory
      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      expect(state!.whiteTime).toBe(300);
    });
  });

  describe('startClock() and tick()', () => {
    test('should emit clock:started event when starting', async () => {
      const gameId = 'test-game-start';
      await clockManager.initializeClock(gameId, 300, 300, true);

      let startedPayload: any = null;
      events.on('clock:started', (payload) => {
        startedPayload = payload;
      });

      const mockGetWinnerId = mock(() => Promise.resolve('winner-id'));
      clockManager.startClock(gameId, 5, mockGetWinnerId);

      // Event should be emitted synchronously
      expect(startedPayload).toEqual({ gameId, increment: 5 });

      // Clean up
      clockManager.stopClock(gameId);
    });

    test('should emit clock:tick events periodically', async () => {
      const gameId = 'test-game-tick';
      await clockManager.initializeClock(gameId, 300, 300, true);

      const tickPayloads: any[] = [];
      events.on('clock:tick', (payload) => {
        tickPayloads.push(payload);
      });

      const mockGetWinnerId = mock(() => Promise.resolve('winner-id'));
      clockManager.startClock(gameId, 5, mockGetWinnerId);

      // Wait for a tick (CLOCK_SYNC_INTERVAL is 1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(tickPayloads.length).toBeGreaterThan(0);
      expect(tickPayloads[0].gameId).toBe(gameId);
      expect(tickPayloads[0].whiteTime).toBeLessThanOrEqual(300);
      expect(tickPayloads[0].blackTime).toBe(300); // Black's time unchanged (white's turn)

      // Clean up
      clockManager.stopClock(gameId);
    });

    test('should decrement active player clock on tick', async () => {
      const gameId = 'test-game-decrement';
      await clockManager.initializeClock(gameId, 10, 10, true); // White to move

      const mockGetWinnerId = mock(() => Promise.resolve('winner-id'));
      clockManager.startClock(gameId, 0, mockGetWinnerId);

      // Wait for a tick (CLOCK_SYNC_INTERVAL is 1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      // White's time should have decreased (by about 1 second)
      expect(state!.whiteTime).toBeLessThan(10);
      // Black's time should be unchanged
      expect(state!.blackTime).toBe(10);

      // Clean up
      clockManager.stopClock(gameId);
    });

    test('should emit timeout event when clock reaches zero', async () => {
      const gameId = 'test-game-timeout';
      // Initialize with very little time (less than one tick interval)
      await clockManager.initializeClock(gameId, 0.5, 10, true); // White has 500ms

      let timeoutPayload: any = null;
      events.on('game:timeout', (payload) => {
        timeoutPayload = payload;
      });

      const mockGetWinnerId = mock(() => Promise.resolve('black-wins'));
      clockManager.startClock(gameId, 0, mockGetWinnerId);

      // Wait for timeout (first tick after 1s will trigger timeout since 0.5s is below threshold)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(timeoutPayload).not.toBeNull();
      expect(timeoutPayload.gameId).toBe(gameId);
      expect(timeoutPayload.losingColor).toBe('white');
      expect(timeoutPayload.winnerId).toBe('black-wins');
    });
  });

  describe('switchTurn()', () => {
    test('should add increment to moving player and switch turn', async () => {
      const gameId = 'test-game-switch';
      await clockManager.initializeClock(gameId, 300, 300, true); // White to move

      // Simulate some time passing, then switch turn
      await new Promise((resolve) => setTimeout(resolve, 50));
      await clockManager.switchTurn(gameId, 5); // 5 second increment

      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      // Turn should have switched to black
      expect(state!.isWhiteTurn).toBe(false);
      // White should have roughly: 300 - elapsed + 5 increment
      // Time should be around 305 minus a small elapsed amount
      expect(state!.whiteTime).toBeLessThanOrEqual(305);
      expect(state!.whiteTime).toBeGreaterThan(304); // Should have gained increment
    });

    test('should switch turn from black to white', async () => {
      const gameId = 'test-game-switch-btw';
      await clockManager.initializeClock(gameId, 300, 300, false); // Black to move

      await clockManager.switchTurn(gameId, 3);

      const state = clockManager.getClockStateSync(gameId);
      expect(state!.isWhiteTurn).toBe(true);
    });

    test('should handle zero increment', async () => {
      const gameId = 'test-game-no-increment';
      await clockManager.initializeClock(gameId, 300, 300, true);

      await clockManager.switchTurn(gameId, 0);

      const state = clockManager.getClockStateSync(gameId);
      expect(state!.isWhiteTurn).toBe(false);
      // White's time should only have decreased (no increment added)
      expect(state!.whiteTime).toBeLessThanOrEqual(300);
    });
  });

  describe('stopClock()', () => {
    test('should stop clock interval and emit clock:stopped', async () => {
      const gameId = 'test-game-stop';
      await clockManager.initializeClock(gameId, 300, 300, true);

      let stoppedPayload: any = null;
      events.on('clock:stopped', (payload) => {
        stoppedPayload = payload;
      });

      const mockGetWinnerId = mock(() => Promise.resolve('winner-id'));
      clockManager.startClock(gameId, 5, mockGetWinnerId);
      clockManager.stopClock(gameId);

      expect(stoppedPayload).toEqual({ gameId });

      // Wait to ensure no more ticks happen (wait longer than tick interval)
      const stateBeforeWait = clockManager.getClockStateSync(gameId);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const stateAfterWait = clockManager.getClockStateSync(gameId);

      // Time should not have changed after stopping (or only changed minimally due to initial tick)
      // The important thing is that no new ticks occurred after stopping
      expect(stateAfterWait!.whiteTime).toBe(stateBeforeWait!.whiteTime);
    });
  });

  describe('getClockState()', () => {
    test('should return current clock state', async () => {
      const gameId = 'test-game-get';
      await clockManager.initializeClock(gameId, 300, 300, true);

      const state = await clockManager.getClockState(gameId);
      expect(state).toBeDefined();
      expect(state!.whiteTime).toBe(300);
      expect(state!.blackTime).toBe(300);
      expect(state!.isWhiteTurn).toBe(true);
      expect(state!.lastUpdate).toBeGreaterThan(0);
    });

    test('should return undefined for non-existent game', async () => {
      const state = await clockManager.getClockState('non-existent-game');
      expect(state).toBeUndefined();
    });
  });

  describe('getClockStateSync()', () => {
    test('should return in-memory clock state', async () => {
      const gameId = 'test-game-sync';
      await clockManager.initializeClock(gameId, 300, 300, true);

      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      expect(state!.whiteTime).toBe(300);
    });

    test('should return undefined for non-existent game', () => {
      const state = clockManager.getClockStateSync('non-existent');
      expect(state).toBeUndefined();
    });
  });

  describe('cleanup()', () => {
    test('should remove clock state and stop interval', async () => {
      const gameId = 'test-game-cleanup';
      await clockManager.initializeClock(gameId, 300, 300, true);

      const mockGetWinnerId = mock(() => Promise.resolve('winner-id'));
      clockManager.startClock(gameId, 5, mockGetWinnerId);

      await clockManager.cleanup(gameId);

      // State should be removed
      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeUndefined();
    });
  });

  describe('restoreFromRedis()', () => {
    test('should restore state from Redis when available', async () => {
      const gameId = 'test-game-restore';

      // Enable Redis and mock it to return existing state
      isRedisAvailableSpy.mockReturnValue(true);
      getRedisSpy.mockReturnValue(mockRedis as any);
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteTime: '250',
        blackTime: '280',
        lastUpdate: String(Date.now()),
        isWhiteTurn: '0',
      });

      const restored = await clockManager.restoreFromRedis(gameId);

      expect(restored).toBe(true);
      const state = clockManager.getClockStateSync(gameId);
      expect(state).toBeDefined();
      expect(state!.whiteTime).toBe(250);
      expect(state!.blackTime).toBe(280);
      expect(state!.isWhiteTurn).toBe(false);
    });

    test('should return false if no state in Redis', async () => {
      const gameId = 'test-game-no-restore';

      // Enable Redis but return empty state
      isRedisAvailableSpy.mockReturnValue(true);
      getRedisSpy.mockReturnValue(mockRedis as any);
      mockRedis.hgetall.mockResolvedValueOnce({});

      const restored = await clockManager.restoreFromRedis(gameId);

      expect(restored).toBe(false);
    });
  });
});
