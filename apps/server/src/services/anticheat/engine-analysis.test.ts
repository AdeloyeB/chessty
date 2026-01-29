/**
 * Engine Correlation Analysis Tests
 * ==================================
 *
 * Tests for the anti-cheat engine analysis service including:
 * - Rating bucket calculation
 * - Expected performance lookups
 * - Critical position detection
 * - Centipawn loss calculations
 * - Performance anomaly detection
 */
import { describe, test, expect } from 'bun:test';
import {
  getRatingBucket,
  getExpectedPerformance,
  isCriticalPosition,
  calculatePerformanceAnomaly,
  calculatePositionComplexity,
  getGamePhase,
  mean,
  PERFORMANCE_BY_RATING,
} from './engine-analysis';
import type { StockfishEvaluation, EngineCorrelationAnalysis } from './types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a mock Stockfish evaluation for testing.
 * Used to simulate engine output for position analysis.
 */
function createMockEvaluation(
  overrides: Partial<StockfishEvaluation> = {}
): StockfishEvaluation {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    bestMove: 'e7e5',
    scoreCp: 30,
    scoreMate: null,
    depth: 20,
    moves: [
      { move: 'e7e5', score: 30 },
      { move: 'd7d5', score: 10 },
      { move: 'c7c5', score: 5 },
      { move: 'g8f6', score: 0 },
      { move: 'e7e6', score: -5 },
    ],
    pv: ['e7e5', 'g1f3', 'b8c6', 'd2d4'],
    nodes: 1500000,
    timeMs: 1500,
    ...overrides,
  };
}

/**
 * Creates a mock engine correlation analysis result.
 */
