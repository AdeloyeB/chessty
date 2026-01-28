/**
 * Analysis Service
 *
 * Handles database operations for chess game analysis.
 * This service saves and retrieves engine evaluations for games and individual moves.
 *
 * Key concepts:
 * - "Centipawns" = 1/100th of a pawn. Used to measure position advantage.
 *   +100 cp means white is up roughly one pawn worth.
 * - "Classification" = quality rating of a move (brilliant, best, good, inaccuracy, mistake, blunder)
 * - "Principal Variation" = the engine's predicted best sequence of moves from this position
 */

import { eq, and, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, games, moveAnalysis } from '../drizzle';
import type { MoveAnalysis, NewMoveAnalysis } from '../drizzle';

// ============================================================================
// Types for analysis data
// ============================================================================

/**
 * Move classification categories, ordered from best to worst.
 * These match Chess.com/Lichess terminology.
 */
export type MoveClassification =
  | 'brilliant'    // Exceptional move that's hard to find
  | 'great'        // Strong move that creates significant advantage
  | 'best'         // The engine's top choice
  | 'excellent'    // Nearly as good as the best move
  | 'good'         // Reasonable move, small centipawn loss
  | 'book'         // Known opening theory move
  | 'inaccuracy'   // Small mistake, loses some advantage (typically 50-100 cp)
  | 'mistake'      // Significant error, loses notable advantage (100-200 cp)
  | 'blunder';     // Serious error, loses major advantage or game (200+ cp)

/**
 * Input data for a single move's analysis.
 * This is what you pass when saving analysis results.
 */
export interface MoveAnalysisInput {
  moveNumber: number;
  playerColor: 'white' | 'black';
  evalBefore: number | null;        // Centipawns before move
  evalAfter: number | null;         // Centipawns after move
  evalMateIn: number | null;        // Forced mate in N (null if not mate)
  bestMove: string | null;          // UCI format (e.g., "e2e4")
  bestMoveSan: string | null;       // SAN format (e.g., "e4")
  principalVariation: string[] | null;  // Best line of play
  classification: MoveClassification;
  centipawnLoss: number | null;     // How much worse than best move
  engineDepth: number;              // Search depth
  engineName: string;               // Which engine (e.g., "stockfish-16")
}

/**
 * Full game analysis including aggregate stats.
 * This is what you pass to save a complete game analysis.
 */
export interface GameAnalysisInput {
  engine: string;                   // Engine name (e.g., "stockfish-16")
  depth: number;                    // Analysis depth
  whiteAccuracy: number;            // Overall accuracy percentage (0-100)
  blackAccuracy: number;            // Overall accuracy percentage (0-100)
  whiteBlunders: number;
  blackBlunders: number;
  whiteMistakes: number;
  blackMistakes: number;
  whiteInaccuracies: number;
  blackInaccuracies: number;
  moves: MoveAnalysisInput[];       // Per-move analysis
}

/**
 * Response format for game analysis queries.
 */
export interface GameAnalysisResult {
  gameId: string;
  engine: string | null;
  depth: number | null;
  completedAt: Date | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteBlunders: number;
  blackBlunders: number;
  whiteMistakes: number;
  blackMistakes: number;
  whiteInaccuracies: number;
  blackInaccuracies: number;
  moves: MoveAnalysis[];
}

// ============================================================================
// Database operations
// ============================================================================

/**
 * Save complete game analysis to the database.
 *
 * This function:
 * 1. Updates the games table with aggregate stats (accuracy, blunder counts, etc.)
 * 2. Inserts all move analyses into the move_analysis table
 *
 * Uses a transaction to ensure all-or-nothing: if any part fails, nothing is saved.
 *
 * @param gameId - The game to save analysis for
 * @param analysis - Complete analysis data including all moves
 * @throws Error if game doesn't exist
 */
export async function saveGameAnalysis(
  gameId: string,
  analysis: GameAnalysisInput
): Promise<void> {
  // Verify game exists before saving analysis
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Use a transaction to ensure atomicity
  // Either ALL the data is saved, or NONE of it is
  await db.transaction(async (tx) => {
    // 1. Update the games table with aggregate analysis data
    await tx
      .update(games)
      .set({
        analysisEngine: analysis.engine,
        analysisDepth: analysis.depth,
        analysisCompletedAt: new Date(),
        whiteAccuracy: analysis.whiteAccuracy.toFixed(2),
        blackAccuracy: analysis.blackAccuracy.toFixed(2),
        whiteBlunders: analysis.whiteBlunders,
        blackBlunders: analysis.blackBlunders,
        whiteMistakes: analysis.whiteMistakes,
        blackMistakes: analysis.blackMistakes,
        whiteInaccuracies: analysis.whiteInaccuracies,
        blackInaccuracies: analysis.blackInaccuracies,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));

    // 2. Delete any existing move analyses for this game
    // This allows re-analysis with different settings
    await tx
      .delete(moveAnalysis)
      .where(eq(moveAnalysis.gameId, gameId));

    // 3. Insert all move analyses
    if (analysis.moves.length > 0) {
      const moveRecords: NewMoveAnalysis[] = analysis.moves.map((move) => ({
        id: nanoid(),
        gameId,
        moveNumber: move.moveNumber,
        playerColor: move.playerColor,
        evalBefore: move.evalBefore,
        evalAfter: move.evalAfter,
        evalMateIn: move.evalMateIn,
        bestMove: move.bestMove,
        bestMoveSan: move.bestMoveSan,
        principalVariation: move.principalVariation,
        classification: move.classification,
        centipawnLoss: move.centipawnLoss,
        engineDepth: move.engineDepth,
        engineName: move.engineName,
        analyzedAt: new Date(),
      }));

      await tx.insert(moveAnalysis).values(moveRecords);
    }
  });
}

