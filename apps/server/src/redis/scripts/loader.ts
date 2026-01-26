/**
 * Redis Lua Script Loader
 *
 * Loads Lua scripts into Redis on startup and provides typed functions
 * to execute them using EVALSHA (more efficient than EVAL since the script
 * is cached server-side).
 *
 * How it works:
 * 1. On startup, we read the .lua files from disk
 * 2. We use SCRIPT LOAD to upload them to Redis
 * 3. Redis returns a SHA1 hash for each script
 * 4. We use EVALSHA with the hash to run scripts (faster than sending full script each time)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getRedis, isRedisAvailable } from '../client';

// Get the directory where this file lives (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store the SHA hashes after loading
let clockTickSha: string | null = null;
let clockMoveSha: string | null = null;

/**
 * Load the Lua scripts into Redis.
 * Call this once at server startup after Redis connects.
 *
 * @throws Error if Redis is not available or scripts fail to load
 */
export async function loadClockScripts(): Promise<void> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot load scripts: Redis is not available. ' +
        'Make sure REDIS_URL is set and initRedis() was called.'
    );
  }

  try {
    // Read the Lua script files from disk
    const clockTickScript = readFileSync(
      join(__dirname, 'clock_tick.lua'),
      'utf-8'
    );
    const clockMoveScript = readFileSync(
      join(__dirname, 'clock_move.lua'),
      'utf-8'
    );

    // Load scripts into Redis and get their SHA hashes
    // SCRIPT LOAD returns the SHA1 hash of the script
    clockTickSha = (await redis.script('LOAD', clockTickScript)) as string;
    clockMoveSha = (await redis.script('LOAD', clockMoveScript)) as string;

    console.log('[ScriptLoader] Lua scripts loaded successfully');
    console.log(`[ScriptLoader]   clock_tick.lua -> ${clockTickSha}`);
    console.log(`[ScriptLoader]   clock_move.lua -> ${clockMoveSha}`);
  } catch (error) {
    clockTickSha = null;
    clockMoveSha = null;
    throw new Error(
      `[ScriptLoader] Failed to load Lua scripts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if scripts have been loaded.
 */
export function areScriptsLoaded(): boolean {
  return clockTickSha !== null && clockMoveSha !== null;
}

/**
 * Execute the clock tick script.
 *
 * This decrements the active player's clock based on elapsed time since
 * the last update. It's atomic - no race conditions possible.
 *
 * @param gameId - The game ID (used to construct the Redis key)
 * @param currentTimeMs - Current timestamp in milliseconds (Date.now())
 * @returns Updated clock state and timeout information
 * @throws Error if Redis unavailable, scripts not loaded, or clock state missing
 */
export async function executeClockTick(
  gameId: string,
  currentTimeMs: number
): Promise<{
  whiteTime: number;
  blackTime: number;
  timedOut: boolean;
  timedOutColor: 'white' | 'black' | null;
}> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot execute clock tick: Redis is not available'
    );
  }

  if (!clockTickSha) {
    throw new Error(
      '[ScriptLoader] Cannot execute clock tick: Scripts not loaded. Call loadClockScripts() first.'
    );
  }

  const clockKey = `clock:${gameId}`;

  try {
    // EVALSHA runs the cached script by its SHA hash
    // Arguments: sha, numKeys, key1, arg1
    const result = (await redis.evalsha(
      clockTickSha,
      1, // Number of KEYS arguments
      clockKey, // KEYS[1]
      currentTimeMs.toString() // ARGV[1]
    )) as string[];

    // Parse the result array: [whiteTime, blackTime, timedOut]
    const whiteTime = parseFloat(result[0]);
    const blackTime = parseFloat(result[1]);
    const timedOutCode = parseInt(result[2], 10);

    // Convert timeout code to friendly format
    // 0 = no timeout, 1 = white timed out, 2 = black timed out
    let timedOut = false;
    let timedOutColor: 'white' | 'black' | null = null;

    if (timedOutCode === 1) {
      timedOut = true;
      timedOutColor = 'white';
    } else if (timedOutCode === 2) {
      timedOut = true;
      timedOutColor = 'black';
    }

    return { whiteTime, blackTime, timedOut, timedOutColor };
  } catch (error) {
    // Check if it's a "NOSCRIPT" error (script was flushed from Redis cache)
    if (
      error instanceof Error &&
      error.message.includes('NOSCRIPT')
    ) {
      console.warn(
        '[ScriptLoader] Script cache miss - reloading scripts'
      );
      await loadClockScripts();
      // Retry once after reloading
      return executeClockTick(gameId, currentTimeMs);
    }
    throw error;
  }
}

/**
 * Execute the clock move script.
 *
 * This handles what happens when a player makes a move:
 * 1. Decrements the moving player's clock by elapsed time
 * 2. Adds the increment (Fischer time control)
 * 3. Switches the turn to the other player
 *
 * All done atomically - no race conditions.
 *
 * @param gameId - The game ID (used to construct the Redis key)
 * @param incrementSeconds - Time to add after the move (Fischer increment)
 * @param currentTimeMs - Current timestamp in milliseconds (Date.now())
 * @returns Updated clock times for both players
 * @throws Error if Redis unavailable, scripts not loaded, or clock state missing
 */
export async function executeClockMove(
  gameId: string,
  incrementSeconds: number,
  currentTimeMs: number
): Promise<{ whiteTime: number; blackTime: number }> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot execute clock move: Redis is not available'
    );
  }

  if (!clockMoveSha) {
    throw new Error(
      '[ScriptLoader] Cannot execute clock move: Scripts not loaded. Call loadClockScripts() first.'
    );
  }

  const clockKey = `clock:${gameId}`;

  try {
    // EVALSHA runs the cached script by its SHA hash
    const result = (await redis.evalsha(
      clockMoveSha,
      1, // Number of KEYS arguments
      clockKey, // KEYS[1]
      currentTimeMs.toString(), // ARGV[1]
      incrementSeconds.toString() // ARGV[2]
    )) as string[];

    // Parse the result array: [whiteTime, blackTime]
    const whiteTime = parseFloat(result[0]);
    const blackTime = parseFloat(result[1]);

    return { whiteTime, blackTime };
  } catch (error) {
    // Check if it's a "NOSCRIPT" error (script was flushed from Redis cache)
    if (
      error instanceof Error &&
      error.message.includes('NOSCRIPT')
    ) {
      console.warn(
        '[ScriptLoader] Script cache miss - reloading scripts'
      );
      await loadClockScripts();
      // Retry once after reloading
      return executeClockMove(gameId, incrementSeconds, currentTimeMs);
    }
    throw error;
  }
}

/**
 * Initialize clock state in Redis for a new game.
 *
 * This sets up the initial clock hash with starting times.
 * Must be called before using executeClockTick or executeClockMove.
 *
 * @param gameId - The game ID
 * @param whiteTimeSeconds - White's starting time in seconds
 * @param blackTimeSeconds - Black's starting time in seconds
 * @param currentTimeMs - Current timestamp in milliseconds
 */
export async function initializeGameClock(
  gameId: string,
  whiteTimeSeconds: number,
  blackTimeSeconds: number,
  currentTimeMs: number
): Promise<void> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot initialize clock: Redis is not available'
    );
  }

  const clockKey = `clock:${gameId}`;

  // Set all clock fields atomically using HSET with multiple field-value pairs
  await redis.hset(clockKey, {
    whiteTime: whiteTimeSeconds.toString(),
    blackTime: blackTimeSeconds.toString(),
    lastUpdate: currentTimeMs.toString(),
    isWhiteTurn: '1', // White moves first in chess
  });

  console.log(
    `[ScriptLoader] Initialized clock for game ${gameId}: ${whiteTimeSeconds}s each`
  );
}

/**
 * Get the current clock state from Redis without modifying it.
 *
 * Useful for syncing clients or debugging.
 *
 * @param gameId - The game ID
 * @returns Current clock state or null if not found
 */
export async function getClockState(
  gameId: string
): Promise<{
  whiteTime: number;
  blackTime: number;
  lastUpdate: number;
  isWhiteTurn: boolean;
} | null> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot get clock state: Redis is not available'
    );
  }

  const clockKey = `clock:${gameId}`;
  const data = await redis.hgetall(clockKey);

  // Check if the hash exists (empty object if not found)
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    whiteTime: parseFloat(data.whiteTime),
    blackTime: parseFloat(data.blackTime),
    lastUpdate: parseInt(data.lastUpdate, 10),
    isWhiteTurn: data.isWhiteTurn === '1',
  };
}

/**
 * Delete clock state for a game (cleanup after game ends).
 *
 * @param gameId - The game ID
 */
export async function deleteGameClock(gameId: string): Promise<void> {
  const redis = getRedis();

  if (!redis || !isRedisAvailable()) {
    throw new Error(
      '[ScriptLoader] Cannot delete clock: Redis is not available'
    );
  }

  const clockKey = `clock:${gameId}`;
  await redis.del(clockKey);
  console.log(`[ScriptLoader] Deleted clock for game ${gameId}`);
}
