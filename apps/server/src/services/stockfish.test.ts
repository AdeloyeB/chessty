/**
 * Stockfish Service Tests
 * =======================
 *
 * Tests for the server-side Stockfish chess engine integration.
 *
 * NOTE: These tests require Stockfish to be installed and available
 * in the PATH or via the STOCKFISH_PATH environment variable.
 *
 * To skip Stockfish tests (e.g., in CI without Stockfish):
 *   SKIP_STOCKFISH_TESTS=1 bun test
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  StockfishWorker,
  StockfishWorkerPool,
  calculateCentipawnLoss,
  getMoveRank,
  isPositionCritical,
} from './stockfish';

// Skip tests if Stockfish is not available or explicitly skipped
// Check if Stockfish is available in PATH using execFileSync (safe, no shell)
function isStockfishAvailable(): boolean {
  try {
    const { execFileSync } = require('child_process');
    // Use 'which' on Unix or check if STOCKFISH_PATH is set
    if (process.env.STOCKFISH_PATH) {
      return true;
    }
    // Try to find stockfish in PATH (this is safe - no shell, hardcoded command)
    execFileSync('stockfish', ['--help'], { stdio: 'ignore', timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

const STOCKFISH_AVAILABLE = isStockfishAvailable();
const SKIP_TESTS = process.env.SKIP_STOCKFISH_TESTS === '1' || !STOCKFISH_AVAILABLE;

if (SKIP_TESTS) {
  console.log('[stockfish.test.ts] Skipped - requires Stockfish binary. Install Stockfish or set STOCKFISH_PATH.');
}

// Test positions
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const MATE_IN_ONE_FEN = 'k7/8/1K6/8/8/8/8/R7 w - - 0 1'; // Ra8#

describe.skipIf(SKIP_TESTS)('StockfishWorker', () => {
  let worker: StockfishWorker | null = null;

  beforeAll(async () => {
    if (SKIP_TESTS) return;
    worker = new StockfishWorker({
      threads: 1,
      hashMb: 32,
      multiPv: 3,
    });
    await worker.initialize();
  });

  afterAll(async () => {
    if (worker) await worker.quit();
  });

  it('should initialize successfully', async () => {
    const ready = await worker.isReady();
    expect(ready).toBe(true);
  });

  it('should get engine name', () => {
    const name = worker.getEngineName();
    expect(name).toContain('Stockfish');
  });

  it('should analyze starting position', async () => {
    const evaluation = await worker.analyzePosition(STARTING_FEN, 10);

    expect(evaluation.fen).toBe(STARTING_FEN);
    expect(evaluation.bestMove).toBeTruthy();
    expect(evaluation.depth).toBeGreaterThanOrEqual(10);
    expect(evaluation.moves.length).toBeGreaterThan(0);
    // Starting position is roughly equal
    expect(Math.abs(evaluation.scoreCp)).toBeLessThan(100);
  });

  it('should analyze position after e4', async () => {
    const evaluation = await worker.analyzePosition(AFTER_E4_FEN, 10);

    expect(evaluation.fen).toBe(AFTER_E4_FEN);
    expect(evaluation.bestMove).toBeTruthy();
    // Common responses to e4 include e5, c5 (Sicilian), e6 (French)
    expect(['e7e5', 'c7c5', 'e7e6', 'd7d5']).toContain(evaluation.bestMove);
  });

  it('should detect mate-in-one', async () => {
    const evaluation = await worker.analyzePosition(MATE_IN_ONE_FEN, 10);

    expect(evaluation.bestMove).toBe('a1a8');
    expect(evaluation.scoreMate).toBe(1);
  });

  it('should return multiple moves with MultiPV', async () => {
    const evaluation = await worker.analyzePosition(STARTING_FEN, 10);

    expect(evaluation.moves.length).toBeGreaterThanOrEqual(2);
    // Verify moves are sorted by score (best first)
    for (let i = 1; i < evaluation.moves.length; i++) {
      expect(evaluation.moves[i - 1].score).toBeGreaterThanOrEqual(evaluation.moves[i].score);
    }
  });
});

describe.skipIf(SKIP_TESTS)('StockfishWorkerPool', () => {
  let pool: StockfishWorkerPool | null = null;

  beforeAll(async () => {
    if (SKIP_TESTS) return;
    pool = new StockfishWorkerPool(2, {
      threads: 1,
      hashMb: 32,
      multiPv: 3,
    });
    await pool.initialize();
  });

  afterAll(async () => {
    if (pool) await pool.shutdown();
  });

  it('should initialize pool successfully', async () => {
    const ready = await pool.isReady();
    expect(ready).toBe(true);
  });

  it('should analyze single position', async () => {
    const evaluation = await pool.analyzePosition(STARTING_FEN, 10);

    expect(evaluation.fen).toBe(STARTING_FEN);
    expect(evaluation.bestMove).toBeTruthy();
  });

  it('should analyze batch of positions', async () => {
    const positions = [STARTING_FEN, AFTER_E4_FEN, MATE_IN_ONE_FEN];
    const evaluations = await pool.analyzeBatch(positions, 10);

    expect(evaluations.length).toBe(3);
    expect(evaluations[0].fen).toBe(STARTING_FEN);
    expect(evaluations[1].fen).toBe(AFTER_E4_FEN);
    expect(evaluations[2].fen).toBe(MATE_IN_ONE_FEN);
  });
});

describe('Convenience functions', () => {
  // These tests don't require Stockfish - they work on the data structures

  const mockEvaluation = {
    fen: STARTING_FEN,
    bestMove: 'e2e4',
    scoreCp: 30,
    scoreMate: null,
    depth: 20,
    moves: [
      { move: 'e2e4', score: 30, isTactical: false },
      { move: 'd2d4', score: 25, isTactical: false },
      { move: 'g1f3', score: 20, isTactical: false },
    ],
    pv: ['e2e4', 'e7e5', 'g1f3'],
    nodes: 1000000,
    timeMs: 1000,
  };

  it('should calculate centipawn loss for best move', () => {
    const loss = calculateCentipawnLoss(mockEvaluation, 'e2e4');
    expect(loss).toBe(0); // Best move has no loss
  });

  it('should calculate centipawn loss for second-best move', () => {
    const loss = calculateCentipawnLoss(mockEvaluation, 'd2d4');
    expect(loss).toBe(5); // 30 - 25 = 5
  });

  it('should calculate centipawn loss for third move', () => {
    const loss = calculateCentipawnLoss(mockEvaluation, 'g1f3');
    expect(loss).toBe(10); // 30 - 20 = 10
  });

  it('should return high loss for move not in list', () => {
    const loss = calculateCentipawnLoss(mockEvaluation, 'a2a3');
    expect(loss).toBe(500); // Default penalty for bad moves
  });

  it('should get move rank correctly', () => {
    expect(getMoveRank(mockEvaluation, 'e2e4')).toBe(1);
    expect(getMoveRank(mockEvaluation, 'd2d4')).toBe(2);
    expect(getMoveRank(mockEvaluation, 'g1f3')).toBe(3);
    expect(getMoveRank(mockEvaluation, 'a2a3')).toBe(99); // Not in list
  });

  it('should detect critical position with large gap', () => {
    const criticalEval = {
      ...mockEvaluation,
      moves: [
        { move: 'e2e4', score: 200, isTactical: false },
        { move: 'd2d4', score: 50, isTactical: false },
      ],
    };
    expect(isPositionCritical(criticalEval)).toBe(true);
  });

  it('should not detect critical position with small gap', () => {
    expect(isPositionCritical(mockEvaluation)).toBe(false);
  });

  it('should handle evaluation with one move', () => {
    const singleMoveEval = {
      ...mockEvaluation,
      moves: [{ move: 'e2e4', score: 30, isTactical: false }],
    };
    expect(isPositionCritical(singleMoveEval)).toBe(false);
  });
});
