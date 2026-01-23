/**
 * Redis client singleton using ioredis.
 * Reads REDIS_URL from environment (default: redis://localhost:6379).
 *
 * NOTE: ioredis is not yet installed. Run `pnpm add ioredis` when ready to use.
 * This file is prepared for the Redis state extraction phase.
 */

// import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: any | null = null;

/**
 * Initialize the Redis connection.
 * Call this at server startup when Redis is ready to be used.
 */
export async function initRedis(): Promise<void> {
  // Uncomment when ioredis is installed:
  // const Redis = (await import('ioredis')).default;
  // redisClient = new Redis(REDIS_URL, {
  //   maxRetriesPerRequest: 3,
  //   retryStrategy(times) {
  //     const delay = Math.min(times * 50, 2000);
  //     return delay;
  //   },
  //   lazyConnect: true,
  // });
  //
  // redisClient.on('error', (err: Error) => {
  //   console.error('[Redis] Connection error:', err.message);
  // });
  //
  // redisClient.on('connect', () => {
  //   console.log('[Redis] Connected to', REDIS_URL);
  // });
  //
  // await redisClient.connect();

  console.log('[Redis] Client initialization prepared (not yet connected)');
}

/**
 * Get the Redis client instance.
 * Throws if Redis has not been initialized.
 */
export function getRedis(): any {
  if (!redisClient) {
    throw new Error('[Redis] Client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

/**
 * Gracefully shut down the Redis connection.
 * Call this on server shutdown.
 */
export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    // await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed');
  }
}
