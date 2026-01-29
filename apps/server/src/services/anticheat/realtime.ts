/**
 * Real-Time Anti-Cheat Monitoring Service
 * =========================================
 *
 * This module provides live monitoring of active chess games for suspicious
 * activity. Unlike post-game analysis (which uses Stockfish to compare moves
 * to engine recommendations), real-time monitoring focuses on behavioral
 * signals that can be detected during play.
 *
 * WHY REAL-TIME MONITORING?
 * -------------------------
 * Post-game analysis with Stockfish is thorough but slow and expensive.
 * Real-time monitoring lets us:
 * 1. Flag games for priority post-game analysis (not every game needs Stockfish)
 * 2. Detect behavioral patterns that post-game analysis can't see (focus, timing)
 * 3. Enable live intervention in extreme cases (very high-stakes games)
 *
 * WHAT WE TRACK PER GAME:
 * - Suspicion score: Accumulated score from all detected anomalies
 * - Flags: Individual suspicious behaviors detected
 * - Move timing history: For pattern analysis
 * - Focus events: When the player alt-tabs away and returns
 * - Skill shift analyzer: Detects sudden improvement mid-game
 *
 * HOW IT WORKS:
 * 1. When a game starts, we create a monitoring session
 * 2. Each move is analyzed for behavioral anomalies
 * 3. Anomalies add to the player's suspicion score
 * 4. When score exceeds threshold, we flag for deep analysis
 * 5. When game ends, we clean up the session
 *
 * PRIVACY CONSIDERATIONS:
 * - We analyze patterns, not content (what other apps are open, etc.)
 * - Timing data is ephemeral (deleted after game ends)
 * - Only aggregated scores are persisted, not raw behavioral data
 */

import type { CheatFlag, CheatFlagType, CheatFlagSeverity } from '@chess-game/shared';
import type { MoveAnalysisData, TimeControlType } from './types';
import { MidGameShiftAnalyzer, isSkillShiftSuspicious } from './skill-shift';
import { analyzeTimingAnomaly } from './behavior-analysis';

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/**
 * Thresholds for taking action based on accumulated suspicion score.
 *
 * These are calibrated to minimize false positives while catching cheaters.
 * Values should be tuned based on empirical data from confirmed cases.
 */
export const SUSPICION_THRESHOLDS = {
  /** Below this: normal play, no action needed */
  NORMAL: 20,
  /** Above this: flag for increased monitoring */
  MONITOR: 40,
  /** Above this: restrict high-stakes games */
  RESTRICT: 60,
  /** Above this: require human review */
  REVIEW: 80,
  /** Above this: immediate suspension pending review */
  SUSPEND: 95,
} as const;

/**
 * Score contributions for different flag types.
 * Critical flags contribute more to the overall score.
 */
const FLAG_SCORE_WEIGHTS: Record<CheatFlagSeverity, number> = {
  low: 2,
  medium: 5,
  high: 15,
  critical: 30,
};

/**
 * Maximum score contribution from a single flag type.
 * Prevents one type of anomaly from dominating the score.
 */
const MAX_SINGLE_FLAG_TYPE_CONTRIBUTION = 40;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Monitoring state for a single player in a single game.
 * Tracks all the behavioral data we need to detect cheating.
 */
export interface PlayerGameMonitorState {
  /** Player ID */
  playerId: string;

  /** Game ID */
  gameId: string;

  /** Accumulated suspicion score (0-100) */
  suspicionScore: number;

  /** All flags raised during this game */
  flags: CheatFlag[];

  /** Count of each flag type (for capping contributions) */
  flagTypeCounts: Partial<Record<CheatFlagType, number>>;

  /** Move timing history (ms per move) */
  moveTimes: number[];

  /** Focus loss events (timestamp of each unfocus) */
  focusLossEvents: number[];

  /** Move data for skill shift analysis */
  moveAnalyses: MoveAnalysisData[];

  /** Skill shift analyzer instance (maintains sliding window state) */
  skillShiftAnalyzer: MidGameShiftAnalyzer;

