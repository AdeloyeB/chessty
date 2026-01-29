/**
 * Arbiter Overwatch Verdict Aggregation Service
 * ==============================================
 *
 * Handles the calculation of final verdicts from individual arbiter votes.
 *
 * WEIGHTED VOTING SYSTEM:
 * Not all votes are equal. Arbiters with higher accuracy scores have more
 * influence on the final verdict. This means:
 * - New arbiters (score 0.500) have moderate influence
 * - Experienced accurate arbiters (score 0.800+) have high influence
 * - Inaccurate arbiters (score <0.400) have low influence
 *
 * VERDICT THRESHOLD:
 * A conviction (guilty verdict) requires 75% weighted agreement.
 * This high threshold protects against false positives.
 *
 * CHEAT CATEGORIES:
 * Arbiters vote on three categories independently:
 * 1. Engine Assistance - Using chess engines
 * 2. Input Automation - Using bots/scripts
 * 3. External Assistance - Help from other people
 *
 * The final verdict is 'guilty' if ANY category reaches the threshold.
 */

import { eq, and, sql } from 'drizzle-orm';
import {
  db,
  overwatchCases,
  overwatchVerdicts,
  overwatchCaseAssignments,
  overwatchArbiters,
  playerSanctions,
  type OverwatchVerdict,
  type VerdictOption,
} from '../../drizzle';
import { updateArbiterScores } from './scoring';
import { sanitizeText } from '../../utils/sanitize';
import { withTransaction } from '../../utils/transaction';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum percentage of weighted votes needed for a guilty verdict */
export const GUILTY_THRESHOLD = 0.75;

/** Minimum number of verdicts required to resolve a case */
export const MIN_VERDICTS_FOR_RESOLUTION = 4;

/** Percentage of cases that should be test cases (for calibration) */
export const TEST_CASE_PERCENTAGE = 0.20; // 20% or 1 in 5

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerdictInput {
  caseId: string;
  investigatorId: string;
  engineAssistance: VerdictOption;
  inputAutomation: VerdictOption;
  externalAssistance: VerdictOption;
  notes?: string;
  confidence?: number;
}

export interface AggregationResult {
  /** Whether the case should be resolved (enough verdicts received) */
  shouldResolve: boolean;

  /** The final verdict if resolved */
  finalVerdict?: 'innocent' | 'guilty' | 'inconclusive';

  /** Weighted percentage that voted guilty for each category */
  categoryScores: {
    engineAssistance: number;
    inputAutomation: number;
    externalAssistance: number;
  };

  /** Overall weighted guilty percentage */
  overallGuiltyPercentage: number;

  /** Count of verdicts received */
  verdictCount: number;

  /** Count of expected verdicts (assignments) */
  expectedVerdicts: number;
}

// ---------------------------------------------------------------------------
// Verdict Submission
// ---------------------------------------------------------------------------

/**
 * Submit an arbiter's verdict for a case.
 *
 * This creates the verdict record and checks if the case should be resolved.
 *
 * @param input - The verdict details
 * @returns The created verdict or error
 */
