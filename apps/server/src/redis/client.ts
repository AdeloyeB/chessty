/**
 * Redis client singleton using ioredis.
 * Reads REDIS_URL from environment.
 *
 * Redis Cloud connection string format:
 * redis://default:password@hostname:port
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

let redisClient: Redis | null = null;

/**
 * Initialize the Redis connection.
 * Call this at server startup.
 */
export async function initRedis(): Promise<void> {
  if (!REDIS_URL) {
    console.warn('[Redis] REDIS_URL not set. Redis features disabled.');
    return;
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Exponential backoff: 50ms, 100ms, 200ms, ... up to 2 seconds
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      // Don't connect immediately - we'll call connect() explicitly
      lazyConnect: true,
    });

    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    // Actually connect
    await redisClient.connect();

    // Test the connection with a ping
    const pong = await redisClient.ping();
    console.log(`[Redis] Ping response: ${pong}`);
  } catch (error) {
    console.error('[Redis] Failed to initialize:', error);
    redisClient = null;
    throw error;
  }
}

/**
 * Get the Redis client instance.
 * Returns null if Redis is not configured or failed to connect.
 */
export function getRedis(): Redis | null {
  return redisClient;
}

/**
 * Check if Redis is available and connected.
 */
export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Gracefully shut down the Redis connection.
 * Call this on server shutdown.
 */
export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed gracefully');
  }
}
