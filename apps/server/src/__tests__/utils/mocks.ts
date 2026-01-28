/**
 * Mock utilities for testing
 */
import { mock } from 'bun:test';

export function createMockRedis() {
  return {
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    hget: mock(() => Promise.resolve(null)),
    hset: mock(() => Promise.resolve(1)),
    hgetall: mock(() => Promise.resolve({})),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
    hsetnx: mock(() => Promise.resolve(1)),
    evalsha: mock(() => Promise.resolve(['300', '300', '0'])),
    script: mock(() => Promise.resolve('abc123')),
    ping: mock(() => Promise.resolve('PONG')),
  };
}

export function createMockWebSocket() {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState: 1,
    data: { userId: 'test-user-1' },
  };
}

export function createMockBroadcastService() {
  return {
    sendToUser: mock(() => {}),
    sendToRoom: mock(() => {}),
    sendToGame: mock(() => {}),
  };
}