export async function submitVerdict(input: VerdictInput): Promise<{
  success: boolean;
  verdict?: OverwatchVerdict;
  error?: string;
  caseResolved?: boolean;
}> {
  // Sanitize user input (notes field can contain user-provided text)
  const sanitizedNotes = input.notes ? sanitizeText(input.notes, 2000) : undefined;

  // Wrap the multi-step operation in a transaction for consistency
  // This ensures all database operations succeed or fail together
  return await withTransaction(async (tx) => {
    // Verify the arbiter is assigned to this case
    const assignment = await tx.query.overwatchCaseAssignments.findFirst({
      where: and(
        eq(overwatchCaseAssignments.caseId, input.caseId),
        eq(overwatchCaseAssignments.investigatorId, input.investigatorId)
      ),
    });

    if (!assignment) {
      return { success: false, error: 'Not assigned to this case' };
    }

    if (assignment.status === 'completed') {
      return { success: false, error: 'Already submitted verdict for this case' };
    }

    if (assignment.status === 'expired' || assignment.status === 'recused') {
      return { success: false, error: `Cannot submit verdict: assignment is ${assignment.status}` };
    }

    // Get the case
    const overwatchCase = await tx.query.overwatchCases.findFirst({
      where: eq(overwatchCases.id, input.caseId),
    });

    if (!overwatchCase) {
      return { success: false, error: 'Case not found' };
    }

    if (overwatchCase.status === 'resolved' || overwatchCase.status === 'expired') {
      return { success: false, error: `Case is already ${overwatchCase.status}` };
    }

    // Create the verdict with sanitized notes
    const [newVerdict] = await tx
      .insert(overwatchVerdicts)
      .values({
        caseId: input.caseId,
        investigatorId: input.investigatorId,
        engineAssistance: input.engineAssistance,
        inputAutomation: input.inputAutomation,
        externalAssistance: input.externalAssistance,
        notes: sanitizedNotes,
        confidence: input.confidence || 3,
      })
      .returning();

    // Update the assignment status
    await tx
      .update(overwatchCaseAssignments)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(overwatchCaseAssignments.id, assignment.id));

    // Update arbiter stats
    await tx
      .update(overwatchArbiters)
      .set({
        casesReviewed: sql`${overwatchArbiters.casesReviewed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(overwatchArbiters.userId, input.investigatorId));

    console.log(
      `[Overwatch] Verdict submitted for case ${input.caseId} by ${input.investigatorId}: ` +
      `engine=${input.engineAssistance}, automation=${input.inputAutomation}, external=${input.externalAssistance}`
    );

    // Check if we should resolve the case
    // NOTE: aggregateVerdicts uses db directly, but this is acceptable because
    // it only reads data, and the transaction has already committed the verdict
    const aggregation = await aggregateVerdicts(input.caseId);

    let caseResolved = false;
    if (aggregation.shouldResolve) {
      await resolveCase(input.caseId, aggregation);
      caseResolved = true;
    }

    return {
      success: true,
      verdict: newVerdict,
      caseResolved,
    };
  });
}

// ---------------------------------------------------------------------------
// Verdict Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate all verdicts for a case using weighted voting.
 *
 * The weight of each vote is the arbiter's investigator score.
 * Higher accuracy arbiters have more influence on the final verdict.
 *
 * @param caseId - The case to aggregate verdicts for
 * @returns Aggregation result with weighted scores
 */
export async function aggregateVerdicts(caseId: string): Promise<AggregationResult> {
  // Get all verdicts for this case
  const verdicts = await db.query.overwatchVerdicts.findMany({
    where: eq(overwatchVerdicts.caseId, caseId),
  });

  // Get all assignments (to know expected count)
  const assignments = await db.query.overwatchCaseAssignments.findMany({
    where: eq(overwatchCaseAssignments.caseId, caseId),
  });

  const activeAssignments = assignments.filter(
    a => a.status !== 'recused' && a.status !== 'expired'
  );

  if (verdicts.length === 0) {
    return {
      shouldResolve: false,
      categoryScores: {
        engineAssistance: 0,
        inputAutomation: 0,
        externalAssistance: 0,
      },
      overallGuiltyPercentage: 0,
      verdictCount: 0,
      expectedVerdicts: activeAssignments.length,
    };
  }

  // Get arbiter scores for each verdict
  const weightedVerdicts: Array<{
    verdict: OverwatchVerdict;
    weight: number;
  }> = [];

  for (const verdict of verdicts) {
    // Find the assignment to get the score at time of assignment
    const assignment = assignments.find(a => a.investigatorId === verdict.investigatorId);
    const weight = assignment ? parseFloat(assignment.scoreAtAssignment) : 0.5;
    weightedVerdicts.push({ verdict, weight });
  }

  // Calculate weighted scores for each category
  const categoryScores = calculateCategoryScores(weightedVerdicts);

  // Overall guilty percentage is the max of any category
  // (if they cheated in ANY way, the overall verdict should be guilty)
  const overallGuiltyPercentage = Math.max(
    categoryScores.engineAssistance,
    categoryScores.inputAutomation,
    categoryScores.externalAssistance
  );

  // Determine if we should resolve
  // Resolve if we have enough verdicts or all expected verdicts are in
  const shouldResolve =
    verdicts.length >= MIN_VERDICTS_FOR_RESOLUTION ||
    verdicts.length >= activeAssignments.length;

  // Determine final verdict if resolving
  let finalVerdict: 'innocent' | 'guilty' | 'inconclusive' | undefined;
  if (shouldResolve) {
    if (overallGuiltyPercentage >= GUILTY_THRESHOLD) {
      finalVerdict = 'guilty';
    } else if (overallGuiltyPercentage <= (1 - GUILTY_THRESHOLD)) {
      finalVerdict = 'innocent';
    } else {
      // Between thresholds - inconclusive, needs escalation
      finalVerdict = 'inconclusive';
    }
  }

  return {
    shouldResolve,
    finalVerdict,
    categoryScores,
    overallGuiltyPercentage,
    verdictCount: verdicts.length,
    expectedVerdicts: activeAssignments.length,
  };
}

/**
 * Calculate weighted guilty percentage for each cheat category.
 *
 * Formula:
 * weightedGuilty = sum of (weight) for each guilty vote
 * totalWeight = sum of (weight) for all votes
 * guiltyPercentage = weightedGuilty / totalWeight
 *
 * @param weightedVerdicts - Verdicts with their weights
 * @returns Weighted guilty percentage for each category
 */
function calculateCategoryScores(
  weightedVerdicts: Array<{ verdict: OverwatchVerdict; weight: number }>
): AggregationResult['categoryScores'] {
  const totalWeight = weightedVerdicts.reduce((sum, { weight }) => sum + weight, 0);

  if (totalWeight === 0) {
    return {
      engineAssistance: 0,
      inputAutomation: 0,
      externalAssistance: 0,
    };
  }

  const engineGuiltyWeight = weightedVerdicts
    .filter(({ verdict }) => verdict.engineAssistance === 'guilty')
    .reduce((sum, { weight }) => sum + weight, 0);

  const automationGuiltyWeight = weightedVerdicts
    .filter(({ verdict }) => verdict.inputAutomation === 'guilty')
    .reduce((sum, { weight }) => sum + weight, 0);

  const externalGuiltyWeight = weightedVerdicts
    .filter(({ verdict }) => verdict.externalAssistance === 'guilty')
    .reduce((sum, { weight }) => sum + weight, 0);

  return {
    engineAssistance: engineGuiltyWeight / totalWeight,
    inputAutomation: automationGuiltyWeight / totalWeight,
    externalAssistance: externalGuiltyWeight / totalWeight,
  };
}

// ---------------------------------------------------------------------------
// Case Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a case with the final verdict.
 *
 * This updates the case status, applies sanctions if guilty, and updates
 * all arbiter scores based on whether they agreed with the majority.
 *
 * @param caseId - The case to resolve
 * @param aggregation - The aggregation result
 */
export async function resolveCase(
  caseId: string,
  aggregation: AggregationResult
): Promise<void> {
  if (!aggregation.finalVerdict) {
    throw new Error('Cannot resolve case without final verdict');
  }

  const overwatchCase = await db.query.overwatchCases.findFirst({
    where: eq(overwatchCases.id, caseId),
  });

  if (!overwatchCase) {
    throw new Error('Case not found');
  }

  // Determine if this is consistent with known outcome (for test cases)
  const isTestCase = overwatchCase.isTestCase;
  const knownOutcome = overwatchCase.knownOutcome;

  // Build verdict notes
  const notes = buildVerdictNotes(aggregation, isTestCase, knownOutcome);

  // Update the case
  await db
    .update(overwatchCases)
    .set({
      status: 'resolved',
      finalVerdict: aggregation.finalVerdict,
      guiltyPercentage: aggregation.overallGuiltyPercentage.toFixed(4),
      verdictNotes: notes,
      resolvedAt: new Date(),
    })
    .where(eq(overwatchCases.id, caseId));

  console.log(
    `[Overwatch] Case ${caseId} resolved: ${aggregation.finalVerdict} ` +
    `(guilty%: ${(aggregation.overallGuiltyPercentage * 100).toFixed(1)}%)`
  );

  // Update arbiter scores based on whether they agreed with the majority
  await updateArbiterScores(caseId, aggregation);

  // Apply sanctions if guilty (and not a test case)
  if (aggregation.finalVerdict === 'guilty' && !isTestCase) {
    await applySanctionForGuiltyVerdict(overwatchCase.suspectPlayerId, caseId);
  }
}

/**
 * Build human-readable notes explaining the verdict.
 */
function buildVerdictNotes(
  aggregation: AggregationResult,
  isTestCase: boolean,
  knownOutcome: string | null
): string {
  const parts: string[] = [];

  parts.push(`Verdict based on ${aggregation.verdictCount} arbiter votes.`);

  parts.push(
    `Category scores: ` +
    `Engine ${(aggregation.categoryScores.engineAssistance * 100).toFixed(1)}%, ` +
    `Automation ${(aggregation.categoryScores.inputAutomation * 100).toFixed(1)}%, ` +
    `External ${(aggregation.categoryScores.externalAssistance * 100).toFixed(1)}%`
  );

  parts.push(`Overall weighted guilty: ${(aggregation.overallGuiltyPercentage * 100).toFixed(1)}%`);
  parts.push(`Threshold for conviction: ${(GUILTY_THRESHOLD * 100).toFixed(0)}%`);

  if (isTestCase) {
    parts.push(`[CALIBRATION CASE] Known outcome: ${knownOutcome}`);
    const correct = aggregation.finalVerdict === knownOutcome;
    parts.push(`Arbiters ${correct ? 'correctly' : 'incorrectly'} identified this case.`);
  }

  return parts.join('\n');
}

/**
 * Apply sanctions when a player is found guilty by the arbiters.
 *
 * @param playerId - The guilty player
 * @param caseId - The case that resulted in this sanction
 */
async function applySanctionForGuiltyVerdict(
  playerId: string,
  caseId: string
): Promise<void> {
  // Check if player has previous sanctions
  const previousSanctions = await db.query.playerSanctions.findMany({
    where: eq(playerSanctions.playerId, playerId),
  });

  // First offense: 7-day temp ban
  // Second offense: 30-day temp ban
  // Third+ offense: Permanent ban
  const sanctionCount = previousSanctions.length;
  let sanctionType: string;
  let endsAt: Date | null;

  if (sanctionCount === 0) {
    sanctionType = 'temp_ban';
    endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + 7);
  } else if (sanctionCount === 1) {
    sanctionType = 'temp_ban';
    endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + 30);
  } else {
    sanctionType = 'perm_ban';
    endsAt = null;
  }

  await db.insert(playerSanctions).values({
    playerId,
    sanctionType,
    reason: `Found guilty of cheating by Arbiter Overwatch (Case: ${caseId})`,
    endsAt,
    reviewTaskId: null,
    appealed: false,
  });

  console.log(
    `[Overwatch] Sanction applied to ${playerId}: ${sanctionType} ` +
    `(${endsAt ? `until ${endsAt.toISOString()}` : 'permanent'})`
  );
}

/**
 * Check all active cases and resolve those with enough verdicts.
 *
 * This should be called periodically to handle cases where the deadline
 * approaches or all verdicts are in.
 */
export async function checkAndResolveCases(): Promise<number> {
  const activeCases = await db.query.overwatchCases.findMany({
    where: eq(overwatchCases.status, 'active'),
  });

  let resolvedCount = 0;

  for (const overwatchCase of activeCases) {
    const aggregation = await aggregateVerdicts(overwatchCase.id);

    // Resolve if we have enough verdicts OR deadline has passed
    const deadlinePassed = overwatchCase.deadline < new Date();

    if (aggregation.shouldResolve || (deadlinePassed && aggregation.verdictCount > 0)) {
      // For deadline-passed cases with insufficient verdicts, force a resolution
      if (!aggregation.finalVerdict) {
        if (aggregation.overallGuiltyPercentage >= 0.5) {
          aggregation.finalVerdict = 'inconclusive';
        } else {
          aggregation.finalVerdict = 'innocent';
        }
      }

      await resolveCase(overwatchCase.id, aggregation);
      resolvedCount++;
    }
  }

  if (resolvedCount > 0) {
    console.log(`[Overwatch] Resolved ${resolvedCount} cases`);
  }

  return resolvedCount;
}