  /** Time control type for timing expectations */
  timeControl: TimeControlType;

  /** When this monitoring session started */
  startedAt: number;

  /** Last move timestamp (for timing calculations) */
  lastMoveAt: number;

  /** Whether this player has already been flagged for review */
  flaggedForReview: boolean;

  /** Whether this game has been queued for deep analysis */
  queuedForDeepAnalysis: boolean;
}

/**
 * Behavioral data sent with each move for real-time analysis.
 * This data comes from the client (Tauri desktop app).
 */
export interface MoveBehaviorData {
  /** Time spent thinking on this move (ms) */
  moveTimeMs: number;

  /** Whether the window lost focus during thinking */
  focusLost: boolean;

  /** Duration of any focus loss (ms) */
  focusLostDurationMs?: number;

  /** Mouse path linearity (0-1, 1 = straight line) */
  mouseLinearity?: number;

  /** Position complexity estimate from client (0-100) */
  positionComplexity?: number;

  /** Whether this appeared to be a forced move */
  isForcedMove?: boolean;

  /** Number of legal moves in position */
  legalMoveCount?: number;

  /** Time remaining on clock (ms) */
  clockRemaining?: number;
}

/**
 * Result of analyzing a single move.
 */
export interface MoveAnalysisResult {
  /** New accumulated suspicion score */
  newScore: number;

  /** Any new flags raised by this move */
  newFlags: CheatFlag[];

  /** Whether this move triggered a threshold crossing */
  thresholdCrossed: 'none' | 'monitor' | 'restrict' | 'review' | 'suspend';

  /** Recommended action based on current state */
  recommendedAction: 'none' | 'monitor' | 'restrict_stakes' | 'flag_for_review' | 'suspend_pending_review';
}

// ---------------------------------------------------------------------------
// LiveGameMonitor Class
// ---------------------------------------------------------------------------

/**
 * Monitors active games for suspicious behavior in real-time.
 *
 * USAGE:
 * ```typescript
 * const monitor = new LiveGameMonitor();
 *
 * // When a game starts:
 * monitor.startMonitoring(gameId, whitePlayerId, blackPlayerId, 'blitz');
 *
 * // When a move is made:
 * const result = monitor.monitorMove(
 *   gameId,
 *   playerId,
 *   moveNumber,
 *   behaviorData
 * );
 *
 * // When a game ends:
 * const summary = monitor.endMonitoring(gameId);
 * ```
 */
export class LiveGameMonitor {
  /**
   * Active monitoring sessions indexed by "gameId:playerId".
   * We maintain separate state for each player in each game.
   */
  private sessions = new Map<string, PlayerGameMonitorState>();

  /**
   * Start monitoring a game for both players.
   *
   * @param gameId - The game ID
   * @param whitePlayerId - White player's user ID
   * @param blackPlayerId - Black player's user ID
   * @param timeControl - Time control type (affects timing expectations)
   */
  startMonitoring(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string,
    timeControl: TimeControlType
  ): void {
    const now = Date.now();

    // Create monitoring state for white player
    this.sessions.set(this.getSessionKey(gameId, whitePlayerId), {
      playerId: whitePlayerId,
      gameId,
      suspicionScore: 0,
      flags: [],
      flagTypeCounts: {},
      moveTimes: [],
      focusLossEvents: [],
      moveAnalyses: [],
      skillShiftAnalyzer: new MidGameShiftAnalyzer(),
      timeControl,
      startedAt: now,
      lastMoveAt: now,
      flaggedForReview: false,
      queuedForDeepAnalysis: false,
    });

    // Create monitoring state for black player
    this.sessions.set(this.getSessionKey(gameId, blackPlayerId), {
      playerId: blackPlayerId,
      gameId,
      suspicionScore: 0,
      flags: [],
      flagTypeCounts: {},
      moveTimes: [],
      focusLossEvents: [],
      moveAnalyses: [],
      skillShiftAnalyzer: new MidGameShiftAnalyzer(),
      timeControl,
      startedAt: now,
      lastMoveAt: now,
      flaggedForReview: false,
      queuedForDeepAnalysis: false,
    });

    console.log(`[AntiCheat] Started monitoring game ${gameId}`);
  }

