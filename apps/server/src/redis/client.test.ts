/**
 * Tests for Redis client connection
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initRedis, getRedis, isRedisAvailable, shutdownRedis } from './client';

describe('Redis Client', () => {
  beforeAll(async () => {
    await initRedis();
  });

  afterAll(async () => {
    await shutdownRedis();
  });

  test('should connect to Redis', () => {
    expect(isRedisAvailable()).toBe(true);
  });

  test('should return Redis client instance', () => {
    const redis = getRedis();
    expect(redis).not.toBeNull();
  });

  test('should respond to PING', async () => {
    const redis = getRedis();
    if (!redis) throw new Error('Redis not available');

    const response = await redis.ping();
    expect(response).toBe('PONG');
  });

  test('should set and get a value', async () => {
    const redis = getRedis();
    if (!redis) throw new Error('Redis not available');

    const testKey = 'test:client:value';
    const testValue = 'hello-redis';

    await redis.set(testKey, testValue);
    const result = await redis.get(testKey);

    expect(result).toBe(testValue);

    // Cleanup
    await redis.del(testKey);
  });

  test('should handle hash operations', async () => {
    const redis = getRedis();
    if (!redis) throw new Error('Redis not available');

    const hashKey = 'test:client:hash';

    await redis.hset(hashKey, {
      field1: 'value1',
      field2: 'value2',
    });

    const result = await redis.hgetall(hashKey);

    expect(result.field1).toBe('value1');
    expect(result.field2).toBe('value2');

    // Cleanup
    await redis.del(hashKey);
  });

  test('should handle key expiration (TTL)', async () => {
    const redis = getRedis();
    if (!redis) throw new Error('Redis not available');

    const testKey = 'test:client:ttl';

    await redis.setex(testKey, 60, 'expires-in-60s');
    const ttl = await redis.ttl(testKey);

    expect(ttl).toBeGreaterThan(55);
    expect(ttl).toBeLessThanOrEqual(60);

    // Cleanup
    await redis.del(testKey);
  });
});
