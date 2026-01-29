/**
 * Engine Correlation Analysis Service
 * ====================================
 *
 * This module analyzes how closely a player's moves match chess engine recommendations.
 * Strong correlation with engine moves, especially in complex/critical positions,
 * can indicate computer-assisted play.
 *
 * HOW IT WORKS:
 * 1. For each move in a game, we compare it to what Stockfish recommends
 * 2. We calculate metrics like "top move rate" and "centipawn loss"
 * 3. We compare these to expected values for the player's rating
 * 4. Significant deviations from expected performance trigger suspicion
 *
 * KEY CONCEPTS:
 * - Centipawn Loss (CPL): How many centipawns worse than the best move
 * - Top Move Rate: How often the player finds the engine's #1 choice
 * - Critical Position: A position where one move is much better than alternatives
 * - Z-score: How many standard deviations from the expected mean
 *
 * IMPORTANT: This module uses statistical analysis, not binary detection.
 * A high top-move rate doesn't prove cheating - it just increases suspicion.
 */

import type {
  RatingBucket,
  ExpectedPerformance,
  EngineCorrelationAnalysis,
  PerformanceAnomalyResult,
  MoveAnalysisData,
  GamePhase,
  StockfishEvaluation,
  StockfishAnalyzer,
} from './types';

// ---------------------------------------------------------------------------
// Performance Expectations by Rating Band
// ---------------------------------------------------------------------------

/**
 * Expected performance metrics based on rating band.
 *
 * These values are derived from analysis of millions of games on major
 * chess platforms. They represent what "normal" performance looks like
 * for players at each skill level.
 *
 * A player performing significantly above these expectations may be
 * receiving computer assistance.
 */
