/**
 * Arbiter Overwatch Scoring Service
 * ==================================
 *
 * Handles updating arbiter scores based on their verdict accuracy.
 *
 * SCORING ALGORITHM:
 * When a case is resolved, each arbiter's score is updated based on whether
 * their individual verdict agreed with the final majority verdict.
 *
 * Key factors:
 * 1. DIRECTION: Did they agree or disagree with the majority?
 *    - Agreement: Positive score change
 *    - Disagreement: Negative score change (larger magnitude)
 *
 * 2. CONSENSUS STRENGTH: How unanimous was the final verdict?
 *    - Strong consensus (90% agreement): Larger score changes
 *    - Weak consensus (60% agreement): Smaller score changes
 *
 * FORMULAS:
 * consensusStrength = |guiltyRatio - 0.5| * 2  (ranges 0-1)
 *
 * If agreed with majority:
 *   scoreDelta = +0.02 * consensusStrength
 *
 * If disagreed with majority:
 *   scoreDelta = -0.05 * consensusStrength
 *
 * WHY ASYMMETRIC:
 * - Losing more for disagreement prevents gaming (voting randomly)
 * - Creates real incentive to be careful and accurate
 * - Quickly filters out bad-faith arbiters
 *
 * SCORE BOUNDS:
 * - Minimum: 0.000 (suspended, cannot serve)
 * - Maximum: 1.000 (maximum influence)
 * - Start: 0.500 (neutral)
 * - Suspension threshold: 0.250 (below this = suspended)
 */

import { eq, sql } from 'drizzle-orm';
import {
  db,
  overwatchVerdicts,
  overwatchArbiters,
  overwatchCases,
} from '../../drizzle';
import type { AggregationResult } from './verdict-aggregation';
import { OVERWATCH_SUSPENSION_THRESHOLD, suspendArbiter } from './eligibility';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Score bonus for agreeing with majority (per consensus strength) */
export const AGREEMENT_BONUS = 0.02;

/** Score penalty for disagreeing with majority (per consensus strength) */
export const DISAGREEMENT_PENALTY = 0.05;

/** Extra bonus for correctly identifying test cases */
export const TEST_CASE_BONUS_MULTIPLIER = 1.5;

/** Extra penalty for failing test cases */
export const TEST_CASE_PENALTY_MULTIPLIER = 2.0;

/** Minimum possible score */
export const MIN_SCORE = 0.000;

/** Maximum possible score */
export const MAX_SCORE = 1.000;

// ---------------------------------------------------------------------------
// Score Update Functions
// ---------------------------------------------------------------------------

/**
 * Update all arbiter scores after a case is resolved.
 *
 * For each arbiter who submitted a verdict:
 * 1. Determine if they agreed with the majority
 * 2. Calculate the score delta based on consensus strength
 * 3. Update their score and accuracy stats
 * 4. Suspend if they fall below the threshold
 *
 * @param caseId - The resolved case
 * @param aggregation - The aggregation result with final verdict
 */
