import { CLOCK_SYNC_INTERVAL } from '@chess-game/shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { GameEventEmitter } from '../events/GameEventEmitter';
import { getRedis, isRedisAvailable } from '../redis/client';
import { CircuitBreaker } from '../redis/circuitBreaker';

// Redis key TTL: 24 hours (games should not last this long)
const CLOCK_KEY_TTL = 86400;

export interface ClockState {
  whiteTime: number;
  blackTime: number;
  lastUpdate: number;
  isWhiteTurn: boolean;
}

/**
 * Result from the clock tick Lua script.
 */
interface ClockTickResult {
  whiteTime: number;
  blackTime: number;
  /** 0 = no timeout, 1 = white timed out, 2 = black timed out */
  timedOut: 0 | 1 | 2;
}

/**
 * Result from the clock move Lua script.
 */
interface ClockMoveResult {
  whiteTime: number;
  blackTime: number;
}

/**
 * Manages clock intervals and clock state for active games.
 * Emits clock:tick and game:timeout events.
 *
 * Architecture:
 * - Primary storage: Redis (survives server restarts, enables multi-server)
 * - Fallback: In-memory cache (used when Redis is unavailable)
 * - Intervals: Always run locally on this server instance
 * - Lua scripts: Used for atomic clock operations in Redis
 *
 * Redis Data Structure:
 *   Key: "clock:{gameId}"
 *   Type: Hash
 *   Fields: whiteTime, blackTime, lastUpdate, isWhiteTurn
 *   TTL: 24 hours
 */
export class ClockManager {
  // In-memory fallback cache (also used for local intervals)
  private gameClocks = new Map<string, ClockState>();
  // Map of gameId -> interval timer (always local)
  private clockIntervals = new Map<string, ReturnType<typeof setInterval>>();
  // Circuit breaker for Redis operations
  private circuitBreaker = new CircuitBreaker({
    name: 'ClockManager-Redis',
    failureThreshold: 3,
    resetTimeout: 15000, // 15 seconds
  });
  // Lua script SHAs (loaded once at first use)
  private clockTickSha: string | null = null;
  private clockMoveSha: string | null = null;
  private scriptsLoaded = false;

  constructor(private events: GameEventEmitter) {}

  /**
   * Load Lua scripts into Redis.
   * Called lazily on first Redis operation.
   */
  private async loadScripts(): Promise<void> {
    if (this.scriptsLoaded) return;

    const redis = getRedis();
    if (!redis) return;

    try {
      // Read script files from the redis/scripts directory
      const scriptsDir = join(__dirname, '..', 'redis', 'scripts');
      const clockTickScript = readFileSync(join(scriptsDir, 'clock_tick.lua'), 'utf-8');
      const clockMoveScript = readFileSync(join(scriptsDir, 'clock_move.lua'), 'utf-8');

      // Load scripts into Redis (returns SHA hash for EVALSHA)
      this.clockTickSha = await redis.script('LOAD', clockTickScript) as string;
      this.clockMoveSha = await redis.script('LOAD', clockMoveScript) as string;

      this.scriptsLoaded = true;
      console.log('[ClockManager] Lua scripts loaded');
    } catch (error) {
      console.error('[ClockManager] Failed to load Lua scripts:', error);
      // Don't throw - we'll fall back to in-memory
    }
  }

  /**
   * Build the Redis key for a game's clock.
   */
  private getClockKey(gameId: string): string {
    return `clock:${gameId}`;
  }

  /**
   * Save clock state to Redis.
   * Returns true if successful, false if fallback to in-memory.
   */
  private async saveToRedis(gameId: string, state: ClockState): Promise<boolean> {
    if (!isRedisAvailable()) return false;

    const redis = getRedis()!;
    const key = this.getClockKey(gameId);

    return this.circuitBreaker.execute(
      async () => {
        await redis.hset(key, {
          whiteTime: state.whiteTime.toString(),
          blackTime: state.blackTime.toString(),
          lastUpdate: state.lastUpdate.toString(),
          isWhiteTurn: state.isWhiteTurn ? '1' : '0',
        });
        await redis.expire(key, CLOCK_KEY_TTL);
        return true;
      },
      () => {
        console.warn(`[ClockManager] Redis save failed for ${gameId}, using in-memory`);
        return false;
      }
    );
  }

  /**
   * Load clock state from Redis.
   * Returns the state if found, undefined if not found or Redis unavailable.
   */
  private async loadFromRedis(gameId: string): Promise<ClockState | undefined> {
    if (!isRedisAvailable()) return undefined;

    const redis = getRedis()!;
    const key = this.getClockKey(gameId);

    return this.circuitBreaker.execute(
      async () => {
        const data = await redis.hgetall(key);
        if (!data || !data.whiteTime) return undefined;

        return {
          whiteTime: parseFloat(data.whiteTime),
          blackTime: parseFloat(data.blackTime),
          lastUpdate: parseInt(data.lastUpdate, 10),
          isWhiteTurn: data.isWhiteTurn === '1',
        };
      },
      () => {
        console.warn(`[ClockManager] Redis load failed for ${gameId}, using in-memory`);
        return undefined;
      }
    );
  }