  /**
   * Analyze a move for suspicious behavior.
   *
   * This is the main entry point called for each move during a game.
   * It runs all behavioral checks and updates the player's suspicion score.
   *
   * @param gameId - The game ID
   * @param playerId - The player who made the move
   * @param moveNumber - The move number (1-indexed)
   * @param behaviorData - Behavioral data captured with the move
   * @param moveAnalysis - Optional engine analysis data (if available)
   * @returns Analysis result with updated score and any new flags
   */
  monitorMove(
    gameId: string,
    playerId: string,
    moveNumber: number,
    behaviorData: MoveBehaviorData,
    moveAnalysis?: MoveAnalysisData
  ): MoveAnalysisResult {
    const session = this.sessions.get(this.getSessionKey(gameId, playerId));

    if (!session) {
      // No session means monitoring wasn't started - return neutral result
      return {
        newScore: 0,
        newFlags: [],
        thresholdCrossed: 'none',
        recommendedAction: 'none',
      };
    }

    const previousScore = session.suspicionScore;
    const newFlags: CheatFlag[] = [];

    // Record move timing
    session.moveTimes.push(behaviorData.moveTimeMs);
    session.lastMoveAt = Date.now();

    // Check 1: Focus loss pattern
    // Losing focus right before making a best move is suspicious
    if (behaviorData.focusLost) {
      session.focusLossEvents.push(Date.now());

      // Suspicion increases if focus loss followed by quick move
      if (behaviorData.moveTimeMs < 2000 && behaviorData.focusLostDurationMs && behaviorData.focusLostDurationMs > 1000) {
        const flag = this.createFlag(
          'instant_move_after_refocus',
          'medium',
          `Quick move (${behaviorData.moveTimeMs}ms) after ${behaviorData.focusLostDurationMs}ms unfocus`,
          gameId,
          playerId,
          moveNumber
        );
        newFlags.push(flag);
        this.addFlagToSession(session, flag);
      }
    }

    // Check 2: Timing anomalies
    // Compare move time to expected based on complexity and time control
    if (behaviorData.positionComplexity !== undefined && behaviorData.clockRemaining !== undefined) {
      const timingResult = analyzeTimingAnomaly(
        {
          moveTimeMs: behaviorData.moveTimeMs,
          positionComplexity: behaviorData.positionComplexity,
          legalMoveCount: behaviorData.legalMoveCount ?? 20,
          isForcedMove: behaviorData.isForcedMove ?? false,
          clockRemaining: behaviorData.clockRemaining,
          timeControl: session.timeControl,
        },
        this.calculateTimingVariance(session.moveTimes)
      );

      if (timingResult.score > 0.5 && timingResult.reason) {
        const severity = timingResult.score > 0.7 ? 'high' : 'medium';
        const flag = this.createFlag(
          'robotic_timing_consistency',
          severity,
          `Timing anomaly: ${timingResult.reason}`,
          gameId,
          playerId,
          moveNumber,
          timingResult.details
        );
        newFlags.push(flag);
        this.addFlagToSession(session, flag);
      }
    }

    // Check 3: Mouse linearity
    // Very straight mouse paths suggest automation
    if (behaviorData.mouseLinearity !== undefined && behaviorData.mouseLinearity > 0.95) {
      const flag = this.createFlag(
        'linear_mouse_path',
        'medium',
        `Mouse path linearity: ${(behaviorData.mouseLinearity * 100).toFixed(1)}%`,
        gameId,
        playerId,
        moveNumber
      );
      newFlags.push(flag);
      this.addFlagToSession(session, flag);
    }

    // Check 4: Mid-game skill shift
    // Add move to skill shift analyzer if we have engine data
    if (moveAnalysis) {
      session.skillShiftAnalyzer.addMove(moveAnalysis);
      session.moveAnalyses.push(moveAnalysis);

      const shiftResult = session.skillShiftAnalyzer.checkForMidGameShift();
      if (isSkillShiftSuspicious(shiftResult) && shiftResult.shiftAtMove !== null) {
        const flag = this.createFlag(
          'mid_game_skill_shift',
          'critical',
          `Skill shift at move ${shiftResult.shiftAtMove}: CPL dropped from ${shiftResult.cplBeforeShift.toFixed(1)} to ${shiftResult.cplAfterShift.toFixed(1)}`,
          gameId,
          playerId,
          shiftResult.shiftAtMove,
          {
            cplBeforeShift: shiftResult.cplBeforeShift,
            cplAfterShift: shiftResult.cplAfterShift,
            confidence: shiftResult.confidence,
          }
        );
        newFlags.push(flag);
        this.addFlagToSession(session, flag);
      }
    }

    // Determine if we crossed any thresholds
    const thresholdCrossed = this.checkThresholdCrossing(previousScore, session.suspicionScore);
    const recommendedAction = this.getRecommendedAction(session.suspicionScore);

    return {
      newScore: session.suspicionScore,
      newFlags,
      thresholdCrossed,
      recommendedAction,
    };
  }

