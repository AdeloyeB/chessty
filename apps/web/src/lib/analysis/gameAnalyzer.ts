/**
 * Game Analyzer
 * =============
 *
 * Processes raw engine evaluations and game moves to produce a complete GameAnalysis.
 *
 * WHAT THIS DOES:
 * 1. Takes raw EngineEvaluation[] from Stockfish analysis
 * 2. Computes eval deltas normalized to the moving player's perspective
 * 3. Classifies each move (brilliant, best, blunder, etc.)
 * 4. Calculates accuracy percentages for white/black
 * 5. Generates summary counts of each classification
 *
 * This is the "glue" that combines moveClassifier + accuracyCalculator
 * to produce a full GameAnalysis object ready for the UI.
 */

import type {
  EngineEvaluation,
  GameAnalysis,
  AnalyzedMove,
  AnalysisSummary,
  MoveClassification,
} from '@chess-game/shared';
import {
  classifyMove,
  normalizeEvalForMover,
  isBestMove,
} from './moveClassifier';
import { calculateAccuracy } from './accuracyCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input data required to analyze a game.
 *
 * This matches what the Tauri backend returns after analyzing all positions.
 */
export interface GameAnalysisInput {
  /** Unique identifier for the game being analyzed */
  gameId: string;

  /**
   * Engine evaluations for each position.
   *
   * IMPORTANT: This array should have N+1 elements for a game with N moves.
   * - evaluations[0] = evaluation of the starting position (before any moves)
   * - evaluations[1] = evaluation AFTER move 1 was played
   * - evaluations[N] = evaluation AFTER the final move
   *
   * The engine returns what IT thinks is best from each position,
   * but the player may have played a different move.
   */
  evaluations: EngineEvaluation[];

  /**
   * Moves played in the game (SAN format).
   *
   * This should have N elements for a game with N moves.
   * moves[0] = first move played (white's first move)
   */
  movesSan: string[];

  /**
   * Moves played in the game (UCI format).
   *
   * Parallel to movesSan. Used for comparing with engine's best move.
   */
  movesUci: string[];

  /**
   * FEN positions AFTER each move.
   *
   * fens[0] = position AFTER move 1
   * This should have N elements (same as moves).
   */
  fens: string[];

  /** Name of the engine that performed analysis (e.g., "Stockfish 16") */
  engineName?: string;

  /** Search depth used for analysis */
  engineDepth?: number;
}

// ---------------------------------------------------------------------------
// Main Analysis Function
// ---------------------------------------------------------------------------

/**
 * Analyze a complete chess game.
 *
 * Takes raw engine data and produces a full GameAnalysis object with:
 * - Classified moves (brilliant, best, blunder, etc.)
 * - Accuracy percentages
 * - Summary statistics
 *
 * @param input - Game data and engine evaluations
 * @returns Complete game analysis
 *
 * @example
 * ```ts
 * const analysis = analyzeGame({
 *   gameId: 'game-123',
 *   evaluations: stockfishResults,
 *   movesSan: ['e4', 'e5', 'Nf3', ...],
 *   movesUci: ['e2e4', 'e7e5', 'g1f3', ...],
 *   fens: [...],
 *   engineName: 'Stockfish 16',
 *   engineDepth: 20,
 * });
 *
 * console.log(`White accuracy: ${analysis.whiteAccuracy}%`);
 * console.log(`Blunders by black: ${analysis.summary.blackBlunder}`);
 * ```
 */
