/**
 * Calibration Weights Loader
 * ==========================
 *
 * This module loads anti-cheat calibration weights from the database.
 *
 * HOW IT WORKS:
 * 1. On server startup, call loadCalibrationWeights()
 * 2. It fetches the active weights from the calibration_weights table
 * 3. If no active weights exist, it uses sensible defaults
 * 4. The aggregateSuspicionScore() function uses these weights
 *
 * WHY THIS EXISTS:
 * Instead of hardcoding weights like { engine: 0.35, timing: 0.20, ... },
 * we store them in the database. This lets us:
 * - Update weights without code changes
 * - Run calibration and apply results immediately
 * - Track which calibration version is active
 * - Roll back to previous weights if needed
 */

import { db, calibrationWeights } from '../../drizzle';
import { eq, desc } from 'drizzle-orm';
import type { SignalWeights, ActionThresholds } from './calibration/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadedCalibration {
  version: string;
  weights: SignalWeights;
  thresholds: ActionThresholds;
  metrics?: {
    truePositiveRate: number;
    falsePositiveRate: number;
    f1Score: number;
    auc: number;
  };
  loadedAt: Date;
}

// ---------------------------------------------------------------------------
// Default Weights (Fallback)
// ---------------------------------------------------------------------------

/**
 * Default weights used when no calibration exists in the database.
 * These are reasonable starting points but should be replaced with
 * calibrated values as soon as possible.
 */
export const DEFAULT_WEIGHTS: SignalWeights = {
  engine: 0.35,      // Engine correlation is strongest signal
  behavior: 0.20,    // Behavior shift is moderate signal
  skillShift: 0.20,  // Mid-game shift is strong when detected
  timing: 0.15,      // Timing anomalies are supportive
  mouse: 0.10,       // Mouse patterns are weakest (easy to spoof)
};

