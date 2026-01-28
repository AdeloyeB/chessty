/**
 * Database mock utilities for testing
 *
 * Since the services use Drizzle ORM with Neon PostgreSQL,
 * we need to mock the db module for unit tests.
 */
import { mock, spyOn } from 'bun:test';

/**
 * Creates a mock database with common operations
 */
export function createMockDb() {
  return {
    query: {
      users: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      games: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      challenges: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      transactions: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      sessions: {
        findFirst: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
      },
      mfaEnrollments: {
        findFirst: mock(() => Promise.resolve(null)),
      },
    },
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{}])),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([{}])),
        })),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{}])),
      })),
    })),
    transaction: mock(async (fn: (tx: any) => Promise<any>) => {
      // Execute the transaction function with a mock tx
      const tx = createMockDb();
      return await fn(tx);
    }),
  };
}

/**
 * Helper to set up mock return values
 */
export function mockDbReturn(mockFn: any, value: any) {
  mockFn.mockResolvedValueOnce(value);
}
