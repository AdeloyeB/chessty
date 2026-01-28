/**
 * Chess Engine Analysis Types
 * ===========================
 *
 * Type definitions for Stockfish engine analysis integration.
 * These types are used across the desktop app (Tauri + Rust backend)
 * and the web frontend for displaying analysis results.
 *
 * WHAT IS ENGINE ANALYSIS?
 * Chess engines like Stockfish evaluate positions and suggest the best moves.
 * The evaluation is measured in "centipawns" (100 centipawns = 1 pawn advantage).
 * A score of +150 means white is ahead by about 1.5 pawns.
 *
 * HOW THIS INTEGRATES WITH THE APP:
 * 1. User requests analysis of a game or position
 * 2. Frontend calls Tauri IPC: invoke('analyze_position', { fen, depth })
 * 3. Rust backend runs Stockfish and returns EngineEvaluation
 * 4. Frontend displays results and classifies each move
 */

// ---------------------------------------------------------------------------
// Engine Evaluation
// ---------------------------------------------------------------------------

/**
 * Raw evaluation data returned by the chess engine.
 *
 * This represents Stockfish's analysis of a single position.
 * The engine calculates how good the position is for the side to move
 * and suggests the best continuation.
 */
export interface EngineEvaluation {
  /**
   * The position being analyzed in FEN notation.
   * FEN (Forsyth-Edwards Notation) is a standard way to describe
   * a chess position as a single string.
   */
  fen: string;

  /**
   * Best move in UCI (Universal Chess Interface) format.
   * UCI is how chess engines communicate moves: "e2e4" means
   * move the piece from e2 to e4.
   */
  bestMove: string;

  /**
   * Best move in SAN (Standard Algebraic Notation) format.
   * SAN is human-readable: "e4", "Nf3", "O-O" (castling).
   * Optional because some engine outputs only provide UCI.
   */
  bestMoveSan?: string;

  /**
   * Score in centipawns (1/100th of a pawn).
   *
   * INTERPRETING SCORES:
   * - Positive = side to move is better
   * - +100 = roughly one pawn advantage
   * - +300 = roughly one minor piece (bishop/knight) advantage
   * - +500 = roughly one rook advantage
   *
   * Scores beyond +/- 1000 usually mean a decisive advantage.
   */
  scoreCp: number;

  /**
   * Mate in N moves, if applicable.
   * - null = not a forced mate sequence
   * - Positive = side to move can force mate in N moves
   * - Negative = side to move will be mated in N moves
   *
   * When scoreMate is set, scoreCp is typically a very large number
   * (like +/- 30000) to indicate winning/losing.
   */
  scoreMate: number | null;

  /**
   * Search depth (how many moves ahead the engine calculated).
   * Higher depth = more accurate but slower analysis.
   * Typical values: 15-25 for quick analysis, 30+ for deep analysis.
   */
  depth: number;

  /**
   * Principal Variation (PV) - the engine's predicted best line.
   * Array of moves in UCI format showing the best play for both sides.
   * Example: ["e2e4", "e7e5", "g1f3", "b8c6"]
   */
  pv: string[];

  /**
   * Number of positions (nodes) the engine evaluated.
   * Useful for performance metrics.
   */
  nodes?: number;

  /**
   * Time spent on analysis in milliseconds.
   */
  timeMs?: number;
}

/**
 * Information about the chess engine itself.
 * Retrieved when the engine is initialized.
 */
export interface EngineInfo {
  /** Engine name (e.g., "Stockfish 16") */
  name: string;

  /** Engine author/team */
  author: string;

  /** Whether the engine is ready to receive commands */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Move Classification
// ---------------------------------------------------------------------------

/**
 * How good or bad a move was compared to the engine's best move.
 *
 * This categorization helps players understand their game:
 * - Which moves were excellent?
 * - Where did they make mistakes?
 * - What could they have done better?
 *
 * Classification is based on "centipawn loss" - how much advantage
 * was lost compared to the best move.
 */
export type MoveClassification =
  /** Best move in a sharp position with big eval swing (>= 200cp swing in player's favor) */
  | 'brilliant'
  /** Best move with significant advantage gain (>= 100cp swing) */
  | 'great'
  /** Engine's top choice - the objectively best move */
  | 'best'
  /** Within 10cp of best - essentially just as good */
  | 'excellent'
  /** Within 50cp of best - a reasonable choice */
  | 'good'
  /** Opening theory move - recognized opening book move */
  | 'book'
  /** Lost 50-100cp compared to best move */
  | 'inaccuracy'
  /** Lost 100-300cp - a notable error */
  | 'mistake'
  /** Lost more than 300cp - a serious error, often game-changing */
  | 'blunder';

// ---------------------------------------------------------------------------
// Analyzed Move
// ---------------------------------------------------------------------------

/**
 * A single move from the game with full analysis data.
 *
 * This combines the original move info with engine evaluation
 * and a human-readable classification of how good the move was.
 */
export interface AnalyzedMove {
  /** Index of this move in the game (0-indexed) */
  moveIndex: number;