export const DEFAULT_THRESHOLDS: ActionThresholds = {
  monitor: 0.20,           // Light monitoring
  restrictStakes: 0.40,    // Limit bet sizes
  flagForReview: 0.60,     // Human review needed
  suspend: 0.80,           // Auto-suspend pending review
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Currently loaded calibration (singleton)
let currentCalibration: LoadedCalibration | null = null;

// ---------------------------------------------------------------------------
// Loader Functions
// ---------------------------------------------------------------------------

/**
 * Load calibration weights from the database.
 *
 * This should be called during server startup. It fetches the currently
 * active calibration from the database and caches it in memory.
 *
 * @returns The loaded calibration, or defaults if none exists
 */
export async function loadCalibrationWeights(): Promise<LoadedCalibration> {
  console.log('[AntiCheat] Loading calibration weights from database...');

  try {
    // Find the active calibration
    const active = await db.query.calibrationWeights.findFirst({
      where: eq(calibrationWeights.isActive, true),
      orderBy: desc(calibrationWeights.createdAt),
    });

    if (active) {
      // Parse weights from database (Drizzle returns numeric as strings)
      const weights = {
        engine: parseFloat(active.engineWeight),
        behavior: parseFloat(active.behaviorWeight),
        skillShift: parseFloat(active.skillShiftWeight),
        timing: parseFloat(active.timingWeight),
        mouse: parseFloat(active.mouseWeight),
      };

      const thresholds = {
        monitor: parseFloat(active.thresholdMonitor),
        restrictStakes: parseFloat(active.thresholdRestrictStakes),
        flagForReview: parseFloat(active.thresholdFlagForReview),
        suspend: parseFloat(active.thresholdSuspend),
      };

      // CRITICAL: Validate no NaN values (indicates DB corruption or migration issue)
      const allWeightValues = Object.values(weights);
      const allThresholdValues = Object.values(thresholds);
      const hasInvalidWeight = allWeightValues.some(w => isNaN(w) || w < 0 || w > 1);
      const hasInvalidThreshold = allThresholdValues.some(t => isNaN(t) || t < 0 || t > 1);

      if (hasInvalidWeight || hasInvalidThreshold) {
        console.error('[AntiCheat] Invalid values in database calibration:', { weights, thresholds });
        throw new Error('Database calibration contains invalid weights - falling back to defaults');
      }

      // Validate weights sum to ~1.0 (±0.05 tolerance for rounding)
      const weightSum = allWeightValues.reduce((sum, w) => sum + w, 0);
      if (Math.abs(weightSum - 1.0) > 0.05) {
        console.warn(`[AntiCheat] Calibration weights sum to ${weightSum.toFixed(3)}, expected ~1.0`);
      }

      // Validate thresholds are in ascending order
      if (!(thresholds.monitor <= thresholds.restrictStakes &&
            thresholds.restrictStakes <= thresholds.flagForReview &&
            thresholds.flagForReview <= thresholds.suspend)) {
        console.warn('[AntiCheat] Calibration thresholds are not in ascending order:', thresholds);
      }

      currentCalibration = {
        version: active.version,
        weights,
        thresholds,
        metrics: active.truePositiveRate ? {
          truePositiveRate: parseFloat(active.truePositiveRate),
          falsePositiveRate: parseFloat(active.falsePositiveRate || '0'),
          f1Score: parseFloat(active.f1Score || '0'),
          auc: parseFloat(active.auc || '0'),
        } : undefined,
        loadedAt: new Date(),
      };

      console.log(`[AntiCheat] Loaded calibration v${active.version}`);
      console.log(`[AntiCheat] Weights: engine=${currentCalibration.weights.engine}, ` +
        `behavior=${currentCalibration.weights.behavior}, ` +
        `skillShift=${currentCalibration.weights.skillShift}, ` +
        `timing=${currentCalibration.weights.timing}, ` +
        `mouse=${currentCalibration.weights.mouse}`);

      if (currentCalibration.metrics) {
        console.log(`[AntiCheat] Calibration metrics: TPR=${currentCalibration.metrics.truePositiveRate}, ` +
          `FPR=${currentCalibration.metrics.falsePositiveRate}, ` +
          `F1=${currentCalibration.metrics.f1Score}`);
      }

      return currentCalibration;
    }
  } catch (error) {
    console.error('[AntiCheat] Failed to load calibration from database:', error);
  }

  // Fall back to defaults
  console.log('[AntiCheat] No active calibration found, using defaults');
  currentCalibration = {
    version: 'default-v1',
    weights: DEFAULT_WEIGHTS,
    thresholds: DEFAULT_THRESHOLDS,
    loadedAt: new Date(),
  };

  return currentCalibration;
}

/**
 * Get the currently loaded calibration weights.
 *
 * If weights haven't been loaded yet, returns defaults.
 * Call loadCalibrationWeights() during startup to ensure
 * database values are used.
 */
export function getCalibrationWeights(): LoadedCalibration {
  if (!currentCalibration) {
    console.warn('[AntiCheat] Calibration not loaded, using defaults. Call loadCalibrationWeights() on startup.');
    return {
      version: 'default-v1',
      weights: DEFAULT_WEIGHTS,
      thresholds: DEFAULT_THRESHOLDS,
      loadedAt: new Date(),
    };
  }

  return currentCalibration;
}

/**
 * Get just the signal weights (convenience function).
 */
export function getSignalWeights(): SignalWeights {
  return getCalibrationWeights().weights;
}

/**
 * Get just the action thresholds (convenience function).
 */
export function getActionThresholds(): ActionThresholds {
  return getCalibrationWeights().thresholds;
}

/**
 * Reload calibration weights from the database.
 *
 * Call this after running a new calibration and activating it,
 * or when you want to hot-reload weights without restarting.
 */
export async function reloadCalibrationWeights(): Promise<LoadedCalibration> {
  console.log('[AntiCheat] Reloading calibration weights...');
  return loadCalibrationWeights();
}

/**
 * Check if calibration has been loaded.
 */
export function isCalibrationLoaded(): boolean {
  return currentCalibration !== null;
}

/**
 * Get calibration status for health checks.
 */
export function getCalibrationStatus(): {
  loaded: boolean;
  version: string;
  isDefault: boolean;
  loadedAt: Date | null;
} {
  return {
    loaded: currentCalibration !== null,
    version: currentCalibration?.version || 'not-loaded',
    isDefault: currentCalibration?.version.startsWith('default') ?? true,
    loadedAt: currentCalibration?.loadedAt || null,
  };
}
