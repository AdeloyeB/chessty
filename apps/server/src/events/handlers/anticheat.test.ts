/**
 * Tests for anticheat.ts event handlers
 *
 * These tests verify that the anti-cheat handler correctly monitors games
 * in real-time and emits appropriate events when suspicious behavior is detected.
 *
 * The anticheat handler:
 * 1. Listens for game:started - Initializes monitoring for both players
 * 2. Listens for game:move_made - Analyzes each move for suspicious patterns
 * 3. Listens for game:ended - Cleans up monitoring and logs summary
 * 4. Emits anticheat:* events when thresholds are crossed
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { GameEventEmitter } from '../GameEventEmitter';
import { registerAnticheatHandlers } from './anticheat';
import type { Move, CheatFlag, CheatFlagSeverity } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Mock the anticheat service module
// ---------------------------------------------------------------------------

const mockStartGameMonitoring = mock(() => {});

const mockMonitorMove = mock(() => ({
  newScore: 10,
  newFlags: [],
  thresholdCrossed: 'none' as const,
  recommendedAction: 'none' as const,
}));

const mockEndGameMonitoring = mock(() => new Map());

const mockGetPlayerState = mock(() => ({
  playerId: 'player-1',
  gameId: 'game-123',
  suspicionScore: 10,
  flags: [],
  flagTypeCounts: {},
  moveTimes: [2000, 2500, 3000],
  focusLossEvents: [],
  moveAnalyses: [],
  skillShiftAnalyzer: { addMove: () => {}, checkForMidGameShift: () => ({ shiftAtMove: null }) },
  timeControl: 'blitz' as const,
  startedAt: Date.now(),
  lastMoveAt: Date.now(),
  flaggedForReview: false,
  queuedForDeepAnalysis: false,
}));

const mockMarkFlaggedForReview = mock(() => {});
const mockMarkQueuedForDeepAnalysis = mock(() => {});

const mockLiveGameMonitor = {
  startMonitoring: mockStartGameMonitoring,
  monitorMove: mockMonitorMove,
  endMonitoring: mockEndGameMonitoring,
  getPlayerState: mockGetPlayerState,
  markFlaggedForReview: mockMarkFlaggedForReview,
  markQueuedForDeepAnalysis: mockMarkQueuedForDeepAnalysis,
};

// Mock the anticheat service imports
mock.module('../../services/anticheat', () => ({
  liveGameMonitor: mockLiveGameMonitor,
  startGameMonitoring: mockStartGameMonitoring,
  endGameMonitoring: mockEndGameMonitoring,
  SUSPICION_THRESHOLDS: {
    NORMAL: 20,
    MONITOR: 40,
    RESTRICT: 60,
    REVIEW: 80,
    SUSPEND: 95,
  },
}));

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a valid Move object for testing.
 */
