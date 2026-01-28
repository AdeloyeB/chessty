/**
 * Shared test fixtures for all tests
 */
import { nanoid } from 'nanoid';

export const TEST_USER = {
  id: 'test-user-1',
  username: 'testplayer',
  email: 'test@example.com',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  balance: '1000',
  elo: 1200,
  rank: 'intermediate',
  gamesPlayed: 0,
  gamesWon: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const TEST_GAME = {
  id: 'test-game-1',
  whitePlayerId: 'test-user-1',
  blackPlayerId: 'test-user-2',
  status: 'active' as const,
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn: '',
  moves: [],
  wagerAmount: '10',
  whiteTimeRemaining: 300,
  blackTimeRemaining: 300,
  increment: 5,
  result: null,
  winnerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const TEST_CHALLENGE = {
  id: 'test-challenge-1',
  creatorId: 'test-user-1',
  acceptedById: null,
  status: 'open' as const,
  wagerAmount: '10',
  timeControl: 300,
  increment: 5,
  creatorConfirmed: false,
  acceptorConfirmed: false,
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function createTestUser(overrides?: Partial<typeof TEST_USER>) {
  return {
    ...TEST_USER,
    id: `test-user-${nanoid(8)}`,
    email: `test-${nanoid(8)}@example.com`,
    username: `player_${nanoid(8)}`,
    ...overrides
  };
}

export function createTestGame(overrides?: Partial<typeof TEST_GAME>) {
  return {
    ...TEST_GAME,
    id: `test-game-${nanoid(8)}`,
    ...overrides
  };
}

export function createTestChallenge(overrides?: Partial<typeof TEST_CHALLENGE>) {
  return {
    ...TEST_CHALLENGE,
    id: `test-challenge-${nanoid(8)}`,
    ...overrides
  };
}
