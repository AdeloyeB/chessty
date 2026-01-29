/**
 * Tests for settlement.ts event handlers
 *
 * These tests verify that the settlement handler correctly processes game
 * endings, creates settlement records, and handles suspicious games by
 * creating overwatch cases.
 *
 * The settlement handler:
 * 1. Listens for game:ended events
 * 2. Calls processSettlement() to create records and evaluate suspicion
 * 3. Sends notifications if a game is flagged for review
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
import { registerSettlementHandlers } from './settlement';

// ---------------------------------------------------------------------------
// Mock the settlement service module
// ---------------------------------------------------------------------------
// We mock the entire module to intercept calls without hitting the database

const mockProcessSettlement = mock(() => Promise.resolve({
  id: 'settlement-1',
  gameId: 'game-123',
  winnerId: 'player-1',
  loserId: 'player-2',
  totalPot: 20,
  platformFee: 0,
  winnerPayout: 20,
  status: 'settled',
  suspicionScore: 10,
  flaggedPlayerId: null,
  overwatchCaseId: null,
  settledAt: new Date(),
  settledBy: 'auto',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const mockNotifyUnderReview = mock(() => Promise.resolve());

// Mock the settlement service imports
mock.module('../../services/settlement', () => ({
  processSettlement: mockProcessSettlement,
  notifyUnderReview: mockNotifyUnderReview,
}));

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('settlement.ts event handlers', () => {
  let events: GameEventEmitter;

  beforeEach(() => {
    // Create fresh event emitter for each test
    events = new GameEventEmitter();

    // Reset mocks between tests
    mockProcessSettlement.mockClear();
    mockNotifyUnderReview.mockClear();

    // Reset to default settled response
    mockProcessSettlement.mockImplementation(() => Promise.resolve({
      id: 'settlement-1',
      gameId: 'game-123',
      winnerId: 'player-1',
      loserId: 'player-2',
      totalPot: 20,
      platformFee: 0,
      winnerPayout: 20,
      status: 'settled',
      suspicionScore: 10,
      flaggedPlayerId: null,
      overwatchCaseId: null,
      settledAt: new Date(),
      settledBy: 'auto',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Register the handlers
    registerSettlementHandlers(events);
  });

  // -------------------------------------------------------------------------
  // game:ended event tests
  // -------------------------------------------------------------------------

  describe('game:ended event', () => {
    const createEndPayload = (overrides = {}) => ({
      gameId: 'game-123',
      result: 'checkmate',
      winnerId: 'player-1',
      whitePlayerId: 'player-1',
      blackPlayerId: 'player-2',
      whiteEloAtStart: 1200,
      blackEloAtStart: 1180,
      moveCount: 35,
      wagerAmount: 10,
      eloChanges: {
        whiteChange: 15,
        blackChange: -15,
      },
      ...overrides,
    });

    test('should trigger processSettlement() with correct game data', async () => {
      const payload = createEndPayload();
      await events.emit('game:ended', payload);

      // Wait for non-blocking handler to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockProcessSettlement).toHaveBeenCalledTimes(1);
      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-123',  // gameId
        'player-1',  // winnerId
        'player-2',  // loserId
        20           // totalPot (wagerAmount * 2)
      );
    });

    test('should pass winnerId, loserId, totalPot from event payload', async () => {
      const payload = createEndPayload({
        gameId: 'game-456',
        winnerId: 'white-player',
        whitePlayerId: 'white-player',
        blackPlayerId: 'black-player',
        wagerAmount: 50,
      });

      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-456',       // gameId
        'white-player',   // winnerId
        'black-player',   // loserId (determined as opponent of winner)
        100               // totalPot (50 * 2)
      );
    });

    test('should correctly identify loserId when black wins', async () => {
      const payload = createEndPayload({
        winnerId: 'player-2',  // Black wins
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
      });

      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-123',
        'player-2',   // winnerId (black)
        'player-1',   // loserId (white)
        20
      );
    });

    test('should handle draw games with null winnerId', async () => {
      const payload = createEndPayload({
        result: 'draw',
        winnerId: null,
      });

      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      // For draws, winnerId is null and loserId should also be null
      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-123',
        null,   // winnerId (draw)
        null,   // loserId (no loser in a draw)
        20      // totalPot still calculated
      );
    });

    test('should calculate totalPot as wagerAmount * 2', async () => {
      const payload = createEndPayload({
        wagerAmount: 100,
      });

      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        200  // 100 * 2
      );
    });

    test('should send review notification when settlement is disputed', async () => {
      // Mock processSettlement to return a disputed settlement
      mockProcessSettlement.mockImplementation(() => Promise.resolve({
        id: 'settlement-1',
        gameId: 'game-123',
        winnerId: 'player-1',
        loserId: 'player-2',
        totalPot: 20,
        platformFee: 0,
        winnerPayout: 20,
        status: 'disputed',
        suspicionScore: 96,
        flaggedPlayerId: 'player-1',
        overwatchCaseId: 'overwatch-case-1',
        settledAt: null,
        settledBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const payload = createEndPayload();
      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should notify both players about the review
      expect(mockNotifyUnderReview).toHaveBeenCalledTimes(1);
      expect(mockNotifyUnderReview).toHaveBeenCalledWith(
        ['player-1', 'player-2'],  // Both players
        'game-123'
      );
    });

    test('should not send review notification for clean games', async () => {
      // Default mock returns settled status (clean game)
      const payload = createEndPayload();
      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockNotifyUnderReview).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully without breaking event flow', async () => {
      // Mock processSettlement to throw an error
      mockProcessSettlement.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const payload = createEndPayload();

      // Should not throw - handler catches errors internally
      await expect(events.emit('game:ended', payload)).resolves.toBeUndefined();
    });

    test('should register handler as non-blocking with priority 85', async () => {
      // Create a fresh emitter to inspect handler registration
      const testEvents = new GameEventEmitter();

      // Track handler registration
      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'game:ended') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerSettlementHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(85);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    test('should handle zero wager amount', async () => {
      const payload = {
        gameId: 'game-123',
        result: 'checkmate',
        winnerId: 'player-1',
        whitePlayerId: 'player-1',
        blackPlayerId: 'player-2',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1180,
        moveCount: 35,
        wagerAmount: 0,
        eloChanges: {
          whiteChange: 15,
          blackChange: -15,
        },
      };

      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockProcessSettlement).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        0  // totalPot is 0 for unranked/practice games
      );
    });

    test('should process multiple game endings correctly', async () => {
      const payloads = [
        {
          gameId: 'game-1',
          result: 'checkmate',
          winnerId: 'player-a',
          whitePlayerId: 'player-a',
          blackPlayerId: 'player-b',
          whiteEloAtStart: 1200,
          blackEloAtStart: 1180,
          moveCount: 20,
          wagerAmount: 5,
          eloChanges: { whiteChange: 10, blackChange: -10 },
        },
        {
          gameId: 'game-2',
          result: 'resignation',
          winnerId: 'player-d',
          whitePlayerId: 'player-c',
          blackPlayerId: 'player-d',
          whiteEloAtStart: 1400,
          blackEloAtStart: 1350,
          moveCount: 40,
          wagerAmount: 25,
          eloChanges: { whiteChange: -12, blackChange: 12 },
        },
      ];

      for (const payload of payloads) {
        await events.emit('game:ended', payload);
      }
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockProcessSettlement).toHaveBeenCalledTimes(2);
    });
  });
});