  /**
   * End monitoring for a game and get the final summary.
   *
   * @param gameId - The game ID
   * @returns Summary of monitoring results for both players
   */
  endMonitoring(gameId: string): Map<string, PlayerGameMonitorState> {
    const results = new Map<string, PlayerGameMonitorState>();

    // Find all sessions for this game
    for (const [key, session] of this.sessions) {
      if (session.gameId === gameId) {
        results.set(session.playerId, session);
        this.sessions.delete(key);
      }
    }

    console.log(`[AntiCheat] Ended monitoring for game ${gameId}, found ${results.size} player sessions`);
    return results;
  }

  /**
   * Get current monitoring state for a player in a game.
   * Useful for checking status without modifying state.
   */
  getPlayerState(gameId: string, playerId: string): PlayerGameMonitorState | undefined {
    return this.sessions.get(this.getSessionKey(gameId, playerId));
  }

  /**
   * Mark a player as flagged for review (prevents duplicate flags).
   */
  markFlaggedForReview(gameId: string, playerId: string): void {
    const session = this.sessions.get(this.getSessionKey(gameId, playerId));
    if (session) {
      session.flaggedForReview = true;
    }
  }

  /**
   * Mark a game as queued for deep analysis (prevents duplicate queuing).
   */
  markQueuedForDeepAnalysis(gameId: string, playerId: string): void {
    const session = this.sessions.get(this.getSessionKey(gameId, playerId));
    if (session) {
      session.queuedForDeepAnalysis = true;
    }
  }

  /**
   * Get count of active monitoring sessions.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get count of active games being monitored.
   */
  getActiveGameCount(): number {
    const gameIds = new Set<string>();
    for (const session of this.sessions.values()) {
      gameIds.add(session.gameId);
    }
    return gameIds.size;
  }

  // ---------------------------------------------------------------------------
  // Private Helper Methods
  // ---------------------------------------------------------------------------

  private getSessionKey(gameId: string, playerId: string): string {
    return `${gameId}:${playerId}`;
  }

  private createFlag(
    type: CheatFlagType,
    severity: CheatFlagSeverity,
    details: string,
    gameId: string,
    playerId: string,
    moveNumber?: number,
    metadata?: Record<string, unknown>
  ): CheatFlag {
    return {
      type,
      severity,
      score: FLAG_SCORE_WEIGHTS[severity],
      details,
      gameId,
      playerId,
      timestamp: Date.now(),
      moveNumber,
      metadata,
    };
  }

  private addFlagToSession(session: PlayerGameMonitorState, flag: CheatFlag): void {
    session.flags.push(flag);

    // Track count by type for capping
    const currentCount = session.flagTypeCounts[flag.type] ?? 0;
    session.flagTypeCounts[flag.type] = currentCount + 1;

    // Add to score, but cap contribution from any single flag type
    const typeCount = session.flagTypeCounts[flag.type]!;
    const totalContributionFromType = typeCount * flag.score;

    if (totalContributionFromType <= MAX_SINGLE_FLAG_TYPE_CONTRIBUTION) {
      session.suspicionScore = Math.min(100, session.suspicionScore + flag.score);
    }
    // If capped, don't add more score from this flag type
  }

