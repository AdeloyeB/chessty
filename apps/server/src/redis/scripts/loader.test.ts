/**
 * Tests for Lua Script Loader
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initRedis, getRedis, shutdownRedis, isRedisAvailable } from '../client';
import {
  loadClockScripts,
  areScriptsLoaded,
  initializeGameClock,
  getClockState,
  executeClockTick,
  executeClockMove,
  deleteGameClock,
} from './loader';

describe('Lua Script Loader', () => {
  const testGameId = 'test-game-lua-' + Date.now();

  beforeAll(async () => {
    await initRedis();
    if (isRedisAvailable()) {
      await loadClockScripts();
    }
  });

  afterAll(async () => {
    // Cleanup test data
    const redis = getRedis();
    if (redis) {
      await redis.del(`clock:${testGameId}`);
    }
    await shutdownRedis();
  });

  test('should load Lua scripts successfully', () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }
    expect(areScriptsLoaded()).toBe(true);
  });

  test('should initialize game clock', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    await initializeGameClock(testGameId, 300, 300, Date.now());

    const state = await getClockState(testGameId);
    expect(state).not.toBeNull();
    expect(state?.whiteTime).toBe(300);
    expect(state?.blackTime).toBe(300);
    expect(state?.isWhiteTurn).toBe(true);
  });

  test('should get clock state', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    const state = await getClockState(testGameId);

    expect(state).not.toBeNull();
    expect(typeof state?.whiteTime).toBe('number');
    expect(typeof state?.blackTime).toBe('number');
    expect(typeof state?.lastUpdate).toBe('number');
    expect(typeof state?.isWhiteTurn).toBe('boolean');
  });

  test('should return null for non-existent game', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    const state = await getClockState('non-existent-game-12345');
    expect(state).toBeNull();
  });

  test('should execute clock tick', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    // Re-initialize with fresh time
    await initializeGameClock(testGameId, 300, 300, Date.now());

    // Wait a bit and tick
    await new Promise((r) => setTimeout(r, 100));

    const result = await executeClockTick(testGameId, Date.now());

    expect(result.timedOut).toBe(false);
    // White's time should have decreased (they're the active player)
    expect(result.whiteTime).toBeLessThan(300);
    expect(result.blackTime).toBe(300); // Black unchanged
  });

  test('should execute clock move (switch turns)', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    // Re-initialize
    await initializeGameClock(testGameId, 300, 300, Date.now());

    // Execute a move with 5 second increment
    const result = await executeClockMove(testGameId, 5, Date.now());

    // After move, it should be black's turn
    const state = await getClockState(testGameId);
    expect(state?.isWhiteTurn).toBe(false);

    // White should have gained increment (minus any elapsed time)
    expect(result.whiteTime).toBeGreaterThanOrEqual(300);
  });

  test('should delete game clock', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    // Ensure clock exists
    await initializeGameClock(testGameId, 300, 300, Date.now());

    let state = await getClockState(testGameId);
    expect(state).not.toBeNull();

    // Delete it
    await deleteGameClock(testGameId);

    state = await getClockState(testGameId);
    expect(state).toBeNull();
  });

  test('should detect timeout', async () => {
    if (!isRedisAvailable()) {
      console.log('Skipping: Redis not available');
      return;
    }

    const timeoutGameId = 'test-timeout-' + Date.now();

    // Initialize with very low time
    await initializeGameClock(timeoutGameId, 0.1, 300, Date.now());

    // Wait for time to elapse
    await new Promise((r) => setTimeout(r, 200));

    const result = await executeClockTick(timeoutGameId, Date.now());

    expect(result.timedOut).toBe(true);
    expect(result.timedOutColor).toBe('white');

    // Cleanup
    await deleteGameClock(timeoutGameId);
  });
});