  /**
   * Delete clock state from Redis.
   */
  private async deleteFromRedis(gameId: string): Promise<void> {
    if (!isRedisAvailable()) return;

    const redis = getRedis()!;
    const key = this.getClockKey(gameId);

    try {
      await redis.del(key);
    } catch (error) {
      console.warn(`[ClockManager] Failed to delete Redis key for ${gameId}:`, error);
    }
  }

  /**
   * Execute clock tick via Lua script (atomic operation).
   * Falls back to in-memory calculation if Redis unavailable.
   */
  private async executeRedisClockTick(gameId: string, now: number): Promise<ClockTickResult | null> {
    if (!isRedisAvailable() || !this.clockTickSha) return null;

    const redis = getRedis()!;
    const key = this.getClockKey(gameId);

    return this.circuitBreaker.execute(
      async () => {
        const result = await redis.evalsha(
          this.clockTickSha!,
          1,
          key,
          now.toString()
        ) as string[];

        return {
          whiteTime: parseFloat(result[0]),
          blackTime: parseFloat(result[1]),
          timedOut: parseInt(result[2], 10) as 0 | 1 | 2,
        };
      },
      () => {
        console.warn(`[ClockManager] Redis tick failed for ${gameId}, using in-memory`);
        return null;
      }
    );
  }

  /**
   * Execute clock move (switch turn + increment) via Lua script.
   * Falls back to in-memory calculation if Redis unavailable.
   */
  private async executeRedisClockMove(
    gameId: string,
    now: number,
    increment: number
  ): Promise<ClockMoveResult | null> {
    if (!isRedisAvailable() || !this.clockMoveSha) return null;

    const redis = getRedis()!;
    const key = this.getClockKey(gameId);

    return this.circuitBreaker.execute(
      async () => {
        const result = await redis.evalsha(
          this.clockMoveSha!,
          1,
          key,
          now.toString(),
          increment.toString()
        ) as string[];

        return {
          whiteTime: parseFloat(result[0]),
          blackTime: parseFloat(result[1]),
        };
      },
      () => {
        console.warn(`[ClockManager] Redis move failed for ${gameId}, using in-memory`);
        return null;
      }
    );
  }

  /**
   * Sync in-memory state to Redis (recovery after Redis comes back online).
   */
  private async syncToRedis(gameId: string): Promise<void> {
    const localState = this.gameClocks.get(gameId);
    if (!localState) return;

    const saved = await this.saveToRedis(gameId, localState);
    if (saved) {
      console.log(`[ClockManager] Synced ${gameId} to Redis after recovery`);
    }
  }

  /**
   * Initialize clock state for a game.
   * Stores in both Redis (primary) and in-memory (fallback).
   */
  async initializeClock(
    gameId: string,
    whiteTime: number,
    blackTime: number,
    isWhiteTurn: boolean
  ): Promise<void> {
    // Load Lua scripts on first use
    await this.loadScripts();

    const state: ClockState = {
      whiteTime,
      blackTime,
      lastUpdate: Date.now(),
      isWhiteTurn,
    };

    // Always store in-memory (needed for interval callbacks)
    this.gameClocks.set(gameId, state);

    // Also save to Redis
    await this.saveToRedis(gameId, state);
  }