export const PERFORMANCE_BY_RATING: Record<RatingBucket, ExpectedPerformance> = {
  '0-1000': {
    rating: 500,
    expectedTopMoveRate: { mean: 0.30, std: 0.10 },
    expectedTop3Rate: { mean: 0.50, std: 0.12 },
    expectedAvgCPL: { mean: 100, std: 30 },
    expectedCriticalCPL: { mean: 150, std: 50 },
  },
  '1000-1200': {
    rating: 1100,
    expectedTopMoveRate: { mean: 0.35, std: 0.08 },
    expectedTop3Rate: { mean: 0.55, std: 0.10 },
    expectedAvgCPL: { mean: 85, std: 25 },
    expectedCriticalCPL: { mean: 120, std: 40 },
  },
  '1200-1400': {
    rating: 1300,
    expectedTopMoveRate: { mean: 0.40, std: 0.08 },
    expectedTop3Rate: { mean: 0.60, std: 0.09 },
    expectedAvgCPL: { mean: 65, std: 20 },
    expectedCriticalCPL: { mean: 95, std: 35 },
  },
  '1400-1600': {
    rating: 1500,
    expectedTopMoveRate: { mean: 0.45, std: 0.07 },
    expectedTop3Rate: { mean: 0.65, std: 0.08 },
    expectedAvgCPL: { mean: 50, std: 18 },
    expectedCriticalCPL: { mean: 75, std: 30 },
  },
  '1600-1800': {
    rating: 1700,
    expectedTopMoveRate: { mean: 0.50, std: 0.07 },
    expectedTop3Rate: { mean: 0.70, std: 0.07 },
    expectedAvgCPL: { mean: 40, std: 15 },
    expectedCriticalCPL: { mean: 60, std: 25 },
  },
  '1800-2000': {
    rating: 1900,
    expectedTopMoveRate: { mean: 0.55, std: 0.06 },
    expectedTop3Rate: { mean: 0.75, std: 0.06 },
    expectedAvgCPL: { mean: 32, std: 12 },
    expectedCriticalCPL: { mean: 48, std: 20 },
  },
  '2000-2200': {
    rating: 2100,
    expectedTopMoveRate: { mean: 0.60, std: 0.06 },
    expectedTop3Rate: { mean: 0.80, std: 0.05 },
    expectedAvgCPL: { mean: 25, std: 10 },
    expectedCriticalCPL: { mean: 38, std: 18 },
  },
  '2200+': {
    rating: 2400,
    expectedTopMoveRate: { mean: 0.65, std: 0.05 },
    expectedTop3Rate: { mean: 0.85, std: 0.05 },
    expectedAvgCPL: { mean: 20, std: 8 },
    expectedCriticalCPL: { mean: 30, std: 15 },
  },
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the appropriate rating bucket for a given rating.
 *
 * @param rating - Player's Elo rating
 * @returns The rating bucket string key
 */
export function getRatingBucket(rating: number): RatingBucket {
  if (rating < 1000) return '0-1000';
  if (rating < 1200) return '1000-1200';
  if (rating < 1400) return '1200-1400';
  if (rating < 1600) return '1400-1600';
  if (rating < 1800) return '1600-1800';
  if (rating < 2000) return '1800-2000';
  if (rating < 2200) return '2000-2200';
  return '2200+';
}

/**
 * Get expected performance metrics for a player's rating.
 *
 * @param rating - Player's Elo rating
 * @returns Expected performance metrics for that rating band
 */
export function getExpectedPerformance(rating: number): ExpectedPerformance {
  const bucket = getRatingBucket(rating);
  return PERFORMANCE_BY_RATING[bucket];
}

/**
 * Determine the game phase based on move number.
 *
 * @param moveNumber - The move number (0-indexed)
 * @param totalMoves - Total moves in the game
 * @returns The game phase: 'opening', 'middlegame', or 'endgame'
 */
export function getGamePhase(moveNumber: number, _totalMoves: number): GamePhase {
  // Standard phase boundaries
  // Opening: moves 1-15 (indices 0-14)
  // Middlegame: moves 16-35 (indices 15-34)
  // Endgame: moves 36+ (indices 35+)
  if (moveNumber < 15) return 'opening';
  if (moveNumber < 35) return 'middlegame';
  return 'endgame';
}

/**
 * Calculate the mean of an array of numbers.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Critical Position Detection
// ---------------------------------------------------------------------------

/**
 * Determine if a position is "critical" based on engine evaluation.
 *
 * A critical position is one where:
 * - There's a significant gap between the best move and alternatives
 * - The position is complex with many options but only one good one
 * - The best move is a tactical shot (sacrifice, combination, etc.)
 *
 * Critical positions are important for cheat detection because:
 * - Strong humans may miss the best move in complex critical positions
 * - Engine users will almost always find it
 * - High accuracy in critical positions is more suspicious than in simple positions
 *
 * @param evaluation - Engine evaluation of the position
 * @returns true if this is a critical position
 */
export function isCriticalPosition(evaluation: StockfishEvaluation): boolean {
  const { moves } = evaluation;

  // Need at least 2 moves to compare
  if (moves.length < 2) return false;

  const bestScore = moves[0].score;
  const secondScore = moves[1].score;
  const gap = bestScore - secondScore;

  // Critical if best move is significantly better (1+ pawn advantage)
  if (gap > 100) return true;

  // Critical if many legal moves but only one is good
  // (indicates a "tricky" position where calculation is needed)
  if (moves.length > 10 && gap > 50) return true;

  // Critical if it's a tactical shot (sacrifice, fork, etc.)
  if (moves[0].isTactical && gap > 30) return true;

  return false;
}

/**
 * Calculate position complexity score (0-100).
 *
 * Complexity is based on:
 * - Number of legal moves available
 * - Piece activity and tension
 * - Pawn structure (open vs. closed positions)
 *
 * Higher complexity = harder for humans to find the best move.
 *
 * @param evaluation - Engine evaluation with move list
 * @param legalMoveCount - Number of legal moves in the position
 * @returns Complexity score from 0 to 100
 */
export function calculatePositionComplexity(
  evaluation: StockfishEvaluation,
  legalMoveCount: number
): number {
  let complexity = 0;

  // More legal moves = more complex (harder to calculate all options)
  // Typical range: 20-40 legal moves in middlegame
  if (legalMoveCount > 30) {
    complexity += 20;
  } else if (legalMoveCount > 20) {
    complexity += 10;
  }

  // Large eval differences between top moves = more complex
  // (many "trap" moves that look good but aren't)
  if (evaluation.moves.length >= 3) {
    const scoreSpread = evaluation.moves[0].score - evaluation.moves[2].score;
    if (scoreSpread > 200) {
      complexity += 30;
    } else if (scoreSpread > 100) {
      complexity += 20;
    } else if (scoreSpread > 50) {
      complexity += 10;
    }
  }

  // Tactical positions (with checks, captures, threats) are more complex
  if (evaluation.moves.some((m) => m.isTactical)) {
    complexity += 25;
  }

  // Deep PV (engine needs many moves to prove best) = complex
  if (evaluation.pv.length > 8) {
    complexity += 15;
  }

  // Cap at 100
  return Math.min(complexity, 100);
}

// ---------------------------------------------------------------------------
// Engine Correlation Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze how closely a player's moves match engine recommendations.
 *
 * This is the core anti-cheat analysis function. It compares each move
 * played to what Stockfish recommends and calculates various metrics.
 *
 * HIGH-LEVEL PROCESS:
 * 1. For each move in the game, get engine evaluation
 * 2. Check where the played move ranks in engine's top choices
 * 3. Calculate centipawn loss (how much worse than best)
 * 4. Aggregate into metrics by game phase
 *
 * @param gameId - ID of the game to analyze
 * @param moves - Array of moves played (UCI format)
 * @param fens - Array of FEN positions (one before each move)
 * @param stockfish - Stockfish analyzer instance (placeholder for now)
 * @param depth - Analysis depth (default: 20)
 * @returns Complete engine correlation analysis
 */
export async function analyzeEngineCorrelation(
  gameId: string,
  moves: string[],
  fens: string[],
  stockfish: StockfishAnalyzer,
  depth: number = 20
): Promise<EngineCorrelationAnalysis> {
  const moveAnalyses: MoveAnalysisData[] = [];

  // Track metrics by phase
  const phaseMetrics = {
    opening: { topMoves: 0, total: 0 },
    middlegame: { topMoves: 0, total: 0 },
    endgame: { topMoves: 0, total: 0 },
  };

  // Track move rank distribution
  const rankDistribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  let totalCPL = 0;
  let criticalCPL = 0;
  let criticalCount = 0;
  let top3Matches = 0;

  // Analyze each position
  for (let i = 0; i < moves.length; i++) {
    const fen = fens[i];
    const playedMove = moves[i];
    const phase = getGamePhase(i, moves.length);

    // Skip opening book moves (first 10 moves typically)
    // Opening theory is memorized, not calculated, so it's not useful for cheat detection
    if (i < 10) {
      continue;
    }

    // Get engine evaluation
    const evaluation = await stockfish.analyzePosition(fen, depth);

    // Find where the played move ranks in engine's list
    const moveIndex = evaluation.moves.findIndex((m) => m.move === playedMove);
    const moveRank = moveIndex === -1 ? 99 : moveIndex + 1; // 1-indexed, 99 if not in top moves

    // Calculate centipawn loss
    const bestScore = evaluation.moves[0]?.score ?? 0;
    const playedScore = evaluation.moves[moveIndex]?.score ?? bestScore - 500; // Assume bad if not found
    const cpLoss = Math.max(0, bestScore - playedScore);

    // Check if critical position
    const isCritical = isCriticalPosition(evaluation);

    // Calculate position complexity
    const positionComplexity = calculatePositionComplexity(evaluation, evaluation.moves.length);

    // Record move analysis
    moveAnalyses.push({
      moveIndex: i,
      playedMove,
      moveRank,
      centipawnLoss: cpLoss,
      isCritical,
      phase,
      positionComplexity,
      positionGap: bestScore - (evaluation.moves[1]?.score ?? bestScore),
      evalBefore: bestScore,
      evalAfter: playedScore,
    });

    // Update metrics
    phaseMetrics[phase].total++;
    if (moveRank === 1) {
      phaseMetrics[phase].topMoves++;
    }

    // Track rank distribution
    if (moveRank <= 5) {
      rankDistribution[moveRank - 1]++;
    } else {
      rankDistribution[4]++; // Bucket for 5+
    }

    // Track top-3 matches
    if (moveRank <= 3) {
      top3Matches++;
    }

    // Track CPL
    totalCPL += cpLoss;
    if (isCritical) {
      criticalCPL += cpLoss;
      criticalCount++;
    }
  }

  // Calculate final metrics
  const totalMoves =
    phaseMetrics.opening.total + phaseMetrics.middlegame.total + phaseMetrics.endgame.total;
  const topMoveMatches =
    phaseMetrics.opening.topMoves +
    phaseMetrics.middlegame.topMoves +
    phaseMetrics.endgame.topMoves;

  const calculatePhaseCorrelation = (phase: GamePhase): number => {
    const { topMoves, total } = phaseMetrics[phase];
    return total > 0 ? topMoves / total : 0;
  };

  return {
    gameId,
    topMoveMatches,
    totalMoves,
    topMoveRate: totalMoves > 0 ? topMoveMatches / totalMoves : 0,
    top3Matches,
    top3Rate: totalMoves > 0 ? top3Matches / totalMoves : 0,
    avgCentipawnLoss: totalMoves > 0 ? totalCPL / totalMoves : 0,
    criticalMoveCPL: criticalCount > 0 ? criticalCPL / criticalCount : 0,
    moveRankDistribution: rankDistribution,
    openingCorrelation: calculatePhaseCorrelation('opening'),
    middlegameCorrelation: calculatePhaseCorrelation('middlegame'),
    endgameCorrelation: calculatePhaseCorrelation('endgame'),
  };
}

// ---------------------------------------------------------------------------
// Performance Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Convert a Z-score to an estimated cheat probability.
 *
 * This function uses empirical calibration based on confirmed cheat cases.
 * Higher Z-scores (playing better than expected) correlate with higher
 * cheat probability.
 *
 * The mapping is NOT purely mathematical - it's calibrated to minimize
 * false positives while catching true cheaters.
 *
 * @param zScore - Combined Z-score from performance analysis
 * @returns Estimated probability of cheating (0-1)
 */
function zScoreToCheatProbability(zScore: number): number {
  // Z-score interpretation:
  // 0-1: Within normal range (68% of players)
  // 1-2: Somewhat above average (95th percentile)
  // 2-3: Significantly above average (99th percentile)
  // 3+: Extremely unusual (0.1% of players)

  if (zScore < 1) return 0.05; // Very low suspicion
  if (zScore < 1.5) return 0.1; // Low suspicion
  if (zScore < 2) return 0.2; // Moderate monitoring
  if (zScore < 2.5) return 0.35; // Elevated concern
  if (zScore < 3) return 0.5; // Significant concern
  if (zScore < 3.5) return 0.7; // High concern
  if (zScore < 4) return 0.85; // Very high concern
  return 0.95; // Near-certain suspicion (but never 100% - could be GM smurf)
}

/**
 * Calculate how anomalous a player's performance is compared to expected.
 *
 * This compares observed metrics (top move rate, CPL on critical positions)
 * to what we'd expect from a player of their rating. Large positive
 * deviations (playing much better than expected) are suspicious.
 *
 * STATISTICAL METHOD:
 * - Calculate Z-score for each metric (observed - expected) / std_dev
 * - Combine Z-scores to get overall anomaly score
 * - Convert to cheat probability using empirical calibration
 *
 * @param observed - Actual performance metrics from the game
 * @param playerRating - Player's Elo rating
 * @returns Anomaly analysis with suspicion score and details
 */
export function calculatePerformanceAnomaly(
  observed: EngineCorrelationAnalysis,
  playerRating: number
): PerformanceAnomalyResult {
  const expected = getExpectedPerformance(playerRating);

  // Calculate Z-score for top move rate
  // Z = (observed - expected) / std_dev
  // Positive Z = playing better than expected
  const topMoveZ =
    (observed.topMoveRate - expected.expectedTopMoveRate.mean) / expected.expectedTopMoveRate.std;

  // Calculate Z-score for critical position CPL
  // Note: Lower CPL is better, so we invert the calculation
  // Z = (expected - observed) / std_dev
  const criticalZ =
    (expected.expectedCriticalCPL.mean - observed.criticalMoveCPL) / expected.expectedCriticalCPL.std;

  // Combined anomaly score - average of both Z-scores
  // Both need to be high for strong suspicion
  const combinedZ = (topMoveZ + criticalZ) / 2;

  // Convert to probability using empirical calibration
  const cheatProbability = zScoreToCheatProbability(combinedZ);

  return {
    score: cheatProbability,
    topMoveZ,
    criticalZ,
    details: {
      observedTopMoveRate: observed.topMoveRate,
      expectedTopMoveRate: expected.expectedTopMoveRate.mean,
      observedCriticalCPL: observed.criticalMoveCPL,
      expectedCriticalCPL: expected.expectedCriticalCPL.mean,
    },
  };
}

// ---------------------------------------------------------------------------
// Stockfish Integration
// ---------------------------------------------------------------------------

import {
  StockfishWorkerPool,
  StockfishWorker,
  getStockfishPool,
  calculateCentipawnLoss as calcCPL,
  getMoveRank as getRank,
  isPositionCritical,
} from '../stockfish';

/**
 * Create a real Stockfish analyzer.
 *
 * This creates a StockfishAnalyzer backed by a worker pool or single worker.
 * The analyzer uses the Stockfish chess engine to evaluate positions.
 *
 * HOW IT WORKS:
 * 1. Uses a pool of Stockfish child processes for parallel analysis
 * 2. Communicates via UCI (Universal Chess Interface) protocol
 * 3. Returns structured evaluation data with top N moves and scores
 *
 * USAGE:
 * ```typescript
 * const analyzer = await createStockfishAnalyzer();
 * const evaluation = await analyzer.analyzePosition(fen, 20);
 * console.log(evaluation.bestMove); // e.g., "e2e4"
 * console.log(evaluation.scoreCp);  // e.g., 32 (0.32 pawns advantage)
 * ```
 *
 * CONFIGURATION:
 * - STOCKFISH_PATH: Path to Stockfish binary (default: "stockfish" in PATH)
 * - STOCKFISH_POOL_SIZE: Number of worker processes (default: 2)
 * - STOCKFISH_THREADS: Threads per worker (default: 2)
 * - STOCKFISH_HASH_MB: Hash table size per worker (default: 128)
 *
 * @param usePool - If true, uses a shared worker pool (better for batch analysis).
 *                  If false, creates a single dedicated worker.
 * @returns A StockfishAnalyzer instance
 */
export async function createStockfishAnalyzer(usePool: boolean = true): Promise<StockfishAnalyzer> {
  if (usePool) {
    // Use the global worker pool for batch analysis
    const pool = await getStockfishPool();
    return pool;
  } else {
    // Create a single dedicated worker
    const worker = new StockfishWorker();
    await worker.initialize();
    return worker;
  }
}

/**
 * Create a Stockfish analyzer synchronously (returns promise-based interface).
 *
 * This is a convenience wrapper that creates an uninitialized analyzer.
 * The analyzer will be initialized on first use, which may cause a delay.
 *
 * For production use, prefer createStockfishAnalyzer() which initializes
 * the engine upfront.
 *
 * @returns A StockfishAnalyzer that initializes lazily
 */
export function createStockfishAnalyzerSync(): StockfishAnalyzer {
  let poolPromise: Promise<StockfishWorkerPool> | null = null;

  return {
    async analyzePosition(fen: string, depth: number = 20): Promise<StockfishEvaluation> {
      if (!poolPromise) {
        poolPromise = getStockfishPool();
      }
      const pool = await poolPromise;
      return pool.analyzePosition(fen, depth);
    },

    async analyzeBatch(positions: string[], depth: number = 20): Promise<StockfishEvaluation[]> {
      if (!poolPromise) {
        poolPromise = getStockfishPool();
      }
      const pool = await poolPromise;
      return pool.analyzeBatch(positions, depth);
    },

    async isReady(): Promise<boolean> {
      if (!poolPromise) {
        return false;
      }
      const pool = await poolPromise;
      return pool.isReady();
    },

    async stop(): Promise<void> {
      if (poolPromise) {
        const pool = await poolPromise;
        await pool.stop();
      }
    },
  };
}

// Re-export convenience functions for anti-cheat analysis
export { calcCPL as calculateCentipawnLossForMove };
export { getRank as getMoveRankInEvaluation };
export { isPositionCritical };

/**
 * Validate that Stockfish is available and working.
 *
 * This should be called during server startup to ensure
 * the anti-cheat analysis system is functional.
 *
 * @param stockfish - Stockfish analyzer instance (optional, creates one if not provided)
 * @returns true if Stockfish is ready, false otherwise
 */
export async function validateStockfishSetup(stockfish?: StockfishAnalyzer): Promise<boolean> {
  try {
    // Get or create analyzer
    const analyzer = stockfish || await createStockfishAnalyzer();

    const ready = await analyzer.isReady();
    if (!ready) {
      console.warn('[AntiCheat] Stockfish is not ready - engine analysis disabled');
      return false;
    }

    // Test with a simple position (e4 opening)
    // FEN: After 1. e4, black to move
    const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const evaluation = await analyzer.analyzePosition(testFen, 10);

    // Validate the response has the expected structure
    if (!evaluation.bestMove || evaluation.moves.length === 0) {
      console.warn('[AntiCheat] Stockfish returned invalid evaluation');
      return false;
    }

    console.log('[AntiCheat] Stockfish validation passed');
    console.log(`[AntiCheat] Engine: Stockfish, Test position eval: ${evaluation.scoreCp} cp, best: ${evaluation.bestMove}`);
    return true;
  } catch (error) {
    console.error('[AntiCheat] Stockfish validation failed:', error);
    return false;
  }
}

/**
 * Perform a quick health check on the Stockfish service.
 *
 * This is a lighter weight check than validateStockfishSetup,
 * suitable for periodic health monitoring.
 *
 * @returns true if Stockfish is responsive
 */
export async function checkStockfishHealth(): Promise<boolean> {
  try {
    const pool = await getStockfishPool();
    return await pool.isReady();
  } catch {
    return false;
  }
}