function createMockCorrelationAnalysis(
  overrides: Partial<EngineCorrelationAnalysis> = {}
): EngineCorrelationAnalysis {
  return {
    gameId: 'test-game-1',
    topMoveMatches: 15,
    totalMoves: 30,
    topMoveRate: 0.5,
    top3Matches: 25,
    top3Rate: 0.833,
    avgCentipawnLoss: 35,
    criticalMoveCPL: 25,
    moveRankDistribution: [15, 5, 5, 3, 2],
    openingCorrelation: 0.4,
    middlegameCorrelation: 0.5,
    endgameCorrelation: 0.6,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rating Bucket Tests
// ---------------------------------------------------------------------------

describe('getRatingBucket', () => {
  test('should return correct bucket for rating 0-999', () => {
    expect(getRatingBucket(0)).toBe('0-1000');
    expect(getRatingBucket(500)).toBe('0-1000');
    expect(getRatingBucket(999)).toBe('0-1000');
  });

  test('should return correct bucket for rating 1000-1199', () => {
    expect(getRatingBucket(1000)).toBe('1000-1200');
    expect(getRatingBucket(1100)).toBe('1000-1200');
    expect(getRatingBucket(1199)).toBe('1000-1200');
  });

  test('should return correct bucket for rating 1200-1399', () => {
    expect(getRatingBucket(1200)).toBe('1200-1400');
    expect(getRatingBucket(1300)).toBe('1200-1400');
    expect(getRatingBucket(1399)).toBe('1200-1400');
  });

  test('should return correct bucket for rating 1400-1599', () => {
    expect(getRatingBucket(1400)).toBe('1400-1600');
    expect(getRatingBucket(1500)).toBe('1400-1600');
    expect(getRatingBucket(1599)).toBe('1400-1600');
  });

  test('should return correct bucket for rating 1600-1799', () => {
    expect(getRatingBucket(1600)).toBe('1600-1800');
    expect(getRatingBucket(1700)).toBe('1600-1800');
    expect(getRatingBucket(1799)).toBe('1600-1800');
  });

  test('should return correct bucket for rating 1800-1999', () => {
    expect(getRatingBucket(1800)).toBe('1800-2000');
    expect(getRatingBucket(1900)).toBe('1800-2000');
    expect(getRatingBucket(1999)).toBe('1800-2000');
  });

  test('should return correct bucket for rating 2000-2199', () => {
    expect(getRatingBucket(2000)).toBe('2000-2200');
    expect(getRatingBucket(2100)).toBe('2000-2200');
    expect(getRatingBucket(2199)).toBe('2000-2200');
  });

  test('should return 2200+ bucket for ratings 2200 and above', () => {
    expect(getRatingBucket(2200)).toBe('2200+');
    expect(getRatingBucket(2400)).toBe('2200+');
    expect(getRatingBucket(2800)).toBe('2200+'); // Magnus Carlsen level
    expect(getRatingBucket(3000)).toBe('2200+'); // Hypothetical super-GM
  });

  test('should handle boundary ratings correctly', () => {
    // Test exact boundaries where behavior changes
    expect(getRatingBucket(999)).toBe('0-1000');
    expect(getRatingBucket(1000)).toBe('1000-1200');
    expect(getRatingBucket(1199)).toBe('1000-1200');
    expect(getRatingBucket(1200)).toBe('1200-1400');
    expect(getRatingBucket(2199)).toBe('2000-2200');
    expect(getRatingBucket(2200)).toBe('2200+');
  });
});

// ---------------------------------------------------------------------------
// Expected Performance Tests
// ---------------------------------------------------------------------------

describe('getExpectedPerformance', () => {
  test('should return expected CPL for each rating bucket', () => {
    // Beginners should have high expected CPL (more mistakes)
    const beginner = getExpectedPerformance(500);
    expect(beginner.expectedAvgCPL.mean).toBe(100);

    // Intermediate players improve
    const intermediate = getExpectedPerformance(1500);
    expect(intermediate.expectedAvgCPL.mean).toBe(50);

    // Strong players have low CPL
    const advanced = getExpectedPerformance(2100);
    expect(advanced.expectedAvgCPL.mean).toBe(25);

    // Masters have very low CPL
    const master = getExpectedPerformance(2400);
    expect(master.expectedAvgCPL.mean).toBe(20);
  });

  test('should return expected top move rate for each rating bucket', () => {
    // Beginners find the best move ~30% of the time
    const beginner = getExpectedPerformance(500);
    expect(beginner.expectedTopMoveRate.mean).toBe(0.30);

    // Intermediate players ~45%
    const intermediate = getExpectedPerformance(1500);
    expect(intermediate.expectedTopMoveRate.mean).toBe(0.45);

    // Masters ~65%
    const master = getExpectedPerformance(2400);
    expect(master.expectedTopMoveRate.mean).toBe(0.65);
  });

  test('should return expected critical CPL for each rating bucket', () => {
    // Critical positions are harder - everyone makes more mistakes
    const beginner = getExpectedPerformance(500);
    expect(beginner.expectedCriticalCPL.mean).toBe(150);
    expect(beginner.expectedCriticalCPL.mean).toBeGreaterThan(beginner.expectedAvgCPL.mean);

    const intermediate = getExpectedPerformance(1500);
    expect(intermediate.expectedCriticalCPL.mean).toBe(75);

    const master = getExpectedPerformance(2400);
    expect(master.expectedCriticalCPL.mean).toBe(30);
  });

  test('should handle boundary ratings correctly', () => {
    // Rating at exact boundary (1200) should use the 1200-1400 bucket
    const atBoundary = getExpectedPerformance(1200);
    expect(atBoundary).toEqual(PERFORMANCE_BY_RATING['1200-1400']);

    // Rating just below boundary
    const justBelow = getExpectedPerformance(1199);
    expect(justBelow).toEqual(PERFORMANCE_BY_RATING['1000-1200']);
  });

  test('should include standard deviations for all metrics', () => {
    const perf = getExpectedPerformance(1500);

    // All metrics should have both mean and std
    expect(perf.expectedTopMoveRate.std).toBeDefined();
    expect(perf.expectedTopMoveRate.std).toBeGreaterThan(0);

    expect(perf.expectedTop3Rate.std).toBeDefined();
    expect(perf.expectedAvgCPL.std).toBeDefined();
    expect(perf.expectedCriticalCPL.std).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Critical Position Detection Tests
// ---------------------------------------------------------------------------

describe('isCriticalPosition', () => {
  test('should return true for positions with large eval swings (>100 cp gap)', () => {
    const evaluation = createMockEvaluation({
      moves: [
        { move: 'e7e5', score: 150 },  // Best move
        { move: 'd7d5', score: 40 },   // Second best (110 cp worse)
        { move: 'c7c5', score: 30 },
      ],
    });

    expect(isCriticalPosition(evaluation)).toBe(true);
  });

  test('should return true for positions with many options but only one good one', () => {
    // 12 legal moves but only one is good (gap > 50)
    const moves = [
      { move: 'e4', score: 100 },  // Only good move
    ];
    // Add 11 more mediocre moves
    for (let i = 0; i < 11; i++) {
      moves.push({ move: `m${i}`, score: 40 }); // 60 cp worse
    }

    const evaluation = createMockEvaluation({ moves });

    expect(isCriticalPosition(evaluation)).toBe(true);
  });

  test('should return true for tactical positions with isTactical flag', () => {
    const evaluation = createMockEvaluation({
      moves: [
        { move: 'e4', score: 80, isTactical: true },  // Tactical shot
        { move: 'd4', score: 45 },  // 35 cp gap (meets threshold with tactical)
        { move: 'c4', score: 40 },
      ],
    });

    expect(isCriticalPosition(evaluation)).toBe(true);
  });

  test('should return false for quiet positions', () => {
    // Small gap between moves - quiet position
    const evaluation = createMockEvaluation({
      moves: [
        { move: 'e4', score: 30 },
        { move: 'd4', score: 25 },  // Only 5 cp difference
        { move: 'c4', score: 20 },
      ],
    });

    expect(isCriticalPosition(evaluation)).toBe(false);
  });

  test('should return false when less than 2 moves available', () => {
    // Only one legal move - not a critical decision
    const evaluation = createMockEvaluation({
      moves: [{ move: 'e4', score: 100 }],
    });

    expect(isCriticalPosition(evaluation)).toBe(false);
  });

  test('should handle positions with moderate gaps (50-100 cp) correctly', () => {
    // 50 cp gap is not critical unless there are many moves or tactical
    const evaluation = createMockEvaluation({
      moves: [
        { move: 'e4', score: 80 },
        { move: 'd4', score: 30 },  // 50 cp gap
        { move: 'c4', score: 25 },
      ],
    });

    expect(isCriticalPosition(evaluation)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Position Complexity Tests
// ---------------------------------------------------------------------------

describe('calculatePositionComplexity', () => {
  test('should return higher complexity for positions with many legal moves', () => {
    const eval35Moves = createMockEvaluation({
      moves: Array(35).fill(null).map((_, i) => ({ move: `m${i}`, score: 50 - i })),
    });

    const eval15Moves = createMockEvaluation({
      moves: Array(15).fill(null).map((_, i) => ({ move: `m${i}`, score: 50 - i })),
    });

    const complex = calculatePositionComplexity(eval35Moves, 35);
    const simple = calculatePositionComplexity(eval15Moves, 15);

    expect(complex).toBeGreaterThan(simple);
  });

  test('should return higher complexity for positions with large score spread', () => {
    // Large score spread = many trap moves
    const bigSpread = createMockEvaluation({
      moves: [
        { move: 'e4', score: 300 },
        { move: 'd4', score: 50 },
        { move: 'c4', score: 40 },  // 260 cp spread
      ],
    });

    const smallSpread = createMockEvaluation({
      moves: [
        { move: 'e4', score: 50 },
        { move: 'd4', score: 45 },
        { move: 'c4', score: 40 },  // 10 cp spread
      ],
    });

    expect(calculatePositionComplexity(bigSpread, 20)).toBeGreaterThan(
      calculatePositionComplexity(smallSpread, 20)
    );
  });

  test('should add complexity for tactical positions', () => {
    const tactical = createMockEvaluation({
      moves: [
        { move: 'e4', score: 50, isTactical: true },
        { move: 'd4', score: 45 },
        { move: 'c4', score: 40 },
      ],
    });

    const quiet = createMockEvaluation({
      moves: [
        { move: 'e4', score: 50 },
        { move: 'd4', score: 45 },
        { move: 'c4', score: 40 },
      ],
    });

    expect(calculatePositionComplexity(tactical, 20)).toBeGreaterThan(
      calculatePositionComplexity(quiet, 20)
    );
  });

  test('should add complexity for deep PV lines', () => {
    const deepPv = createMockEvaluation({
      pv: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3'],  // 9 moves
    });

    const shallowPv = createMockEvaluation({
      pv: ['e4', 'e5', 'Nf3'],  // 3 moves
    });

    expect(calculatePositionComplexity(deepPv, 20)).toBeGreaterThan(
      calculatePositionComplexity(shallowPv, 20)
    );
  });

  test('should cap complexity at 100', () => {
    // Max out all factors
    const maxComplex = createMockEvaluation({
      moves: [
        { move: 'e4', score: 500, isTactical: true },
        { move: 'd4', score: 200 },
        { move: 'c4', score: 100 },
        ...Array(30).fill(null).map((_, i) => ({ move: `m${i}`, score: 0 })),
      ],
      pv: Array(15).fill('e4'),  // Very deep
    });

    const complexity = calculatePositionComplexity(maxComplex, 35);
    expect(complexity).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Game Phase Tests
// ---------------------------------------------------------------------------

describe('getGamePhase', () => {
  test('should return opening for moves 0-14', () => {
    expect(getGamePhase(0, 50)).toBe('opening');
    expect(getGamePhase(7, 50)).toBe('opening');
    expect(getGamePhase(14, 50)).toBe('opening');
  });

  test('should return middlegame for moves 15-34', () => {
    expect(getGamePhase(15, 50)).toBe('middlegame');
    expect(getGamePhase(25, 50)).toBe('middlegame');
    expect(getGamePhase(34, 50)).toBe('middlegame');
  });

  test('should return endgame for moves 35+', () => {
    expect(getGamePhase(35, 50)).toBe('endgame');
    expect(getGamePhase(50, 50)).toBe('endgame');
    expect(getGamePhase(100, 120)).toBe('endgame');
  });
});

// ---------------------------------------------------------------------------
// Mean Utility Tests
// ---------------------------------------------------------------------------

describe('mean', () => {
  test('should calculate mean correctly', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20, 30])).toBe(20);
    expect(mean([100])).toBe(100);
  });

  test('should return 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Performance Anomaly Detection Tests
// ---------------------------------------------------------------------------

describe('calculatePerformanceAnomaly', () => {
  test('should return low anomaly score for expected performance', () => {
    // A 1500 player playing at expected 1500 level
    const observed = createMockCorrelationAnalysis({
      topMoveRate: 0.45,  // Matches 1500 expected
      criticalMoveCPL: 75,  // Matches 1500 expected
    });

    const result = calculatePerformanceAnomaly(observed, 1500);

    // Should be low suspicion (within normal range)
    expect(result.score).toBeLessThan(0.3);
    expect(Math.abs(result.topMoveZ)).toBeLessThan(1);  // Within 1 std dev
    expect(Math.abs(result.criticalZ)).toBeLessThan(1);
  });

  test('should return high anomaly score when far exceeding expected performance', () => {
    // A 1200 player suddenly playing like a 2200+
    const observed = createMockCorrelationAnalysis({
      topMoveRate: 0.65,  // Way above 1200 expected (0.40)
      criticalMoveCPL: 20,  // Way below 1200 expected (120)
    });

    const result = calculatePerformanceAnomaly(observed, 1200);

    // Should be high suspicion
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.topMoveZ).toBeGreaterThan(2);  // More than 2 std dev above
    expect(result.criticalZ).toBeGreaterThan(2);
  });

  test('should consider rating bucket in calculation', () => {
    // Same observed performance, different expected based on rating
    const observed = createMockCorrelationAnalysis({
      topMoveRate: 0.55,
      criticalMoveCPL: 40,
    });

    // For a 1200 player, this is suspicious
    const lowRated = calculatePerformanceAnomaly(observed, 1200);

    // For a 1900 player, this is normal
    const highRated = calculatePerformanceAnomaly(observed, 1900);

    expect(lowRated.score).toBeGreaterThan(highRated.score);
  });

  test('should return details with observed vs expected values', () => {
    const observed = createMockCorrelationAnalysis({
      topMoveRate: 0.50,
      criticalMoveCPL: 50,
    });

    const result = calculatePerformanceAnomaly(observed, 1500);

    expect(result.details.observedTopMoveRate).toBe(0.50);
    expect(result.details.expectedTopMoveRate).toBe(0.45);
    expect(result.details.observedCriticalCPL).toBe(50);
    expect(result.details.expectedCriticalCPL).toBe(75);
  });

  test('should handle edge case of playing worse than expected', () => {
    // A 2200 player playing like a 1000 (maybe having a bad day, or sandbagging)
    const observed = createMockCorrelationAnalysis({
      topMoveRate: 0.25,  // Much worse than 2200 expected (0.60)
      criticalMoveCPL: 150,  // Much worse than 2200 expected (38)
    });

    const result = calculatePerformanceAnomaly(observed, 2200);

    // Negative Z-scores (playing worse)
    expect(result.topMoveZ).toBeLessThan(0);
    expect(result.criticalZ).toBeLessThan(0);

    // But low overall suspicion (not indicative of cheating)
    expect(result.score).toBeLessThan(0.3);
  });

  test('should properly combine top move rate and critical CPL Z-scores', () => {
    // High top move rate but normal critical CPL
    const mixedPerf1 = createMockCorrelationAnalysis({
      topMoveRate: 0.70,  // Very high
      criticalMoveCPL: 95,  // Normal for 1200
    });

    // Normal top move rate but very low critical CPL
    const mixedPerf2 = createMockCorrelationAnalysis({
      topMoveRate: 0.40,  // Normal for 1200
      criticalMoveCPL: 20,  // Very low
    });

    // Both red flags high
    const bothHigh = createMockCorrelationAnalysis({
      topMoveRate: 0.70,
      criticalMoveCPL: 20,
    });

    const result1 = calculatePerformanceAnomaly(mixedPerf1, 1200);
    const result2 = calculatePerformanceAnomaly(mixedPerf2, 1200);
    const resultBoth = calculatePerformanceAnomaly(bothHigh, 1200);

    // Both flags should be worse than single flag
    expect(resultBoth.score).toBeGreaterThan(result1.score);
    expect(resultBoth.score).toBeGreaterThan(result2.score);
  });

  test('should never return probability above 0.95', () => {
    // Impossibly good performance
    const impossiblePerf = createMockCorrelationAnalysis({
      topMoveRate: 0.99,  // 99% top moves
      criticalMoveCPL: 0,  // Perfect on critical positions
    });

    const result = calculatePerformanceAnomaly(impossiblePerf, 800);

    // Even extreme cases cap at 0.95 (could be a GM smurf)
    expect(result.score).toBeLessThanOrEqual(0.95);
  });
});
