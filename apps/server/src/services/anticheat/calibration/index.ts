/**
 * Anti-Cheat Calibration System
 * =============================
 *
 * This module provides tools to calibrate the anti-cheat system using
 * real game data from Lichess.
 *
 * USAGE:
 * 1. Collect cheater and clean player usernames
 * 2. Run fetchCalibrationDataset() to get games
 * 3. Run runCalibration() to find optimal weights
 * 4. Update aggregateSuspicionScore() with new weights
 *
 * EXAMPLE:
 * ```typescript
 * import { fetchCalibrationDataset, runCalibration } from './calibration';
 *
 * const dataset = await fetchCalibrationDataset(
 *   ['cheater1', 'cheater2'],  // Known cheaters
 *   ['cleanPlayer1', 'cleanPlayer2'],  // Known clean players
 *   50  // Games per player
 * );
 *
 * const result = await runCalibration(dataset);
 * console.log('Optimal weights:', result.optimizedWeights);
 * ```
 */

// Re-export everything
export * from './types';
export * from './lichess-client';
export * from './calibrator';

// Convenience function for running full calibration
import { fetchCalibrationDataset } from './lichess-client';
import { runCalibration } from './calibrator';
import type { CalibrationResult, LichessFetchOptions } from './types';

/**
 * Run a complete calibration from usernames to results
 *
 * @param cheaterUsernames - Array of confirmed cheater Lichess usernames
 * @param cleanUsernames - Array of verified clean player Lichess usernames
 * @param gamesPerPlayer - Number of games to analyze per player
 * @param options - Additional fetch options
 * @returns Calibration result with optimized weights and thresholds
 */
export async function calibrateFromUsernames(
  cheaterUsernames: string[],
  cleanUsernames: string[],
  gamesPerPlayer: number = 50,
  options?: LichessFetchOptions
): Promise<CalibrationResult> {
  // Fetch dataset
  const dataset = await fetchCalibrationDataset(
    cheaterUsernames,
    cleanUsernames,
    gamesPerPlayer,
    options
  );

  if (dataset.length === 0) {
    throw new Error('No games fetched - check usernames and Lichess API status');
  }

  // Run calibration
  return runCalibration(dataset);
}
