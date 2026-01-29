/**
 * Jury Scoring Service
 * =====================
 *
 * Handles updating juror scores based on their verdict accuracy.
 *
 * SCORING ALGORITHM:
 * When a case is resolved, each juror's score is updated based on whether
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
 * - Quickly filters out bad-faith jurors
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
  juryVerdicts,
  juryInvestigators,
  juryCases,
} from '../../drizzle';
import type { AggregationResult } from './verdict-aggregation';
import { JURY_SUSPENSION_THRESHOLD, suspendJuror } from './eligibility';

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
 * Update all juror scores after a case is resolved.
 *
 * For each juror who submitted a verdict:
 * 1. Determine if they agreed with the majority
 * 2. Calculate the score delta based on consensus strength
 * 3. Update their score and accuracy stats
 * 4. Suspend if they fall below the threshold
 *
 * @param caseId - The resolved case
 * @param aggregation - The aggregation result with final verdict
 */
export async function updateJurorScores(
  caseId: string,
  aggregation: AggregationResult
): Promise<void> {
  // Get the case to check if it's a test case
  const juryCase = await db.query.juryCases.findFirst({
    where: eq(juryCases.id, caseId),
  });

  if (!juryCase || !aggregation.finalVerdict) {
    return;
  }

  // Get all verdicts for this case
  const verdicts = await db.query.juryVerdicts.findMany({
    where: eq(juryVerdicts.caseId, caseId),
  });

  // Calculate consensus strength
  // If guilty ratio is 0.9, consensus is (0.9 - 0.5) * 2 = 0.8 (80% strength)
  // If guilty ratio is 0.6, consensus is (0.6 - 0.5) * 2 = 0.2 (20% strength)
  const consensusStrength = Math.abs(aggregation.overallGuiltyPercentage - 0.5) * 2;

  // Determine the majority verdict for each category
  // A verdict "agrees" if any of their guilty votes matches the final outcome
  const finalIsGuilty = aggregation.finalVerdict === 'guilty';

  for (const verdict of verdicts) {
    // Did this juror's overall assessment agree with the final verdict?
    // They agreed if their "guilty" categories match the final verdict
    const jurorVotedGuilty =
      verdict.engineAssistance === 'guilty' ||
      verdict.inputAutomation === 'guilty' ||
      verdict.externalAssistance === 'guilty';

    const agreedWithMajority = jurorVotedGuilty === finalIsGuilty;

    // Calculate base score delta
    let scoreDelta: number;
    if (agreedWithMajority) {
      scoreDelta = AGREEMENT_BONUS * consensusStrength;
    } else {
      scoreDelta = -DISAGREEMENT_PENALTY * consensusStrength;
    }

    // Apply test case multiplier if applicable
    if (juryCase.isTestCase && juryCase.knownOutcome) {
      const knownIsGuilty = juryCase.knownOutcome === 'guilty';
      const correctOnTestCase = jurorVotedGuilty === knownIsGuilty;

      if (correctOnTestCase) {
        // Bonus for correctly identifying test case
        scoreDelta = Math.abs(scoreDelta) * TEST_CASE_BONUS_MULTIPLIER;
      } else {
        // Penalty for failing test case
        scoreDelta = -Math.abs(scoreDelta) * TEST_CASE_PENALTY_MULTIPLIER;
      }
    }

    // Get current juror score
    const juror = await db.query.juryInvestigators.findFirst({
      where: eq(juryInvestigators.userId, verdict.investigatorId),
    });

    if (!juror) continue;

    const currentScore = parseFloat(juror.investigatorScore);
    let newScore = currentScore + scoreDelta;

    // Clamp to bounds
    newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, newScore));

    // Update the verdict record with accuracy info
    await db
      .update(juryVerdicts)
      .set({
        agreedWithMajority,
        scoreDelta: scoreDelta.toFixed(3),
      })
      .where(eq(juryVerdicts.id, verdict.id));

    // Update the juror's score and accuracy stats
    const accurateVerdictsDelta = agreedWithMajority ? 1 : 0;

    await db
      .update(juryInvestigators)
      .set({
        investigatorScore: newScore.toFixed(3),
        accurateVerdicts: sql`${juryInvestigators.accurateVerdicts} + ${accurateVerdictsDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(juryInvestigators.userId, verdict.investigatorId));

    console.log(
      `[Jury] Juror ${verdict.investigatorId} score updated: ` +
      `${currentScore.toFixed(3)} -> ${newScore.toFixed(3)} ` +
      `(${agreedWithMajority ? 'agreed' : 'disagreed'}, delta: ${scoreDelta.toFixed(3)})`
    );

    // Check if juror should be suspended
    if (newScore < JURY_SUSPENSION_THRESHOLD) {
      await suspendJuror(
        verdict.investigatorId,
        `Score dropped below suspension threshold (${newScore.toFixed(3)} < ${JURY_SUSPENSION_THRESHOLD})`,
        30 // 30 day suspension
      );
    }
  }
}

/**
 * Get detailed scoring statistics for a juror.
 *
 * @param userId - The juror's user ID
 * @returns Scoring statistics
 */
export async function getJurorStats(userId: string): Promise<{
  score: number;
  casesReviewed: number;
  accurateVerdicts: number;
  accuracyRate: number;
  rank: string;
  canServe: boolean;
} | null> {
  const juror = await db.query.juryInvestigators.findFirst({
    where: eq(juryInvestigators.userId, userId),
  });

  if (!juror) {
    return null;
  }

  const score = parseFloat(juror.investigatorScore);
  const casesReviewed = juror.casesReviewed;
  const accurateVerdicts = juror.accurateVerdicts;
  const accuracyRate = casesReviewed > 0 ? (accurateVerdicts / casesReviewed) * 100 : 0;

  // Determine rank based on score
  let rank: string;
  if (score >= 0.9) {
    rank = 'Elite Investigator';
  } else if (score >= 0.75) {
    rank = 'Senior Investigator';
  } else if (score >= 0.6) {
    rank = 'Investigator';
  } else if (score >= 0.4) {
    rank = 'Junior Investigator';
  } else if (score >= JURY_SUSPENSION_THRESHOLD) {
    rank = 'Probationary Investigator';
  } else {
    rank = 'Suspended';
  }

  // Check if they can currently serve
  const now = new Date();
  const canServe =
    juror.isActive &&
    score >= JURY_SUSPENSION_THRESHOLD &&
    (!juror.suspendedUntil || juror.suspendedUntil <= now);

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
 * Get the juror leaderboard (top jurors by score).
 *
 * @param limit - Max number of jurors to return
 * @returns Sorted list of top jurors
 */
export async function getJurorLeaderboard(limit: number = 20): Promise<Array<{
  userId: string;
  score: number;
  casesReviewed: number;
  accuracyRate: number;
  rank: string;
}>> {
  const jurors = await db.query.juryInvestigators.findMany({
    where: eq(juryInvestigators.isActive, true),
  });

  // Sort by score descending
  const sorted = jurors
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
      rank = 'Elite Investigator';
    } else if (j.score >= 0.75) {
      rank = 'Senior Investigator';
    } else if (j.score >= 0.6) {
      rank = 'Investigator';
    } else if (j.score >= 0.4) {
      rank = 'Junior Investigator';
    } else {
      rank = 'Probationary Investigator';
    }
    return { ...j, rank };
  });
}

/**
 * Manually adjust a juror's score (admin action).
 *
 * @param userId - The juror's user ID
 * @param newScore - The new score to set
 * @param reason - Why the score is being adjusted
 */
export async function adjustJurorScore(
  userId: string,
  newScore: number,
  reason: string
): Promise<void> {
  const clampedScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, newScore));

  await db
    .update(juryInvestigators)
    .set({
      investigatorScore: clampedScore.toFixed(3),
      updatedAt: new Date(),
    })
    .where(eq(juryInvestigators.userId, userId));

  console.log(`[Jury] Admin adjusted ${userId} score to ${clampedScore.toFixed(3)}: ${reason}`);

  // Suspend if below threshold
  if (clampedScore < JURY_SUSPENSION_THRESHOLD) {
    await suspendJuror(userId, reason, 30);
  }
}