  /**
   * Start the clock interval for a game.
   * Emits clock:tick every CLOCK_SYNC_INTERVAL and game:timeout if time runs out.
   *
   * The interval runs locally on this server instance but updates Redis
   * for persistence and multi-server scenarios.
   */
  startClock(
    gameId: string,
    increment: number,
    getWinnerId: (gameId: string, losingColor: 'white' | 'black') => Promise<string | null>
  ): void {
    this.events.emit('clock:started', { gameId, increment });

    const interval = setInterval(async () => {
      const now = Date.now();
      let whiteTime: number;
      let blackTime: number;
      let timedOut: 0 | 1 | 2 = 0;

      // Try Redis first (atomic tick via Lua script)
      const redisResult = await this.executeRedisClockTick(gameId, now);

      if (redisResult) {
        // Redis succeeded - update local cache for consistency
        whiteTime = redisResult.whiteTime;
        blackTime = redisResult.blackTime;
        timedOut = redisResult.timedOut;

        // Update local cache
        const localClock = this.gameClocks.get(gameId);
        if (localClock) {
          localClock.whiteTime = whiteTime;
          localClock.blackTime = blackTime;
          localClock.lastUpdate = now;
        }
      } else {
        // Fallback to in-memory calculation
        const clock = this.gameClocks.get(gameId);
        if (!clock) {
          clearInterval(interval);
          return;
        }

        const elapsed = (now - clock.lastUpdate) / 1000;

        if (clock.isWhiteTurn) {
          clock.whiteTime = Math.max(0, clock.whiteTime - elapsed);
        } else {
          clock.blackTime = Math.max(0, clock.blackTime - elapsed);
        }
        clock.lastUpdate = now;

        whiteTime = clock.whiteTime;
        blackTime = clock.blackTime;

        // Determine timeout
        if (whiteTime <= 0) timedOut = 1;
        else if (blackTime <= 0) timedOut = 2;

        // Try to sync back to Redis if it becomes available
        if (this.circuitBreaker.getState() === 'closed') {
          this.syncToRedis(gameId).catch((err) => {
            console.warn(`[ClockManager] Background sync to Redis failed for game ${gameId}:`, err);
          });
        }
      }

      // Check for timeout
      if (timedOut !== 0) {
        // Stop interval immediately to prevent multiple timeout emissions
        clearInterval(interval);
        this.clockIntervals.delete(gameId);

        const losingColor: 'white' | 'black' = timedOut === 1 ? 'white' : 'black';
        const winnerId = await getWinnerId(gameId, losingColor);
        if (winnerId) {
          await this.events.emit('game:timeout', { gameId, losingColor, winnerId });
        }
        return;
      }

      // Emit clock tick
      this.events.emit('clock:tick', {
        gameId,
        whiteTime,
        blackTime,
      });
    }, CLOCK_SYNC_INTERVAL);

    this.clockIntervals.set(gameId, interval);
  }

  /**
   * Stop the clock for a game.
   * Clears the interval but keeps the state (for resume or final state queries).
   */
  stopClock(gameId: string): void {
    const interval = this.clockIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.clockIntervals.delete(gameId);
    }
    this.events.emit('clock:stopped', { gameId });
  }

  /**
   * Add increment to the player who just moved and switch turn.
   * Uses Lua script for atomicity in Redis, with in-memory fallback.
   */
  async switchTurn(gameId: string, increment: number): Promise<void> {
    const now = Date.now();

    // Try Redis first (atomic operation via Lua script)
    const redisResult = await this.executeRedisClockMove(gameId, now, increment);

    if (redisResult) {
      // Update local cache for consistency
      const localClock = this.gameClocks.get(gameId);
      if (localClock) {
        localClock.whiteTime = redisResult.whiteTime;
        localClock.blackTime = redisResult.blackTime;
        localClock.isWhiteTurn = !localClock.isWhiteTurn;
        localClock.lastUpdate = now;
      }
    } else {
      // Fallback to in-memory
      const clock = this.gameClocks.get(gameId);
      if (!clock) return;

      // Calculate elapsed time since last update
      const elapsed = (now - clock.lastUpdate) / 1000;

      // Decrement the moving player's time, then add increment
      if (clock.isWhiteTurn) {
        clock.whiteTime = Math.max(0, clock.whiteTime - elapsed) + increment;
      } else {
        clock.blackTime = Math.max(0, clock.blackTime - elapsed) + increment;
      }

      clock.isWhiteTurn = !clock.isWhiteTurn;
      clock.lastUpdate = now;

      // Try to sync to Redis
      if (this.circuitBreaker.getState() === 'closed') {
        this.syncToRedis(gameId).catch((err) => {
          console.warn(`[ClockManager] Background sync to Redis failed for game ${gameId}:`, err);
        });
      }
    }
  }

  /**
   * Get the current clock state for a game.
   * Tries Redis first, falls back to in-memory cache.
   */
  async getClockState(gameId: string): Promise<ClockState | undefined> {
    // Try Redis first
    const redisState = await this.loadFromRedis(gameId);
    if (redisState) {
      // Update local cache
      this.gameClocks.set(gameId, redisState);
      return redisState;
    }

    // Fall back to in-memory
    return this.gameClocks.get(gameId);
  }

  /**
   * Get clock state synchronously from in-memory cache.
   * Use this when you need immediate access without Redis latency.
   * May be slightly stale if Redis has newer data.
   */
  getClockStateSync(gameId: string): ClockState | undefined {
    return this.gameClocks.get(gameId);
  }

  /**
   * Clean up clock state for a game.
   * Removes from both Redis and in-memory.
   */
  async cleanup(gameId: string): Promise<void> {
    this.stopClock(gameId);
    this.gameClocks.delete(gameId);
    await this.deleteFromRedis(gameId);
  }

  /**
   * Restore clock state from Redis on server restart.
   * Call this at startup for any games that were in progress.
   */
  async restoreFromRedis(gameId: string): Promise<boolean> {
    const state = await this.loadFromRedis(gameId);
    if (state) {
      this.gameClocks.set(gameId, state);
      console.log(`[ClockManager] Restored clock for ${gameId} from Redis`);
      return true;
    }
    return false;
  }
}
