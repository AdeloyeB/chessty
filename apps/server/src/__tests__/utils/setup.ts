/**
 * Global test setup
 */
import { beforeAll, afterAll } from 'bun:test';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup
});

export {}; // Make this a module