/**
 * Get complete analysis for a game including all move analyses.
 *
 * @param gameId - The game to retrieve analysis for
 * @returns Analysis data or null if game doesn't exist or isn't analyzed
 */
export async function getGameAnalysis(gameId: string): Promise<GameAnalysisResult | null> {
  // Fetch game with analysis columns
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    return null;
  }

  // Fetch all move analyses, ordered by move number
  const moves = await db
    .select()
    .from(moveAnalysis)
    .where(eq(moveAnalysis.gameId, gameId))
    .orderBy(asc(moveAnalysis.moveNumber));

  return {
    gameId,
    engine: game.analysisEngine,
    depth: game.analysisDepth,
    completedAt: game.analysisCompletedAt,
    whiteAccuracy: game.whiteAccuracy ? parseFloat(game.whiteAccuracy) : null,
    blackAccuracy: game.blackAccuracy ? parseFloat(game.blackAccuracy) : null,
    whiteBlunders: game.whiteBlunders ?? 0,
    blackBlunders: game.blackBlunders ?? 0,
    whiteMistakes: game.whiteMistakes ?? 0,
    blackMistakes: game.blackMistakes ?? 0,
    whiteInaccuracies: game.whiteInaccuracies ?? 0,
    blackInaccuracies: game.blackInaccuracies ?? 0,
    moves,
  };
}

/**
 * Get analysis for a single move in a game.
 *
 * Useful for displaying analysis as user steps through moves,
 * rather than loading all moves at once.
 *
 * @param gameId - The game ID
 * @param moveNumber - Which move to get (1-indexed)
 * @returns Move analysis or null if not found
 */
export async function getMoveAnalysis(
  gameId: string,
  moveNumber: number
): Promise<MoveAnalysis | null> {
  const result = await db
    .select()
    .from(moveAnalysis)
    .where(
      and(
        eq(moveAnalysis.gameId, gameId),
        eq(moveAnalysis.moveNumber, moveNumber)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Check if a game has been analyzed.
 *
 * Quick check without loading all analysis data.
 *
 * @param gameId - The game to check
 * @returns true if game has analysis data
 */
export async function isGameAnalyzed(gameId: string): Promise<boolean> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    columns: {
      analysisCompletedAt: true,
    },
  });

  return game?.analysisCompletedAt !== null && game?.analysisCompletedAt !== undefined;
}

/**
 * Update game to mark it as analyzed (without move details).
 *
 * Useful when you want to record that analysis was performed
 * without storing per-move data (e.g., for quick accuracy calculation).
 *
 * @param gameId - The game to mark as analyzed
 * @param engine - Engine name used for analysis
 * @param depth - Search depth used
 */
export async function markGameAnalyzed(
  gameId: string,
  engine: string,
  depth: number
): Promise<void> {
  await db
    .update(games)
    .set({
      analysisEngine: engine,
      analysisDepth: depth,
      analysisCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId));
}

/**
 * Delete all analysis data for a game.
 *
 * Useful when re-analyzing with different settings or
 * cleaning up test data.
 *
 * @param gameId - The game to clear analysis for
 */
export async function clearGameAnalysis(gameId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Clear move analyses (CASCADE would handle this, but being explicit)
    await tx
      .delete(moveAnalysis)
      .where(eq(moveAnalysis.gameId, gameId));

    // Clear game-level analysis data
    await tx
      .update(games)
      .set({
        analysisEngine: null,
        analysisDepth: null,
        analysisCompletedAt: null,
        whiteAccuracy: null,
        blackAccuracy: null,
        whiteBlunders: 0,
        blackBlunders: 0,
        whiteMistakes: 0,
        blackMistakes: 0,
        whiteInaccuracies: 0,
        blackInaccuracies: 0,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));
  });
}

/**
 * Get accuracy stats for a user across their games.
 *
 * Calculates average accuracy from all analyzed games.
 *
 * @param userId - The user to get stats for
 * @param color - Optional filter for 'white' or 'black' games only
 * @returns Average accuracy percentage or null if no analyzed games
 */
export async function getUserAccuracyStats(
  userId: string,
  color?: 'white' | 'black'
): Promise<{ averageAccuracy: number; gamesAnalyzed: number } | null> {
  // Get all analyzed games for this user
  const analyzedGames = await db.query.games.findMany({
    where: and(
      eq(games.analysisCompletedAt, games.analysisCompletedAt), // Has been analyzed
    ),
    columns: {
      whitePlayerId: true,
      blackPlayerId: true,
      whiteAccuracy: true,
      blackAccuracy: true,
    },
  });

  // Filter to games this user played and has accuracy data
  const userGames = analyzedGames.filter((game) => {
    const isWhite = game.whitePlayerId === userId;
    const isBlack = game.blackPlayerId === userId;

    if (!isWhite && !isBlack) return false;
    if (color === 'white' && !isWhite) return false;
    if (color === 'black' && !isBlack) return false;

    const accuracy = isWhite ? game.whiteAccuracy : game.blackAccuracy;
    return accuracy !== null;
  });

  if (userGames.length === 0) {
    return null;
  }

  // Calculate average accuracy
  let totalAccuracy = 0;
  for (const game of userGames) {
    const isWhite = game.whitePlayerId === userId;
    const accuracy = isWhite ? game.whiteAccuracy : game.blackAccuracy;
    totalAccuracy += parseFloat(accuracy!);
  }

  return {
    averageAccuracy: totalAccuracy / userGames.length,
    gamesAnalyzed: userGames.length,
  };
}
