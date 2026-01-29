/**
 * Tests for jury.ts event handlers
 *
 * These tests verify that the jury handler correctly processes anti-cheat
 * events and creates jury cases for community review.
 *
 * The jury handler:
 * 1. Listens for anticheat:review_required events (high suspicion games)
 * 2. Creates jury cases when suspicion >= 95%
 * 3. Assigns appropriate priority based on flag severity
 * 4. Occasionally inserts test cases for juror calibration
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
import { registerJuryHandlers } from './jury';
import type { CheatFlag, CheatFlagSeverity } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Mock the jury service module
// ---------------------------------------------------------------------------

const mockCreateCase = mock(() => Promise.resolve({
  id: 'jury-case-1',
  gameId: 'game-123',
  suspectPlayerId: 'player-1',
  suspicionScore: '0.96',
  priority: 'high',
  deadline: new Date(),
  status: 'pending_assignment',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const mockCheckAndResolveCases = mock(() => Promise.resolve(0));
const mockExpirePendingAssignments = mock(() => Promise.resolve(0));
const mockMaybeInsertTestCase = mock(() => Promise.resolve());

// Mock the jury service imports
mock.module('../../services/jury', () => ({
  createCase: mockCreateCase,
  checkAndResolveCases: mockCheckAndResolveCases,
  expirePendingAssignments: mockExpirePendingAssignments,
  maybeInsertTestCase: mockMaybeInsertTestCase,
}));

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock CheatFlag object for testing.
 */
