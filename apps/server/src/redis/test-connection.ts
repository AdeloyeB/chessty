/**
 * Quick test script to verify Redis connection.
 * Run with: bun run src/redis/test-connection.ts
 */

import { initRedis, getRedis, shutdownRedis, isRedisAvailable } from './client';

async function testRedisConnection() {
  console.log('=== Redis Connection Test ===\n');

  try {
    // 1. Initialize connection
    console.log('1. Connecting to Redis...');
    await initRedis();

    if (!isRedisAvailable()) {
      console.log('Redis not available (REDIS_URL not set?)');
      return;
    }

    const redis = getRedis()!;

    // 2. Test basic operations
    console.log('\n2. Testing basic operations...');

    // SET
    await redis.set('test:greeting', 'Hello from Chess Game!');
    console.log('   SET test:greeting = "Hello from Chess Game!"');

    // GET
    const greeting = await redis.get('test:greeting');
    console.log(`   GET test:greeting = "${greeting}"`);

    // SET with expiration (60 seconds)
    await redis.setex('test:temporary', 60, 'This expires in 60 seconds');
    console.log('   SETEX test:temporary (60s TTL)');

    // Check TTL
    const ttl = await redis.ttl('test:temporary');
    console.log(`   TTL test:temporary = ${ttl} seconds`);

    // 3. Test hash operations (useful for game state)
    console.log('\n3. Testing hash operations (for game state)...');

    await redis.hset('test:game:123', {
      white: 'player1',
      black: 'player2',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      status: 'active',
    });
    console.log('   HSET test:game:123 (stored game state)');

    const gameState = await redis.hgetall('test:game:123');
    console.log('   HGETALL test:game:123 =', gameState);

    // 4. Cleanup test keys
    console.log('\n4. Cleaning up test keys...');
    await redis.del('test:greeting', 'test:temporary', 'test:game:123');
    console.log('   Deleted test keys');

    // 5. Check memory usage
    console.log('\n5. Redis info...');
    const info = await redis.info('memory');
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
    console.log(`   Memory used: ${usedMemory}`);

    console.log('\n=== All tests passed! Redis is working. ===\n');
  } catch (error) {
    console.error('\n=== Test failed ===');
    console.error(error);
    process.exit(1);
  } finally {
    await shutdownRedis();
  }
}

testRedisConnection();