function createMove(overrides: Partial<Move> = {}): Move {
  return {
    from: 'e2',
    to: 'e4',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a mock CheatFlag for testing.
 */
function createMockFlag(overrides: Partial<CheatFlag> = {}): CheatFlag {
  return {
    type: 'robotic_timing_consistency',
    severity: 'medium' as CheatFlagSeverity,
    score: 5,
    details: 'Timing anomaly detected',
    gameId: 'game-123',
    playerId: 'player-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('anticheat.ts event handlers', () => {
  let events: GameEventEmitter;

  beforeEach(() => {
    // Create fresh event emitter for each test
    events = new GameEventEmitter();

    // Reset mocks between tests
    mockStartGameMonitoring.mockClear();
    mockMonitorMove.mockClear();
    mockEndGameMonitoring.mockClear();
    mockGetPlayerState.mockClear();
    mockMarkFlaggedForReview.mockClear();
    mockMarkQueuedForDeepAnalysis.mockClear();

    // Reset to default responses
    mockMonitorMove.mockImplementation(() => ({
      newScore: 10,
      newFlags: [],
      thresholdCrossed: 'none' as const,
      recommendedAction: 'none' as const,
    }));

    mockEndGameMonitoring.mockImplementation(() => new Map());

    mockGetPlayerState.mockImplementation(() => ({
      playerId: 'player-1',
      gameId: 'game-123',
      suspicionScore: 10,
      flags: [],
      flagTypeCounts: {},
      moveTimes: [2000, 2500, 3000],
      focusLossEvents: [],
      moveAnalyses: [],
      skillShiftAnalyzer: { addMove: () => {}, checkForMidGameShift: () => ({ shiftAtMove: null }) },
      timeControl: 'blitz' as const,
      startedAt: Date.now(),
      lastMoveAt: Date.now(),
      flaggedForReview: false,
      queuedForDeepAnalysis: false,
    }));

    // Register the handlers
    registerAnticheatHandlers(events);
  });

  // -------------------------------------------------------------------------
  // game:started event tests
  // -------------------------------------------------------------------------

  describe('game:started event', () => {
    const createStartPayload = (overrides = {}) => ({
      gameId: 'game-123',
      whitePlayerId: 'player-1',
      blackPlayerId: 'player-2',
      timeControlInitial: 300000,  // 5 minutes = blitz
      timeControlIncrement: 3000,
      ...overrides,
    });

    test('should start monitoring for both players', async () => {
      const payload = createStartPayload();
      await events.emit('game:started', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStartGameMonitoring).toHaveBeenCalledTimes(1);
      expect(mockStartGameMonitoring).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        'blitz'
      );
    });

    test('should determine time control type from initial time (bullet)', async () => {
      const payload = createStartPayload({
        timeControlInitial: 60000,  // 1 minute = bullet
      });

      await events.emit('game:started', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStartGameMonitoring).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        'bullet'
      );
    });

    test('should determine time control type from initial time (blitz)', async () => {
      const payload = createStartPayload({
        timeControlInitial: 300000,  // 5 minutes = blitz
      });

      await events.emit('game:started', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStartGameMonitoring).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        'blitz'
      );
    });

    test('should determine time control type from initial time (rapid)', async () => {
      const payload = createStartPayload({
        timeControlInitial: 900000,  // 15 minutes = rapid
      });

      await events.emit('game:started', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStartGameMonitoring).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        'rapid'
      );
    });

    test('should determine time control type from initial time (classical)', async () => {
      const payload = createStartPayload({
        timeControlInitial: 1800000,  // 30 minutes = classical
      });

      await events.emit('game:started', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStartGameMonitoring).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        'player-2',
        'classical'
      );
    });

    test('should register handler as non-blocking with priority 90', async () => {
      const testEvents = new GameEventEmitter();

      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'game:started') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerAnticheatHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(90);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // game:move_made event tests
  // -------------------------------------------------------------------------

  describe('game:move_made event', () => {
    const createMovePayload = (overrides = {}) => ({
      gameId: 'game-123',
      playerId: 'player-1',
      move: createMove(),
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      pgn: '1. e4',
      whiteTime: 295000,
      blackTime: 300000,
      isGameOver: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      ...overrides,
    });

    test('should call monitorMove with move data', async () => {
      const payload = createMovePayload();
      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockMonitorMove).toHaveBeenCalledTimes(1);
      expect(mockMonitorMove).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        expect.any(Number),  // moveNumber extracted from PGN
        expect.objectContaining({
          moveTimeMs: expect.any(Number),
          focusLost: false,
          positionComplexity: expect.any(Number),
        })
      );
    });

    test('should extract move number from PGN', async () => {
      const payload = createMovePayload({
        pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
      });

      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      // PGN "1. e4 e5 2. Nf3 Nc6 3. Bb5" has 5 moves
      expect(mockMonitorMove).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        5,  // Number of moves in PGN
        expect.any(Object)
      );
    });

    test('should include timing data in behavior analysis', async () => {
      const payload = createMovePayload({
        whiteTime: 280000,
      });

      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockMonitorMove).toHaveBeenCalledWith(
        'game-123',
        'player-1',
        expect.any(Number),
        expect.objectContaining({
          clockRemaining: 280000,
        })
      );
    });

    test('should emit anticheat:suspicion_flag for new flags', async () => {
      const testFlag = createMockFlag();

      mockMonitorMove.mockImplementation(() => ({
        newScore: 25,
        newFlags: [testFlag],
        thresholdCrossed: 'none' as const,
        recommendedAction: 'none' as const,
      }));

      const emittedEvents: Array<{ event: string; payload: unknown }> = [];
      const originalEmit = events.emit.bind(events);
      events.emit = async (event, payload) => {
        emittedEvents.push({ event: event as string, payload });
        return originalEmit(event, payload);
      };

      const payload = createMovePayload();
      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      const suspicionEvent = emittedEvents.find(e => e.event === 'anticheat:suspicion_flag');
      expect(suspicionEvent).toBeDefined();
      expect(suspicionEvent?.payload).toMatchObject({
        gameId: 'game-123',
        playerId: 'player-1',
        flag: testFlag,
        currentScore: 25,
      });
    });

    test('should emit anticheat:review_required when review threshold crossed', async () => {
      // Mock high suspicion state
      mockMonitorMove.mockImplementation(() => ({
        newScore: 85,
        newFlags: [createMockFlag({ severity: 'high' })],
        thresholdCrossed: 'review' as const,
        recommendedAction: 'flag_for_review' as const,
      }));

      mockGetPlayerState.mockImplementation(() => ({
        playerId: 'player-1',
        gameId: 'game-123',
        suspicionScore: 85,
        flags: [createMockFlag({ severity: 'high' })],
        flagTypeCounts: {},
        moveTimes: [2000],
        focusLossEvents: [],
        moveAnalyses: [],
        skillShiftAnalyzer: { addMove: () => {}, checkForMidGameShift: () => ({ shiftAtMove: null }) },
        timeControl: 'blitz' as const,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
        flaggedForReview: false,  // Not yet flagged
        queuedForDeepAnalysis: false,
      }));

      const emittedEvents: Array<{ event: string; payload: unknown }> = [];
      const originalEmit = events.emit.bind(events);
      events.emit = async (event, payload) => {
        emittedEvents.push({ event: event as string, payload });
        return originalEmit(event, payload);
      };

      const payload = createMovePayload();
      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 20));

      const reviewEvent = emittedEvents.find(e => e.event === 'anticheat:review_required');
      expect(reviewEvent).toBeDefined();
      expect(reviewEvent?.payload).toMatchObject({
        gameId: 'game-123',
        playerId: 'player-1',
        score: 85,
      });
    });

    test('should emit anticheat:game_flagged when monitor threshold crossed', async () => {
      mockMonitorMove.mockImplementation(() => ({
        newScore: 45,
        newFlags: [],
        thresholdCrossed: 'monitor' as const,
        recommendedAction: 'monitor' as const,
      }));

      mockGetPlayerState.mockImplementation(() => ({
        playerId: 'player-1',
        gameId: 'game-123',
        suspicionScore: 45,
        flags: [createMockFlag()],
        flagTypeCounts: {},
        moveTimes: [2000],
        focusLossEvents: [],
        moveAnalyses: [],
        skillShiftAnalyzer: { addMove: () => {}, checkForMidGameShift: () => ({ shiftAtMove: null }) },
        timeControl: 'blitz' as const,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
        flaggedForReview: false,
        queuedForDeepAnalysis: false,  // Not yet queued
      }));

      const emittedEvents: Array<{ event: string; payload: unknown }> = [];
      const originalEmit = events.emit.bind(events);
      events.emit = async (event, payload) => {
        emittedEvents.push({ event: event as string, payload });
        return originalEmit(event, payload);
      };

      const payload = createMovePayload();
      await events.emit('game:move_made', payload);
      await new Promise(resolve => setTimeout(resolve, 20));

      const flaggedEvent = emittedEvents.find(e => e.event === 'anticheat:game_flagged');
      expect(flaggedEvent).toBeDefined();
      expect(flaggedEvent?.payload).toMatchObject({
        gameId: 'game-123',
        playerId: 'player-1',
        score: 45,
      });
    });

    test('should handle errors gracefully', async () => {
      mockMonitorMove.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      const payload = createMovePayload();

      // Should not throw - handler catches errors
      await expect(events.emit('game:move_made', payload)).resolves.toBeUndefined();
    });

    test('should register handler as non-blocking with priority 90', async () => {
      const testEvents = new GameEventEmitter();

      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'game:move_made') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerAnticheatHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(90);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
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

    test('should end monitoring and finalize scores', async () => {
      const payload = createEndPayload();
      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEndGameMonitoring).toHaveBeenCalledTimes(1);
      expect(mockEndGameMonitoring).toHaveBeenCalledWith('game-123');
    });

    test('should return monitoring sessions for both players', async () => {
      const sessions = new Map([
        ['player-1', {
          playerId: 'player-1',
          gameId: 'game-123',
          suspicionScore: 15,
          flags: [createMockFlag()],
          flagTypeCounts: { robotic_timing_consistency: 1 },
          moveTimes: [2000, 2500, 3000],
          focusLossEvents: [],
          moveAnalyses: [],
          skillShiftAnalyzer: {},
          timeControl: 'blitz' as const,
          startedAt: Date.now() - 600000,
          lastMoveAt: Date.now(),
          flaggedForReview: false,
          queuedForDeepAnalysis: false,
        }],
        ['player-2', {
          playerId: 'player-2',
          gameId: 'game-123',
          suspicionScore: 5,
          flags: [],
          flagTypeCounts: {},
          moveTimes: [3000, 3500, 4000],
          focusLossEvents: [],
          moveAnalyses: [],
          skillShiftAnalyzer: {},
          timeControl: 'blitz' as const,
          startedAt: Date.now() - 600000,
          lastMoveAt: Date.now(),
          flaggedForReview: false,
          queuedForDeepAnalysis: false,
        }],
      ]);

      mockEndGameMonitoring.mockImplementation(() => sessions);

      const payload = createEndPayload();
      await events.emit('game:ended', payload);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEndGameMonitoring).toHaveBeenCalled();
    });

    test('should handle empty monitoring sessions gracefully', async () => {
      mockEndGameMonitoring.mockImplementation(() => new Map());

      const payload = createEndPayload();

      // Should not throw for games that weren't monitored
      await expect(events.emit('game:ended', payload)).resolves.toBeUndefined();
    });

    test('should register handler as non-blocking with priority 90', async () => {
      const testEvents = new GameEventEmitter();

      let registeredOptions: { priority?: number; nonBlocking?: boolean } | undefined;
      const originalOn = testEvents.on.bind(testEvents);
      testEvents.on = (event, handler, options) => {
        if (event === 'game:ended') {
          registeredOptions = options;
        }
        return originalOn(event, handler, options);
      };

      registerAnticheatHandlers(testEvents);

      expect(registeredOptions).toBeDefined();
      expect(registeredOptions?.priority).toBe(90);
      expect(registeredOptions?.nonBlocking).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Integration scenarios
  // -------------------------------------------------------------------------

  describe('integration scenarios', () => {
    test('should handle full game lifecycle', async () => {
      // Start game
      await events.emit('game:started', {
        gameId: 'game-full-test',
        whitePlayerId: 'white',
        blackPlayerId: 'black',
        timeControlInitial: 300000,
        timeControlIncrement: 3000,
      });

      // Make several moves
      for (let i = 0; i < 5; i++) {
        await events.emit('game:move_made', {
          gameId: 'game-full-test',
          playerId: i % 2 === 0 ? 'white' : 'black',
          move: createMove(),
          fen: 'test-fen',
          pgn: `1. e4 ${i > 0 ? 'e5' : ''}`,
          whiteTime: 300000 - i * 5000,
          blackTime: 300000 - i * 4000,
          isGameOver: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
        });
      }

      // End game
      await events.emit('game:ended', {
        gameId: 'game-full-test',
        result: 'checkmate',
        winnerId: 'white',
        whitePlayerId: 'white',
        blackPlayerId: 'black',
        whiteEloAtStart: 1200,
        blackEloAtStart: 1180,
        moveCount: 5,
        wagerAmount: 10,
        eloChanges: { whiteChange: 10, blackChange: -10 },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockStartGameMonitoring).toHaveBeenCalledTimes(1);
      expect(mockMonitorMove).toHaveBeenCalledTimes(5);
      expect(mockEndGameMonitoring).toHaveBeenCalledTimes(1);
    });

    test('should detect and flag suspicious game mid-play', async () => {
      // Setup: Simulate a player who suddenly starts playing suspiciously
      let callCount = 0;
      mockMonitorMove.mockImplementation(() => {
        callCount++;
        // After move 3, suspicion starts rising
        if (callCount >= 3) {
          return {
            newScore: 45 + (callCount * 10),
            newFlags: [createMockFlag({ severity: 'high' })],
            thresholdCrossed: callCount === 3 ? 'monitor' : callCount >= 5 ? 'review' : 'none',
            recommendedAction: callCount >= 5 ? 'flag_for_review' : 'monitor',
          };
        }
        return {
          newScore: callCount * 5,
          newFlags: [],
          thresholdCrossed: 'none' as const,
          recommendedAction: 'none' as const,
        };
      });

      mockGetPlayerState.mockImplementation(() => ({
        playerId: 'cheater',
        gameId: 'game-suspicious',
        suspicionScore: 85,
        flags: [createMockFlag({ severity: 'high' })],
        flagTypeCounts: {},
        moveTimes: [2000],
        focusLossEvents: [],
        moveAnalyses: [],
        skillShiftAnalyzer: { addMove: () => {}, checkForMidGameShift: () => ({ shiftAtMove: null }) },
        timeControl: 'blitz' as const,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
        flaggedForReview: false,
        queuedForDeepAnalysis: false,
      }));

      const emittedEvents: Array<{ event: string; payload: unknown }> = [];
      const originalEmit = events.emit.bind(events);
      events.emit = async (event, payload) => {
        emittedEvents.push({ event: event as string, payload });
        return originalEmit(event, payload);
      };

      // Start game
      await events.emit('game:started', {
        gameId: 'game-suspicious',
        whitePlayerId: 'cheater',
        blackPlayerId: 'victim',
        timeControlInitial: 300000,
        timeControlIncrement: 3000,
      });

      // Make moves that trigger suspicion
      for (let i = 0; i < 6; i++) {
        await events.emit('game:move_made', {
          gameId: 'game-suspicious',
          playerId: 'cheater',
          move: createMove(),
          fen: 'test-fen',
          pgn: '1. e4',
          whiteTime: 300000,
          blackTime: 300000,
          isGameOver: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have emitted flagged and review events
      const flaggedEvents = emittedEvents.filter(e => e.event === 'anticheat:game_flagged');
      expect(flaggedEvents.length).toBeGreaterThan(0);
    });
  });
});
