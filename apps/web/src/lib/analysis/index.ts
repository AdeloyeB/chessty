/**
 * Analysis Utilities
 * ==================
 *
 * Exports all utilities for working with chess engine analysis.
 *
 * USAGE:
 * ```ts
 * import {
 *   // Full game analysis
 *   analyzeGame,
 *   getMovesByClassification,
 *   getCriticalMoments,
 *
 *   // Individual move classification
 *   classifyMove,
 *   getClassificationColor,
 *   getClassificationSymbol,
 *
 *   // Eval formatting
 *   formatEval,
 *
 *   // Accuracy calculation
 *   calculateAccuracy,
 *   getAccuracyRating,
 * } from '@/lib/analysis';
 * ```
 */

export * from './gameAnalyzer';
export * from './moveClassifier';
export * from './evalFormatter';
export * from './accuracyCalculator';