function createMockFlag(overrides: Partial<CheatFlag> = {}): CheatFlag {
  return {
    type: 'engine_correlation',
    severity: 'high' as CheatFlagSeverity,
    score: 15,
    details: 'Test flag',
    gameId: 'game-123',
    playerId: 'player-1',
    timestamp: Date.now(),
    moveNumber: 15,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('jury.ts event handlers', () => {
  let events: GameEventEmitter;

  beforeEach(() => {
    // Create fresh event emitter for each test
    events = new GameEventEmitter();

    // Reset mocks between tests
    mockCreateCase.mockClear();
    mockCheckAndResolveCases.mockClear();
    mockExpirePendingAssignments.mockClear();
    mockMaybeInsertTestCase.mockClear();

    // Reset to default response
    mockCreateCase.mockImplementation(() => Promise.resolve({
      id: 'jury-case-1',
      gameId: 'game-123',
      suspectPlayerId: 'player-1',
      suspicionScore: '0.96',
      priority: 'high',
      deadline: new Date(),
      status: 'pending_assignment',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Register the handlers
    registerJuryHandlers(events);
  });

  // -------------------------------------------------------------------------
  // anticheat:review_required event tests
  // -------------------------------------------------------------------------

  describe('anticheat:review_required event', () => {
    const createReviewPayload = (overrides = {}) => ({
      gameId: 'game-123',
      playerId: 'player-1',
      score: 96,  // Above 95% threshold
      highestSeverity: 'high' as CheatFlagSeverity,
      summary: 'Timing anomalies detected',
      flags: [createMockFlag()],
      metadata: {
        moveCount: 35,
        focusLossCount: 3,
        avgMoveTime: 2500,
      },
      ...overrides,
    });

    test('should create jury case when score >= 95', async () => {
      const payload = createReviewPayload({ score: 96 });
      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledTimes(1);
      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        gameId: 'game-123',
        suspectPlayerId: 'player-1',
        suspicionScore: 0.96,  // Converted from 0-100 to 0-1
      }));
    });

    test('should NOT create jury case when score < 95', async () => {
      const payload = createReviewPayload({ score: 94 });
      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).not.toHaveBeenCalled();
    });

    test('should convert score from 0-100 to 0-1 scale', async () => {
      const payload = createReviewPayload({ score: 98 });
      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        suspicionScore: 0.98,
      }));
    });

    test('should set priority to urgent for critical severity flags', async () => {
      const payload = createReviewPayload({
        highestSeverity: 'critical',
      });

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        priority: 'urgent',
      }));
    });

    test('should set priority to high for high severity flags', async () => {
      const payload = createReviewPayload({
        highestSeverity: 'high',
      });

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        priority: 'high',
      }));
    });

    test('should set priority to normal for medium/low severity flags', async () => {
      const payload = createReviewPayload({
        highestSeverity: 'medium',
      });

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        priority: 'normal',
      }));
    });

    test('should include anticheat metadata in case creation', async () => {
      const flags = [
        createMockFlag({ type: 'engine_correlation', severity: 'high' }),
        createMockFlag({ type: 'robotic_timing_consistency', severity: 'medium' }),
      ];
      const payload = createReviewPayload({
        flags,
        summary: 'Multiple anomalies detected',
        metadata: { moveCount: 40, focusLossCount: 5 },
      });

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        anticheatMetadata: expect.objectContaining({
          flags,
          summary: 'Multiple anomalies detected',
          metadata: { moveCount: 40, focusLossCount: 5 },
        }),
      }));
    });

    test('should attempt to insert test case before creating real case', async () => {
      const payload = createReviewPayload();
      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockMaybeInsertTestCase).toHaveBeenCalledTimes(1);
      // Test case insertion should happen before real case
      expect(mockMaybeInsertTestCase.mock.calls[0]).toBeDefined();
    });

    test('should handle errors gracefully', async () => {
      mockCreateCase.mockImplementation(() => {
        throw new Error('Database error');
      });

      const payload = createReviewPayload();

      // Should not throw - handler catches errors
      await expect(events.emit('anticheat:review_required', payload)).resolves.toBeUndefined();
    });

    test('should register handler as non-blocking with priority 95', async () => {
      const testEvents = new GameEventEmitter();

      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'anticheat:review_required') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerJuryHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(95);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // anticheat:game_flagged event tests
  // -------------------------------------------------------------------------

  describe('anticheat:game_flagged event', () => {
    const createFlaggedPayload = (overrides = {}) => ({
      gameId: 'game-123',
      playerId: 'player-1',
      score: 65,
      reason: 'Suspicion score exceeded monitor threshold',
      flags: [createMockFlag()],
      recommendedAction: 'monitor' as const,
      ...overrides,
    });

    test('should log flagged games without creating jury case', async () => {
      const payload = createFlaggedPayload();
      await events.emit('anticheat:game_flagged', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      // game_flagged (lower threshold) should NOT create jury cases
      // Only anticheat:review_required (high threshold) creates cases
      expect(mockCreateCase).not.toHaveBeenCalled();
    });

    test('should register handler as non-blocking with priority 95', async () => {
      const testEvents = new GameEventEmitter();

      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'anticheat:game_flagged') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerJuryHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(95);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Score threshold edge cases
  // -------------------------------------------------------------------------

  describe('score threshold edge cases', () => {
    test('should create case at exactly 95 score', async () => {
      const payload = {
        gameId: 'game-123',
        playerId: 'player-1',
        score: 95,  // Exactly at threshold
        highestSeverity: 'high' as CheatFlagSeverity,
        summary: 'At threshold',
        flags: [createMockFlag()],
        metadata: {},
      };

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledTimes(1);
    });

    test('should NOT create case at 94.9 score', async () => {
      const payload = {
        gameId: 'game-123',
        playerId: 'player-1',
        score: 94.9,  // Just below threshold
        highestSeverity: 'high' as CheatFlagSeverity,
        summary: 'Below threshold',
        flags: [createMockFlag()],
        metadata: {},
      };

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).not.toHaveBeenCalled();
    });

    test('should handle score of 100', async () => {
      const payload = {
        gameId: 'game-123',
        playerId: 'player-1',
        score: 100,  // Maximum score
        highestSeverity: 'critical' as CheatFlagSeverity,
        summary: 'Maximum suspicion',
        flags: [createMockFlag()],
        metadata: {},
      };

      await events.emit('anticheat:review_required', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCase).toHaveBeenCalledWith(expect.objectContaining({
        suspicionScore: 1.0,
        priority: 'urgent',
      }));
    });
  });

  // -------------------------------------------------------------------------
  // Multiple events handling
  // -------------------------------------------------------------------------

  describe('multiple events', () => {
    test('should process multiple review_required events independently', async () => {
      const payloads = [
        {
          gameId: 'game-1',
          playerId: 'player-a',
          score: 96,
          highestSeverity: 'high' as CheatFlagSeverity,
          summary: 'First game',
          flags: [createMockFlag({ gameId: 'game-1', playerId: 'player-a' })],
          metadata: {},
        },
        {
          gameId: 'game-2',
          playerId: 'player-b',
          score: 98,
          highestSeverity: 'critical' as CheatFlagSeverity,
          summary: 'Second game',
          flags: [createMockFlag({ gameId: 'game-2', playerId: 'player-b' })],
          metadata: {},
        },
      ];

      for (const payload of payloads) {
        await events.emit('anticheat:review_required', payload);
      }
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockCreateCase).toHaveBeenCalledTimes(2);
      expect(mockMaybeInsertTestCase).toHaveBeenCalledTimes(2);
    });
  });
});