  /**
   * Move in Standard Algebraic Notation (human-readable).
   * Examples: "e4", "Nf3", "Bxc6+", "O-O-O"
   */
  san: string;

  /**
   * Move in UCI format (machine-readable).
   * Examples: "e2e4", "g1f3", "f1c4"
   */
  uci: string;

  /** FEN of the position AFTER this move was played */
  fen: string;

  /** Engine's evaluation of the position after this move */
  evaluation: EngineEvaluation;

  /** How this move was classified (best, good, blunder, etc.) */
  classification: MoveClassification;

  /**
   * Change in evaluation from the previous position.
   * Positive = good for the player who moved.
   * Negative = the move made things worse.
   *
   * This is normalized to the moving player's perspective:
   * - If white moves and eval goes from +100 to +150, delta = +50
   * - If black moves and eval goes from +100 to +50, delta = +50 (good for black)
   */
  evalDelta: number;

  /** What the engine thought was the best move (UCI format) */
  bestMove: string;

  /** What the engine thought was the best move (SAN format) */
  bestMoveSan?: string;
}

// ---------------------------------------------------------------------------
// Game Analysis
// ---------------------------------------------------------------------------

/**
 * Complete analysis of an entire game.
 *
 * This is what you get after analyzing all positions in a game.
 * It includes individual move analysis plus overall statistics.
 */
export interface GameAnalysis {
  /** ID of the analyzed game */
  gameId: string;

  /** Analysis for each move in the game */
  moves: AnalyzedMove[];

  /**
   * White's accuracy percentage (0-100).
   * Based on how close their moves were to engine recommendations.
   * 90+ = excellent, 70-90 = good, <70 = needs improvement
   */
  whiteAccuracy: number;

  /**
   * Black's accuracy percentage (0-100).
   */
  blackAccuracy: number;

  /** Breakdown of move classifications by player */
  summary: AnalysisSummary;

  /** Which engine performed the analysis */
  engineName: string;

  /** Search depth used for analysis */
  engineDepth: number;

  /** When the analysis was performed */
  analyzedAt: Date;
}

/**
 * Summary counts of move classifications for each player.
 *
 * Useful for displaying a quick overview like:
 * "White: 5 best, 3 excellent, 1 inaccuracy, 1 mistake"
 */
export interface AnalysisSummary {
  // White's move breakdown
  whiteBrilliant: number;
  whiteGreat: number;
  whiteBest: number;
  whiteExcellent: number;
  whiteGood: number;
  whiteInaccuracy: number;
  whiteMistake: number;
  whiteBlunder: number;

  // Black's move breakdown
  blackBrilliant: number;
  blackGreat: number;
  blackBest: number;
  blackExcellent: number;
  blackGood: number;
  blackInaccuracy: number;
  blackMistake: number;
  blackBlunder: number;
}

// ---------------------------------------------------------------------------
// Analysis Progress
// ---------------------------------------------------------------------------

/**
 * Progress updates during game analysis.
 *
 * Analyzing a full game takes time (analyzing each position).
 * This type is used to show progress to the user.
 */
export interface AnalysisProgress {
  /** Current position being analyzed (1-indexed for display) */
  current: number;

  /** Total positions to analyze */
  total: number;

  /** FEN of position currently being analyzed */
  currentFen?: string;
}

// ---------------------------------------------------------------------------
// Analysis Request Types
// ---------------------------------------------------------------------------

/**
 * Parameters for requesting position analysis.
 */
export interface AnalyzePositionRequest {
  /** Position to analyze in FEN format */
  fen: string;

  /** How deep to search (default: 20) */
  depth?: number;

  /** Maximum time to spend in milliseconds (optional timeout) */
  maxTimeMs?: number;
}

/**
 * Parameters for requesting full game analysis.
 */
export interface AnalyzeGameRequest {
  /** List of FEN positions (one for each move including start) */
  fens: string[];

  /** List of moves in SAN format (parallel to fens) */
  moves: string[];

  /** List of moves in UCI format (parallel to fens) */
  movesUci: string[];

  /** How deep to search each position (default: 20) */
  depth?: number;
}