  private calculateTimingVariance(moveTimes: number[]): number | undefined {
    if (moveTimes.length < 5) return undefined;

    const mean = moveTimes.reduce((a, b) => a + b, 0) / moveTimes.length;
    const variance = moveTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / moveTimes.length;
    const stdDev = Math.sqrt(variance);

    // Return coefficient of variation (normalized variance)
    return stdDev / mean;
  }

  private checkThresholdCrossing(
    previousScore: number,
    currentScore: number
  ): 'none' | 'monitor' | 'restrict' | 'review' | 'suspend' {
    const thresholds: Array<{ name: 'monitor' | 'restrict' | 'review' | 'suspend'; value: number }> = [
      { name: 'suspend', value: SUSPICION_THRESHOLDS.SUSPEND },
      { name: 'review', value: SUSPICION_THRESHOLDS.REVIEW },
      { name: 'restrict', value: SUSPICION_THRESHOLDS.RESTRICT },
      { name: 'monitor', value: SUSPICION_THRESHOLDS.MONITOR },
    ];

    for (const { name, value } of thresholds) {
      if (previousScore < value && currentScore >= value) {
        return name;
      }
    }

    return 'none';
  }

  private getRecommendedAction(
    score: number
  ): 'none' | 'monitor' | 'restrict_stakes' | 'flag_for_review' | 'suspend_pending_review' {
    if (score >= SUSPICION_THRESHOLDS.SUSPEND) return 'suspend_pending_review';
    if (score >= SUSPICION_THRESHOLDS.REVIEW) return 'flag_for_review';
    if (score >= SUSPICION_THRESHOLDS.RESTRICT) return 'restrict_stakes';
    if (score >= SUSPICION_THRESHOLDS.MONITOR) return 'monitor';
    return 'none';
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

/**
 * Global singleton instance of the LiveGameMonitor.
 *
 * Using a singleton because:
 * 1. Monitoring state needs to persist across move handlers
 * 2. We want consistent state across the server
 * 3. Memory is bounded by active game count, not total games
 */
export const liveGameMonitor = new LiveGameMonitor();

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Start monitoring a new game.
 *
 * Call this when a game starts (from the game:started event handler).
 */
export function startGameMonitoring(
  gameId: string,
  whitePlayerId: string,
  blackPlayerId: string,
  timeControl: TimeControlType
): void {
  liveGameMonitor.startMonitoring(gameId, whitePlayerId, blackPlayerId, timeControl);
}

/**
 * Process a move through the anti-cheat monitoring system.
 *
 * Call this for each move (from the game:move_made event handler).
 */
export function monitorMove(
  gameId: string,
  playerId: string,
  moveNumber: number,
  behaviorData: MoveBehaviorData,
  moveAnalysis?: MoveAnalysisData
): MoveAnalysisResult {
  return liveGameMonitor.monitorMove(gameId, playerId, moveNumber, behaviorData, moveAnalysis);
}

/**
 * End monitoring for a game.
 *
 * Call this when a game ends (from the game:ended event handler).
 */
export function endGameMonitoring(gameId: string): Map<string, PlayerGameMonitorState> {
  return liveGameMonitor.endMonitoring(gameId);
}

/**
 * Get the current suspicion score for a player in a game.
 */
export function getPlayerSuspicionScore(gameId: string, playerId: string): number {
  const state = liveGameMonitor.getPlayerState(gameId, playerId);
  return state?.suspicionScore ?? 0;
}

/**
 * Get all flags for a player in a game.
 */
export function getPlayerFlags(gameId: string, playerId: string): CheatFlag[] {
  const state = liveGameMonitor.getPlayerState(gameId, playerId);
  return state?.flags ?? [];
}