export function analyzeGame(input: GameAnalysisInput): GameAnalysis {
  const {
    gameId,
    evaluations,
    movesSan,
    movesUci,
    fens,
    engineName = 'Stockfish',
    engineDepth = 20,
  } = input;

  // Validate inputs
  if (evaluations.length < 2) {
    throw new Error('Need at least 2 evaluations (before and after first move)');
  }
  if (movesSan.length !== movesUci.length) {
    throw new Error('movesSan and movesUci must have same length');
  }
  if (movesSan.length !== fens.length) {
    throw new Error('movesSan and fens must have same length');
  }
  if (evaluations.length !== movesSan.length + 1) {
    throw new Error(
      `evaluations (${evaluations.length}) must have one more element than moves (${movesSan.length})`
    );
  }

  // Process each move
  const analyzedMoves: AnalyzedMove[] = [];

  for (let i = 0; i < movesSan.length; i++) {
    const isWhiteMove = i % 2 === 0;

    // Get evaluations before and after this move
    const evalBefore = evaluations[i];
    const evalAfter = evaluations[i + 1];

    // Normalize evaluations to the mover's perspective
    // Engine evals are from white's POV, so we flip for black
    const evalBeforeNormalized = normalizeEvalForMover(
      handleMateScore(evalBefore),
      isWhiteMove
    );
    const evalAfterNormalized = normalizeEvalForMover(
      handleMateScore(evalAfter),
      isWhiteMove
    );

    // Calculate eval delta (positive = good for mover)
    const evalDelta = evalAfterNormalized - evalBeforeNormalized;

    // Check if the player played the engine's best move
    const wasBestMove = isBestMove(movesUci[i], evalBefore.bestMove);

    // Classify the move
    const classification = classifyMove(
      evalBeforeNormalized,
      evalAfterNormalized,
      wasBestMove,
      isWhiteMove,
      false // TODO: Add book move detection in the future
    );

    // Build the analyzed move object
    const analyzedMove: AnalyzedMove = {
      moveIndex: i,
      san: movesSan[i],
      uci: movesUci[i],
      fen: fens[i],
      evaluation: evalAfter,
      classification,
      evalDelta,
      bestMove: evalBefore.bestMove,
      bestMoveSan: evalBefore.bestMoveSan,
    };

    analyzedMoves.push(analyzedMove);
  }

  // Calculate accuracy for both players
  const accuracy = calculateAccuracy(analyzedMoves);

  // Generate summary counts
  const summary = generateSummary(analyzedMoves);

  return {
    gameId,
    moves: analyzedMoves,
    whiteAccuracy: accuracy.white,
    blackAccuracy: accuracy.black,
    summary,
    engineName,
    engineDepth,
    analyzedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Handle mate scores by converting them to centipawn equivalent.
 *
 * When the engine detects forced mate, it returns a mate score instead of
 * centipawns. We convert these to large centipawn values for classification:
 * - Mate in 1 = ±30000 (instant win/loss)
 * - Mate in 10 = ±29000 (almost instant)
 *
 * @param evaluation - Engine evaluation that may contain mate score
 * @returns Centipawn score (converting mate to high cp value if needed)
 */
function handleMateScore(evaluation: EngineEvaluation): number {
  if (evaluation.scoreMate !== null) {
    // Convert mate score to centipawns
    // The closer the mate, the more extreme the value
    // Mate in 1 = 30000, Mate in 10 = 29100
    const mateValue = 30000 - Math.abs(evaluation.scoreMate) * 100;
    return evaluation.scoreMate > 0 ? mateValue : -mateValue;
  }
  return evaluation.scoreCp;
}

/**
 * Generate summary statistics for the analysis.
 *
 * Counts how many of each classification type each player made.
 *
 * @param moves - Analyzed moves
 * @returns Summary counts for both players
 */
function generateSummary(moves: AnalyzedMove[]): AnalysisSummary {
  // Initialize all counts to 0
  const summary: AnalysisSummary = {
    whiteBrilliant: 0,
    whiteGreat: 0,
    whiteBest: 0,
    whiteExcellent: 0,
    whiteGood: 0,
    whiteInaccuracy: 0,
    whiteMistake: 0,
    whiteBlunder: 0,
    blackBrilliant: 0,
    blackGreat: 0,
    blackBest: 0,
    blackExcellent: 0,
    blackGood: 0,
    blackInaccuracy: 0,
    blackMistake: 0,
    blackBlunder: 0,
  };

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const isWhite = i % 2 === 0;
    const prefix = isWhite ? 'white' : 'black';

    // Increment the appropriate counter based on classification
    incrementClassificationCount(summary, prefix, move.classification);
  }

  return summary;
}

/**
 * Increment the classification count in the summary.
 *
 * @param summary - Summary object to mutate
 * @param prefix - 'white' or 'black'
 * @param classification - The move classification
 */
function incrementClassificationCount(
  summary: AnalysisSummary,
  prefix: 'white' | 'black',
  classification: MoveClassification
): void {
  // Map classification to summary key
  // e.g., 'brilliant' + 'white' -> 'whiteBrilliant'
  const key = `${prefix}${capitalize(classification)}` as keyof AnalysisSummary;

  // 'book' moves aren't counted in summary (they're neutral opening theory)
  if (classification === 'book') {
    return;
  }

  // TypeScript knows these are all number properties
  (summary[key] as number)++;
}

/**
 * Capitalize first letter of a string.
 *
 * @param s - String to capitalize
 * @returns Capitalized string
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Classification Helpers (for UI convenience)
// ---------------------------------------------------------------------------

/**
 * Get all moves of a specific classification type.
 *
 * @param analysis - The game analysis
 * @param classification - Classification to filter by
 * @param color - Optional: filter by player color
 * @returns Array of analyzed moves matching the criteria
 */
export function getMovesByClassification(
  analysis: GameAnalysis,
  classification: MoveClassification,
  color?: 'white' | 'black'
): AnalyzedMove[] {
  return analysis.moves.filter((move, index) => {
    if (move.classification !== classification) return false;
    if (color === 'white' && index % 2 !== 0) return false;
    if (color === 'black' && index % 2 === 0) return false;
    return true;
  });
}

/**
 * Get the worst move in the game.
 *
 * Useful for highlighting the turning point of a game.
 *
 * @param analysis - The game analysis
 * @param color - Optional: only consider moves by this color
 * @returns The move with the worst eval delta (or null if no moves)
 */
export function getWorstMove(
  analysis: GameAnalysis,
  color?: 'white' | 'black'
): AnalyzedMove | null {
  let worstMove: AnalyzedMove | null = null;
  let worstDelta = 0;

  for (let i = 0; i < analysis.moves.length; i++) {
    const move = analysis.moves[i];

    // Filter by color if specified
    if (color === 'white' && i % 2 !== 0) continue;
    if (color === 'black' && i % 2 === 0) continue;

    // evalDelta is from mover's perspective, so negative is bad
    if (move.evalDelta < worstDelta) {
      worstDelta = move.evalDelta;
      worstMove = move;
    }
  }

  return worstMove;
}

/**
 * Get the best move in the game (highest positive impact).
 *
 * @param analysis - The game analysis
 * @param color - Optional: only consider moves by this color
 * @returns The move with the best eval delta (or null if no moves)
 */
export function getBestMove(
  analysis: GameAnalysis,
  color?: 'white' | 'black'
): AnalyzedMove | null {
  let bestMoveResult: AnalyzedMove | null = null;
  let bestDelta = -Infinity;

  for (let i = 0; i < analysis.moves.length; i++) {
    const move = analysis.moves[i];

    // Filter by color if specified
    if (color === 'white' && i % 2 !== 0) continue;
    if (color === 'black' && i % 2 === 0) continue;

    if (move.evalDelta > bestDelta) {
      bestDelta = move.evalDelta;
      bestMoveResult = move;
    }
  }

  return bestMoveResult;
}

/**
 * Get critical moments in the game.
 *
 * Critical moments are moves where the evaluation swung significantly.
 * These are often the most interesting positions to analyze.
 *
 * @param analysis - The game analysis
 * @param threshold - Minimum eval swing in centipawns (default: 100)
 * @returns Array of moves with significant eval changes
 */
export function getCriticalMoments(
  analysis: GameAnalysis,
  threshold = 100
): AnalyzedMove[] {
  return analysis.moves.filter(
    (move) => Math.abs(move.evalDelta) >= threshold
  );
}
