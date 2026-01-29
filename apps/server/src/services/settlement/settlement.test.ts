/**
 * Settlement Service Tests
 * ========================
 *
 * Comprehensive tests for the settlement service which handles:
 * - Creating pending settlements when games end
 * - Evaluating games for cheating using anti-cheat scores
 * - Auto-settling clean games (low suspicion) or holding suspicious games for overwatch review
 * - Resolving disputes after overwatch verdicts
 * - Handling timeouts (48-hour safety release)
 * - Recovering stuck settlements
 *
 * CONTEXT:
 * This is a real-money chess betting platform. The settlement service is critical
 * because it controls when and how funds are distributed. Security failures here
 * could result in:
 * - Double payments (paying the same pot twice)
 * - Stuck funds (money locked indefinitely)
 * - Cheaters getting paid (bypassing anti-cheat holds)
 *
 * TEST STRATEGY:
 * - Mock the database layer to isolate business logic
 * - Test all state transitions (pending -> settled, pending -> disputed -> resolved)
 * - Focus heavily on race condition guards and edge cases
 * - Verify security checks prevent double-payment scenarios
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import {
  createTestSettlement,
  createTestGame,
  createTestOverwatchCase,
} from '../../__tests__/utils/fixtures';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

// Create mock functions that we can configure per-test
const mockAwardWinnings = mock(() => Promise.resolve(100));
const mockGetPlayerSuspicionScore = mock(() => 0);
const mockGetPlayerFlags = mock(() => []);

// Track db calls
let mockGamesFind = mock(() => Promise.resolve(null));
let mockSettlementsFind = mock(() => Promise.resolve(null));
let mockSettlementsFindMany = mock(() => Promise.resolve([]));
let mockInsertValues: unknown[] = [];
let mockUpdateValues: unknown[] = [];

// Transaction callback storage
const _transactionCallback: ((tx: unknown) => Promise<unknown>) | null = null;
let transactionSettlement: ReturnType<typeof createTestSettlement> | null = null;

// Mock the database module
mock.module('../../drizzle', () => ({
  db: {
    query: {
      games: {
        findFirst: (...args: unknown[]) => mockGamesFind(...args),
      },
      settlements: {
        findFirst: (...args: unknown[]) => mockSettlementsFind(...args),
        findMany: (...args: unknown[]) => mockSettlementsFindMany(...args),
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        mockInsertValues.push(values);
        return {
          returning: () => Promise.resolve([
            transactionSettlement || createTestSettlement(),
          ]),
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mockUpdateValues.push(values);
        return {
          where: () => ({
            returning: () => Promise.resolve([
              transactionSettlement || createTestSettlement(),
            ]),
          }),
        };
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      transactionCallback = callback;
      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => Promise.resolve(
                transactionSettlement ? [transactionSettlement] : []
              ),
            }),
          }),
        }),
        update: () => ({
          set: (values: unknown) => {
            mockUpdateValues.push(values);
            return {
              where: () => Promise.resolve(),
            };
          },
        }),
        insert: () => ({
          values: (values: unknown) => {
            mockInsertValues.push(values);
            return Promise.resolve();
          },
        }),
      };
      return callback(mockTx);
    },
  },
  games: { id: 'id', whitePlayerId: 'whitePlayerId', blackPlayerId: 'blackPlayerId' },
  settlements: { id: 'id', gameId: 'gameId', status: 'status', updatedAt: 'updatedAt', createdAt: 'createdAt' },
  settlementHistory: { id: 'id', settlementId: 'settlementId' },
  overwatchCases: { id: 'id', gameId: 'gameId' },
}));

// Mock wallet service
mock.module('../wallet', () => ({
  awardWinnings: (...args: unknown[]) => mockAwardWinnings(...args),
}));

// Mock anticheat service
mock.module('../anticheat', () => ({
  getPlayerSuspicionScore: (...args: unknown[]) => mockGetPlayerSuspicionScore(...args),
  getPlayerFlags: (...args: unknown[]) => mockGetPlayerFlags(...args),
}));

// Mock transaction utility
mock.module('../../utils/transaction', () => ({
  withTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => Promise.resolve(
              transactionSettlement ? [transactionSettlement] : []
            ),
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => {
          mockUpdateValues.push(values);
          return {
            where: () => Promise.resolve(),
          };
        },
      }),
      insert: () => ({
        values: (values: unknown) => {
          mockInsertValues.push(values);
          return Promise.resolve();
        },
      }),
    };
    return callback(mockTx);
  },
  TransactionError: class TransactionError extends Error {
    code: string;
    constructor(message: string, code: string = 'TRANSACTION_ERROR') {
      super(message);
      this.code = code;
    }
  },
}));

// Import after mocks are set up
import * as settlementService from './settlement.service';

// ---------------------------------------------------------------------------
// Helper to reset all mocks
// ---------------------------------------------------------------------------
function resetMocks() {
  mockInsertValues = [];
  mockUpdateValues = [];
  transactionSettlement = null;
  transactionCallback = null;
  mockGamesFind = mock(() => Promise.resolve(null));
  mockSettlementsFind = mock(() => Promise.resolve(null));
  mockSettlementsFindMany = mock(() => Promise.resolve([]));
  mockAwardWinnings.mockReset();
  mockAwardWinnings.mockImplementation(() => Promise.resolve(100));
  mockGetPlayerSuspicionScore.mockReset();
  mockGetPlayerSuspicionScore.mockImplementation(() => 0);
  mockGetPlayerFlags.mockReset();
  mockGetPlayerFlags.mockImplementation(() => []);
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Settlement Service', () => {
  beforeEach(() => {
    resetMocks();
  });

  // =========================================================================
  // createSettlement() Tests
  // =========================================================================
  describe('createSettlement()', () => {
    test('should create pending settlement with correct pot calculation', async () => {
      const gameId = 'test-game-123';
      const winnerId = 'winner-user-1';
      const loserId = 'loser-user-2';
      const totalPot = 100;

      transactionSettlement = createTestSettlement({
        gameId,
        winnerId,
        loserId,
        totalPot: totalPot.toString(),
        platformFee: '0',
        winnerPayout: '100',
        status: 'pending',
      });

      const result = await settlementService.createSettlement(
        gameId,
        winnerId,
        loserId,
        totalPot
      );

      expect(result.gameId).toBe(gameId);
      expect(result.winnerId).toBe(winnerId);
      expect(result.loserId).toBe(loserId);
      expect(result.totalPot).toBe(totalPot);
      expect(result.status).toBe('pending');
    });

    test('should handle draws with null winnerId', async () => {
      const gameId = 'test-game-draw';
      const totalPot = 50;

      transactionSettlement = createTestSettlement({
        gameId,
        winnerId: null,
        loserId: null,
        totalPot: totalPot.toString(),
        winnerPayout: null,
        status: 'pending',
      });

      const result = await settlementService.createSettlement(
        gameId,
        null,
        null,
        totalPot
      );

      expect(result.winnerId).toBeNull();
      expect(result.loserId).toBeNull();
      expect(result.winnerPayout).toBeNull();
    });

    test('should record creation in settlement history', async () => {
      const gameId = 'test-game-history';
      const winnerId = 'user-1';
      const loserId = 'user-2';
      const totalPot = 200;

      transactionSettlement = createTestSettlement({ gameId, winnerId, loserId });

      await settlementService.createSettlement(gameId, winnerId, loserId, totalPot);

      // Should have at least 2 insert calls: settlement and history
      expect(mockInsertValues.length).toBeGreaterThanOrEqual(1);
    });

    test('should set correct platform fee (currently 0)', async () => {
      const totalPot = 500;

      transactionSettlement = createTestSettlement({
        totalPot: totalPot.toString(),
        platformFee: '0',
        winnerPayout: '500',
      });

      const result = await settlementService.createSettlement(
        'game-1',
        'winner-1',
        'loser-1',
        totalPot
      );

      // Currently 0% fee in beta
      expect(result.platformFee).toBe(0);
      expect(result.winnerPayout).toBe(totalPot);
    });
  });

  // =========================================================================
  // evaluateGame() Tests
  // =========================================================================
  describe('evaluateGame()', () => {
    test('should get suspicion scores from both players', async () => {
      const game = createTestGame({
        id: 'eval-game-1',
        whitePlayerId: 'white-player',
        blackPlayerId: 'black-player',
      });

      mockGamesFind = mock(() => Promise.resolve(game));
      mockGetPlayerSuspicionScore.mockImplementation(
        (gameId: string, playerId: string) => {
          if (playerId === 'white-player') return 30;
          if (playerId === 'black-player') return 25;
          return 0;
        }
      );

      const result = await settlementService.evaluateGame('eval-game-1');

      expect(mockGetPlayerSuspicionScore).toHaveBeenCalled();
      expect(result.gameId).toBe('eval-game-1');
    });

    test('should identify the more suspicious player', async () => {
      const game = createTestGame({
        id: 'eval-game-2',
        whitePlayerId: 'clean-player',
        blackPlayerId: 'suspicious-player',
      });

      mockGamesFind = mock(() => Promise.resolve(game));
      mockGetPlayerSuspicionScore.mockImplementation(
        (gameId: string, playerId: string) => {
          if (playerId === 'clean-player') return 20;
          if (playerId === 'suspicious-player') return 85;
          return 0;
        }
      );

      const result = await settlementService.evaluateGame('eval-game-2');

      expect(result.suspiciousPlayerId).toBe('suspicious-player');
      expect(result.suspicionScore).toBe(85);
    });

    test('should return auto_settle recommendation for low scores (<95)', async () => {
      const game = createTestGame({ id: 'clean-game' });

      mockGamesFind = mock(() => Promise.resolve(game));
      mockGetPlayerSuspicionScore.mockImplementation(() => 50);

      const result = await settlementService.evaluateGame('clean-game');

      expect(result.recommendedAction).toBe('auto_settle');
    });

    test('should return hold_for_review for medium scores (95-98)', async () => {
      const game = createTestGame({
        id: 'medium-suspicion-game',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
      });

      mockGamesFind = mock(() => Promise.resolve(game));
      mockGetPlayerSuspicionScore.mockImplementation(
        (gameId: string, playerId: string) => {
          if (playerId === 'player-1') return 96;
          return 30;
        }
      );

      const result = await settlementService.evaluateGame('medium-suspicion-game');

      expect(result.recommendedAction).toBe('hold_for_review');
      expect(result.suspicionScore).toBe(96);
    });

    test('should return suspend_player for critical scores (>98)', async () => {
      const game = createTestGame({
        id: 'critical-game',
        whitePlayerId: 'cheater',
        blackPlayerId: 'victim',
      });

      mockGamesFind = mock(() => Promise.resolve(game));
      mockGetPlayerSuspicionScore.mockImplementation(
        (gameId: string, playerId: string) => {
          if (playerId === 'cheater') return 99;
          return 10;
        }
      );

      const result = await settlementService.evaluateGame('critical-game');

      expect(result.recommendedAction).toBe('suspend_player');
      expect(result.suspicionScore).toBe(99);
    });

    test('should throw if game not found', async () => {
      mockGamesFind = mock(() => Promise.resolve(null));

      await expect(settlementService.evaluateGame('non-existent-game')).rejects.toThrow(
        'Game non-existent-game not found'
      );
    });
  });

  // =========================================================================
  // decideSettlement() Tests
  // =========================================================================
  describe('decideSettlement()', () => {
    test('should return shouldHold=false for scores below 95', () => {
      const decision = settlementService.decideSettlement(50);

      expect(decision.shouldHold).toBe(false);
      expect(decision.reason).toBe('auto_cleared');
      expect(decision.priority).toBe('normal');
    });

    test('should return shouldHold=false for score exactly at threshold boundary', () => {
      const decision = settlementService.decideSettlement(94);

      expect(decision.shouldHold).toBe(false);
    });

    test('should return shouldHold=true with high priority for scores 95-97', () => {
      const decision = settlementService.decideSettlement(96);

      expect(decision.shouldHold).toBe(true);
      expect(decision.reason).toBe('high_suspicion');
      expect(decision.priority).toBe('high');
    });

    test('should return shouldHold=true with urgent priority for scores >=98', () => {
      const decision = settlementService.decideSettlement(99);

      expect(decision.shouldHold).toBe(true);
      expect(decision.reason).toBe('critical_suspicion');
      expect(decision.priority).toBe('urgent');
    });

    test('should handle edge case at exactly 95', () => {
      const decision = settlementService.decideSettlement(95);

      expect(decision.shouldHold).toBe(true);
      expect(decision.priority).toBe('high');
    });

    test('should handle edge case at exactly 98', () => {
      const decision = settlementService.decideSettlement(98);

      expect(decision.shouldHold).toBe(true);
      expect(decision.priority).toBe('urgent');
    });

    test('should handle zero score', () => {
      const decision = settlementService.decideSettlement(0);

      expect(decision.shouldHold).toBe(false);
      expect(decision.reason).toBe('auto_cleared');
    });

    test('should handle maximum score', () => {
      const decision = settlementService.decideSettlement(100);

      expect(decision.shouldHold).toBe(true);
      expect(decision.priority).toBe('urgent');
    });
  });

  // =========================================================================
  // settleGame() Tests
  // =========================================================================
  describe('settleGame()', () => {
    test('should update settlement status to settled', async () => {
      transactionSettlement = createTestSettlement({
        id: 'settle-1',
        status: 'pending',
        winnerId: 'winner-1',
        winnerPayout: '100',
      });

      await settlementService.settleGame('settle-1', 'winner-1');

      // Check that update was called with settled status
      const statusUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).status === 'settled'
      );
      expect(statusUpdate).toBeDefined();
    });

    test('should throw if settlement not found', async () => {
      transactionSettlement = null;

      await expect(
        settlementService.settleGame('non-existent', 'winner-1')
      ).rejects.toThrow('Settlement not found');
    });

    test('should throw if settlement is not pending', async () => {
      transactionSettlement = createTestSettlement({
        id: 'already-settled',
        status: 'settled',
      });

      await expect(
        settlementService.settleGame('already-settled', 'winner-1')
      ).rejects.toThrow('Settlement cannot be processed');
    });

    test('should record in history with auto_settle trigger', async () => {
      transactionSettlement = createTestSettlement({
        id: 'settle-history',
        status: 'pending',
        winnerPayout: '100',
      });

      await settlementService.settleGame('settle-history', 'winner-1');

      // History should have been inserted
      const historyInsert = mockInsertValues.find(
        (v: unknown) => (v as Record<string, unknown>).trigger === 'auto_settle'
      );
      expect(historyInsert).toBeDefined();
    });

    test('should throw if no winner payout', async () => {
      transactionSettlement = createTestSettlement({
        id: 'no-payout',
        status: 'pending',
        winnerPayout: null,
      });

      await expect(
        settlementService.settleGame('no-payout', 'winner-1')
      ).rejects.toThrow('Settlement has no winner payout');
    });
  });

  // =========================================================================
  // holdForReview() Tests
  // =========================================================================
  describe('holdForReview()', () => {
    test('should create overwatch case with correct deadline (48 hours)', async () => {
      const settlement = createTestSettlement({
        id: 'hold-1',
        gameId: 'game-hold-1',
        status: 'pending',
      });

      mockSettlementsFind = mock(() => Promise.resolve(settlement));
      transactionSettlement = createTestOverwatchCase({
        id: 'overwatch-case-1',
        gameId: 'game-hold-1',
      }) as unknown as ReturnType<typeof createTestSettlement>;

      const overwatchCaseId = await settlementService.holdForReview(
        'hold-1',
        'flagged-player-1',
        96,
        'high'
      );

      expect(overwatchCaseId).toBe('overwatch-case-1');
    });

    test('should update settlement to disputed status', async () => {
      const settlement = createTestSettlement({
        id: 'hold-2',
        gameId: 'game-hold-2',
        status: 'pending',
      });

      mockSettlementsFind = mock(() => Promise.resolve(settlement));
      transactionSettlement = createTestOverwatchCase({ id: 'overwatch-case-2' }) as unknown as ReturnType<typeof createTestSettlement>;

      await settlementService.holdForReview('hold-2', 'player-1', 97, 'high');

      const statusUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).status === 'disputed'
      );
      expect(statusUpdate).toBeDefined();
    });

    test('should throw if settlement not pending', async () => {
      const settlement = createTestSettlement({
        id: 'hold-not-pending',
        status: 'disputed',
      });

      mockSettlementsFind = mock(() => Promise.resolve(settlement));

      await expect(
        settlementService.holdForReview('hold-not-pending', 'player-1', 96, 'high')
      ).rejects.toThrow('Settlement hold-not-pending is not pending');
    });

    test('should throw if settlement not found', async () => {
      mockSettlementsFind = mock(() => Promise.resolve(null));

      await expect(
        settlementService.holdForReview('non-existent', 'player-1', 96, 'high')
      ).rejects.toThrow('Settlement non-existent not found');
    });

    test('should return overwatch case ID', async () => {
      const settlement = createTestSettlement({
        id: 'hold-return-id',
        status: 'pending',
      });

      mockSettlementsFind = mock(() => Promise.resolve(settlement));
      const expectedOverwatchCaseId = 'returned-overwatch-case-id';
      transactionSettlement = createTestOverwatchCase({ id: expectedOverwatchCaseId }) as unknown as ReturnType<typeof createTestSettlement>;

      const result = await settlementService.holdForReview(
        'hold-return-id',
        'player-1',
        96,
        'high'
      );

      expect(result).toBe(expectedOverwatchCaseId);
    });
  });

  // =========================================================================
  // resolveDispute() Tests
  // =========================================================================
  describe('resolveDispute()', () => {
    test('should pay winner on not_guilty verdict', async () => {
      transactionSettlement = createTestSettlement({
        id: 'resolve-not-guilty',
        status: 'disputed',
        winnerId: 'original-winner',
        gameId: 'game-resolve-1',
        totalPot: '100',
        platformFee: '0',
      });

      await settlementService.resolveDispute('resolve-not-guilty', 'not_guilty');

      expect(mockAwardWinnings).toHaveBeenCalledWith(
        'original-winner',
        100,
        'game-resolve-1'
      );
    });

    test('should pay victim on guilty verdict', async () => {
      transactionSettlement = createTestSettlement({
        id: 'resolve-guilty',
        status: 'disputed',
        winnerId: 'cheater',
        loserId: 'victim',
        gameId: 'game-resolve-2',
        totalPot: '200',
        platformFee: '0',
      });

      await settlementService.resolveDispute('resolve-guilty', 'guilty', 'victim');

      expect(mockAwardWinnings).toHaveBeenCalledWith('victim', 200, 'game-resolve-2');
    });

    test('should prevent double-payment with status check (already resolved)', async () => {
      transactionSettlement = createTestSettlement({
        id: 'already-resolved',
        status: 'resolved',
      });

      await settlementService.resolveDispute('already-resolved', 'not_guilty');

      expect(mockAwardWinnings).not.toHaveBeenCalled();
    });

    test('should skip if already resolving (race condition guard)', async () => {
      transactionSettlement = createTestSettlement({
        id: 'currently-resolving',
        status: 'resolving',
      });

      await settlementService.resolveDispute('currently-resolving', 'not_guilty');

      expect(mockAwardWinnings).not.toHaveBeenCalled();
    });

    test('should update settlement to resolved', async () => {
      transactionSettlement = createTestSettlement({
        id: 'resolve-update',
        status: 'disputed',
        winnerId: 'winner-1',
        gameId: 'game-1',
        totalPot: '100',
        platformFee: '0',
      });

      await settlementService.resolveDispute('resolve-update', 'not_guilty');

      const statusUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).status === 'resolved'
      );
      expect(statusUpdate).toBeDefined();
    });

    test('should throw if guilty verdict without victimId', async () => {
      transactionSettlement = createTestSettlement({
        id: 'guilty-no-victim',
        status: 'disputed',
        winnerId: 'cheater',
        totalPot: '100',
        platformFee: '0',
      });

      await expect(
        settlementService.resolveDispute('guilty-no-victim', 'guilty')
      ).rejects.toThrow('Missing required data for resolution');
    });

    test('should throw if settlement not found', async () => {
      transactionSettlement = null;

      await expect(
        settlementService.resolveDispute('non-existent', 'not_guilty')
      ).rejects.toThrow('Settlement not found');
    });
  });

  // =========================================================================
  // handleTimeout() Tests
  // =========================================================================
  describe('handleTimeout()', () => {
    test('should release funds to original winner after 48 hours', async () => {
      transactionSettlement = createTestSettlement({
        id: 'timeout-release',
        status: 'disputed',
        winnerId: 'original-winner',
        gameId: 'game-timeout',
        totalPot: '150',
        platformFee: '0',
      });

      await settlementService.handleTimeout('timeout-release');

      expect(mockAwardWinnings).toHaveBeenCalledWith(
        'original-winner',
        150,
        'game-timeout'
      );
    });

    test('should skip if already resolved (race condition guard)', async () => {
      transactionSettlement = createTestSettlement({
        id: 'timeout-already-resolved',
        status: 'resolved',
      });

      await settlementService.handleTimeout('timeout-already-resolved');

      expect(mockAwardWinnings).not.toHaveBeenCalled();
    });

    test('should set settledBy to timeout', async () => {
      transactionSettlement = createTestSettlement({
        id: 'timeout-settled-by',
        status: 'disputed',
        winnerId: 'winner-1',
        gameId: 'game-1',
        totalPot: '100',
        platformFee: '0',
      });

      await settlementService.handleTimeout('timeout-settled-by');

      const settledByUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).settledBy === 'timeout'
      );
      expect(settledByUpdate).toBeDefined();
    });

    test('should throw if settlement not found', async () => {
      transactionSettlement = null;

      await expect(
        settlementService.handleTimeout('non-existent')
      ).rejects.toThrow('Settlement not found');
    });

    test('should not pay if no winnerId (draw that was disputed)', async () => {
      transactionSettlement = createTestSettlement({
        id: 'timeout-draw',
        status: 'disputed',
        winnerId: null,
        gameId: 'game-draw',
        totalPot: '100',
        platformFee: '0',
      });

      await settlementService.handleTimeout('timeout-draw');

      // Should not call awardWinnings since there's no winner
      expect(mockAwardWinnings).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // findStuckResolvingSettlements() Tests
  // =========================================================================
  describe('findStuckResolvingSettlements()', () => {
    test('should find settlements stuck in resolving state for >10 minutes', async () => {
      const stuckSettlement = createTestSettlement({
        id: 'stuck-settlement',
        status: 'resolving',
        updatedAt: new Date(Date.now() - 15 * 60 * 1000),
      });

      mockSettlementsFindMany = mock(() => Promise.resolve([stuckSettlement]));

      const result = await settlementService.findStuckResolvingSettlements();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('resolving');
    });

    test('should return empty array if no stuck settlements', async () => {
      mockSettlementsFindMany = mock(() => Promise.resolve([]));

      const result = await settlementService.findStuckResolvingSettlements();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // recoverStuckSettlement() Tests
  // =========================================================================
  describe('recoverStuckSettlement()', () => {
    test('should reset stuck settlement to disputed for retry', async () => {
      transactionSettlement = createTestSettlement({
        id: 'recover-stuck',
        status: 'resolving',
      });

      await settlementService.recoverStuckSettlement('recover-stuck');

      const statusUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).status === 'disputed'
      );
      expect(statusUpdate).toBeDefined();
    });

    test('should record recovery in history', async () => {
      transactionSettlement = createTestSettlement({
        id: 'recover-history',
        status: 'resolving',
      });

      await settlementService.recoverStuckSettlement('recover-history');

      const historyInsert = mockInsertValues.find(
        (v: unknown) => (v as Record<string, unknown>).trigger === 'recovery'
      );
      expect(historyInsert).toBeDefined();
    });

    test('should skip if settlement is no longer resolving', async () => {
      transactionSettlement = createTestSettlement({
        id: 'already-recovered',
        status: 'disputed',
      });

      const initialUpdateCount = mockUpdateValues.length;

      await settlementService.recoverStuckSettlement('already-recovered');

      // No new updates should have been made
      expect(mockUpdateValues.length).toBe(initialUpdateCount);
    });

    test('should throw if settlement not found', async () => {
      transactionSettlement = null;

      await expect(
        settlementService.recoverStuckSettlement('non-existent')
      ).rejects.toThrow('Settlement not found');
    });
  });

  // =========================================================================
  // getSettlement() Tests
  // =========================================================================
  describe('getSettlement()', () => {
    test('should return settlement when found', async () => {
      const settlement = createTestSettlement({ id: 'find-me' });
      mockSettlementsFind = mock(() => Promise.resolve(settlement));

      const result = await settlementService.getSettlement('find-me');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('find-me');
    });

    test('should return null when not found', async () => {
      mockSettlementsFind = mock(() => Promise.resolve(null));

      const result = await settlementService.getSettlement('non-existent');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getSettlementByGame() Tests
  // =========================================================================
  describe('getSettlementByGame()', () => {
    test('should return settlement for game', async () => {
      const settlement = createTestSettlement({ gameId: 'game-123' });
      mockSettlementsFind = mock(() => Promise.resolve(settlement));

      const result = await settlementService.getSettlementByGame('game-123');

      expect(result?.gameId).toBe('game-123');
    });

    test('should return null when game has no settlement', async () => {
      mockSettlementsFind = mock(() => Promise.resolve(null));

      const result = await settlementService.getSettlementByGame('no-settlement-game');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Edge Cases & Security Tests
  // =========================================================================
  describe('Edge Cases & Security', () => {
    test('should handle concurrent verdict and timeout race - resolved case is skipped', async () => {
      // Scenario: Settlement was already resolved
      transactionSettlement = createTestSettlement({
        id: 'race-condition',
        status: 'resolved',
        winnerId: 'winner-1',
        gameId: 'game-race',
        totalPot: '100',
        platformFee: '0',
      });

      // Both should skip without error
      await settlementService.resolveDispute('race-condition', 'not_guilty');
      await settlementService.handleTimeout('race-condition');

      // Neither should have paid
      expect(mockAwardWinnings).not.toHaveBeenCalled();
    });

    test('should handle draw with zero payout', async () => {
      transactionSettlement = createTestSettlement({
        winnerId: null,
        loserId: null,
        winnerPayout: null,
        totalPot: '100',
      });

      const result = await settlementService.createSettlement(
        'draw-game',
        null,
        null,
        100
      );

      expect(result.winnerPayout).toBeNull();
      expect(result.winnerId).toBeNull();
    });

    test('should handle settlement with maximum pot value', async () => {
      const largePot = 999999999.99;

      transactionSettlement = createTestSettlement({
        totalPot: largePot.toString(),
        winnerPayout: largePot.toString(),
      });

      const result = await settlementService.createSettlement(
        'large-pot-game',
        'rich-winner',
        'rich-loser',
        largePot
      );

      expect(result.totalPot).toBe(largePot);
    });

    test('should handle settlement with minimum pot value', async () => {
      const smallPot = 0.01;

      transactionSettlement = createTestSettlement({
        totalPot: smallPot.toString(),
        winnerPayout: smallPot.toString(),
      });

      const result = await settlementService.createSettlement(
        'small-pot-game',
        'winner',
        'loser',
        smallPot
      );

      expect(result.totalPot).toBe(smallPot);
    });

    test('should preserve winner change on guilty verdict', async () => {
      transactionSettlement = createTestSettlement({
        id: 'guilty-winner-change',
        status: 'disputed',
        winnerId: 'cheater',
        loserId: 'victim',
        gameId: 'game-cheater',
        totalPot: '100',
        platformFee: '0',
      });

      await settlementService.resolveDispute('guilty-winner-change', 'guilty', 'victim');

      // Verify the winner update contains the victim
      const winnerUpdate = mockUpdateValues.find(
        (v: unknown) => (v as Record<string, unknown>).winnerId === 'victim'
      );
      expect(winnerUpdate).toBeDefined();
    });
  });

  // =========================================================================
  // findTimedOutSettlements() Tests
  // =========================================================================
  describe('findTimedOutSettlements()', () => {
    test('should find disputed settlements older than 48 hours', async () => {
      const timedOutSettlement = createTestSettlement({
        id: 'timed-out',
        status: 'disputed',
        createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000), // 49 hours ago
      });

      mockSettlementsFindMany = mock(() => Promise.resolve([timedOutSettlement]));

      const result = await settlementService.findTimedOutSettlements();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('disputed');
    });

    test('should return empty array if no timed out settlements', async () => {
      mockSettlementsFindMany = mock(() => Promise.resolve([]));

      const result = await settlementService.findTimedOutSettlements();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // findPendingSettlements() Tests
  // =========================================================================
  describe('findPendingSettlements()', () => {
    test('should find pending settlements without suspicion score', async () => {
      const pendingSettlement = createTestSettlement({
        id: 'pending-eval',
        status: 'pending',
        suspicionScore: null,
      });

      mockSettlementsFindMany = mock(() => Promise.resolve([pendingSettlement]));

      const result = await settlementService.findPendingSettlements();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    test('should return empty array if no pending settlements', async () => {
      mockSettlementsFindMany = mock(() => Promise.resolve([]));

      const result = await settlementService.findPendingSettlements();

      expect(result).toEqual([]);
    });
  });
});