export async function updateArbiterScores(
  caseId: string,
  aggregation: AggregationResult
): Promise<void> {
  // Get the case to check if it's a test case
  const overwatchCase = await db.query.overwatchCases.findFirst({
    where: eq(overwatchCases.id, caseId),
  });

  if (!overwatchCase || !aggregation.finalVerdict) {
    return;
  }

  // Get all verdicts for this case
  const verdicts = await db.query.overwatchVerdicts.findMany({
    where: eq(overwatchVerdicts.caseId, caseId),
  });

  // Calculate consensus strength
  // If guilty ratio is 0.9, consensus is (0.9 - 0.5) * 2 = 0.8 (80% strength)
  // If guilty ratio is 0.6, consensus is (0.6 - 0.5) * 2 = 0.2 (20% strength)
  const consensusStrength = Math.abs(aggregation.overallGuiltyPercentage - 0.5) * 2;

  // Determine the majority verdict for each category
  // A verdict "agrees" if any of their guilty votes matches the final outcome
  const finalIsGuilty = aggregation.finalVerdict === 'guilty';

  for (const verdict of verdicts) {
    // Did this arbiter's overall assessment agree with the final verdict?
    // They agreed if their "guilty" categories match the final verdict
    const arbiterVotedGuilty =
      verdict.engineAssistance === 'guilty' ||
      verdict.inputAutomation === 'guilty' ||
      verdict.externalAssistance === 'guilty';

    const agreedWithMajority = arbiterVotedGuilty === finalIsGuilty;

    // Calculate base score delta
    let scoreDelta: number;
    if (agreedWithMajority) {
      scoreDelta = AGREEMENT_BONUS * consensusStrength;
    } else {
      scoreDelta = -DISAGREEMENT_PENALTY * consensusStrength;
    }

    // Apply test case multiplier if applicable
    if (overwatchCase.isTestCase && overwatchCase.knownOutcome) {
      const knownIsGuilty = overwatchCase.knownOutcome === 'guilty';
      const correctOnTestCase = arbiterVotedGuilty === knownIsGuilty;

      if (correctOnTestCase) {
        // Bonus for correctly identifying test case
        scoreDelta = Math.abs(scoreDelta) * TEST_CASE_BONUS_MULTIPLIER;
      } else {
        // Penalty for failing test case
        scoreDelta = -Math.abs(scoreDelta) * TEST_CASE_PENALTY_MULTIPLIER;
      }
    }

    // Get current arbiter score
    const arbiter = await db.query.overwatchArbiters.findFirst({
      where: eq(overwatchArbiters.userId, verdict.investigatorId),
    });

    if (!arbiter) continue;

    const currentScore = parseFloat(arbiter.investigatorScore);
    let newScore = currentScore + scoreDelta;

    // Clamp to bounds
    newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, newScore));

    // Update the verdict record with accuracy info
    await db
      .update(overwatchVerdicts)
      .set({
        agreedWithMajority,
        scoreDelta: scoreDelta.toFixed(3),
      })
      .where(eq(overwatchVerdicts.id, verdict.id));

    // Update the arbiter's score and accuracy stats
    const accurateVerdictsDelta = agreedWithMajority ? 1 : 0;

    await db
      .update(overwatchArbiters)
      .set({
        investigatorScore: newScore.toFixed(3),
        accurateVerdicts: sql`${overwatchArbiters.accurateVerdicts} + ${accurateVerdictsDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(overwatchArbiters.userId, verdict.investigatorId));

    console.log(
      `[Overwatch] Arbiter ${verdict.investigatorId} score updated: ` +
      `${currentScore.toFixed(3)} -> ${newScore.toFixed(3)} ` +
      `(${agreedWithMajority ? 'agreed' : 'disagreed'}, delta: ${scoreDelta.toFixed(3)})`
    );

    // Check if arbiter should be suspended
    if (newScore < OVERWATCH_SUSPENSION_THRESHOLD) {
      await suspendArbiter(
        verdict.investigatorId,
        `Score dropped below suspension threshold (${newScore.toFixed(3)} < ${OVERWATCH_SUSPENSION_THRESHOLD})`,
        30 // 30 day suspension
      );
    }
  }
}

/**
 * Get detailed scoring statistics for an arbiter.
 *
 * @param userId - The arbiter's user ID
 * @returns Scoring statistics
 */
export async function getArbiterStats(userId: string): Promise<{
  score: number;
  casesReviewed: number;
  accurateVerdicts: number;
  accuracyRate: number;
  rank: string;
  canServe: boolean;
} | null> {
  const arbiter = await db.query.overwatchArbiters.findFirst({
    where: eq(overwatchArbiters.userId, userId),
  });

  if (!arbiter) {
    return null;
  }

  const score = parseFloat(arbiter.investigatorScore);
  const casesReviewed = arbiter.casesReviewed;
  const accurateVerdicts = arbiter.accurateVerdicts;
  const accuracyRate = casesReviewed > 0 ? (accurateVerdicts / casesReviewed) * 100 : 0;

  // Determine rank based on score
  let rank: string;
  if (score >= 0.9) {
    rank = 'Elite Arbiter';
  } else if (score >= 0.75) {
    rank = 'Senior Arbiter';
  } else if (score >= 0.6) {
    rank = 'Arbiter';
  } else if (score >= 0.4) {
    rank = 'Junior Arbiter';
  } else if (score >= OVERWATCH_SUSPENSION_THRESHOLD) {
    rank = 'Probationary Arbiter';
  } else {
    rank = 'Suspended';
  }

  // Check if they can currently serve
  const now = new Date();
  const canServe =
    arbiter.isActive &&
    score >= OVERWATCH_SUSPENSION_THRESHOLD &&
    (!arbiter.suspendedUntil || arbiter.suspendedUntil <= now);

  return {
    score,
    casesReviewed,
    accurateVerdicts,
    accuracyRate,
    rank,
    canServe,
  };
}

/**
 * Get the arbiter leaderboard (top arbiters by score).
 *
 * @param limit - Max number of arbiters to return
 * @returns Sorted list of top arbiters
 */
export async function getArbiterLeaderboard(limit: number = 20): Promise<Array<{
  userId: string;
  score: number;
  casesReviewed: number;
  accuracyRate: number;
  rank: string;
}>> {
  const arbiters = await db.query.overwatchArbiters.findMany({
    where: eq(overwatchArbiters.isActive, true),
  });

  // Sort by score descending
  const sorted = arbiters
    .map(j => ({
      userId: j.userId,
      score: parseFloat(j.investigatorScore),
      casesReviewed: j.casesReviewed,
      accuracyRate: j.casesReviewed > 0 ? (j.accurateVerdicts / j.casesReviewed) * 100 : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Add ranks
  return sorted.map(j => {
    let rank: string;
    if (j.score >= 0.9) {
      rank = 'Elite Arbiter';
    } else if (j.score >= 0.75) {
      rank = 'Senior Arbiter';
    } else if (j.score >= 0.6) {
      rank = 'Arbiter';
    } else if (j.score >= 0.4) {
      rank = 'Junior Arbiter';
    } else {
      rank = 'Probationary Arbiter';
    }
    return { ...j, rank };
  });
}

/**
 * Manually adjust an arbiter's score (admin action).
 *
 * @param userId - The arbiter's user ID
 * @param newScore - The new score to set
 * @param reason - Why the score is being adjusted
 */
export async function adjustArbiterScore(
  userId: string,
  newScore: number,
  reason: string
): Promise<void> {
  const clampedScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, newScore));

  await db
    .update(overwatchArbiters)
    .set({
      investigatorScore: clampedScore.toFixed(3),
      updatedAt: new Date(),
    })
    .where(eq(overwatchArbiters.userId, userId));

  console.log(`[Overwatch] Admin adjusted ${userId} score to ${clampedScore.toFixed(3)}: ${reason}`);

  // Suspend if below threshold
  if (clampedScore < OVERWATCH_SUSPENSION_THRESHOLD) {
    await suspendArbiter(userId, reason, 30);
  }
}
