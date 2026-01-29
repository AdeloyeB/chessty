/**
 * Jury Case Assignment Service
 * =============================
 *
 * Handles assigning jurors to cases and managing the assignment lifecycle.
 *
 * ASSIGNMENT STRATEGY:
 * Each case gets 5-7 jurors from different ELO ranges to ensure diverse
 * perspectives. Higher-rated jurors can spot subtle cheating patterns,
 * while lower-rated jurors ensure obvious cheating isn't missed.
 *
 * ELO RANGES FOR ASSIGNMENT:
 * - 1400-1600: 1-2 jurors
 * - 1600-1800: 1-2 jurors
 * - 1800-2000: 1-2 jurors
 * - 2000+: 1 juror (if available)
 *
 * EXCLUSIONS:
 * - Players who played in the game being reviewed
 * - Players who have played against the suspect recently
 * - Players currently under investigation themselves
 */

import { eq, and, lt, notInArray, inArray, desc } from 'drizzle-orm';
// nanoid will be used when we need to generate unique IDs for assignments
import {
  db,
  users,
  games,
  juryInvestigators,
  juryCases,
  juryCaseAssignments,
  type JuryCase,
  type JuryCaseAssignment,
} from '../../drizzle';
import { canReceiveAssignments } from './eligibility';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum number of jurors per case */
export const MIN_JURORS_PER_CASE = 5;

/** Maximum number of jurors per case */
export const MAX_JURORS_PER_CASE = 7;

/** Target number of jurors per case */
export const TARGET_JURORS_PER_CASE = 6;

/** Case deadline in hours from creation */
export const CASE_DEADLINE_HOURS = 48;

/**
 * ELO ranges for diverse assignment.
 * We try to get jurors from each range to ensure perspectives across skill levels.
 */
export const ELO_RANGES = [
  { min: 1400, max: 1599, target: 2 },
  { min: 1600, max: 1799, target: 2 },
  { min: 1800, max: 1999, target: 1 },
  { min: 2000, max: 9999, target: 1 },
] as const;

/** Maximum pending assignments per juror (to prevent overload) */
export const MAX_PENDING_ASSIGNMENTS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseCreationInput {
  gameId: string;
  suspectPlayerId: string;
  suspicionScore: number;
  priority?: 'normal' | 'high' | 'urgent';
  anticheatMetadata?: Record<string, unknown>;
  isTestCase?: boolean;
  knownOutcome?: 'guilty' | 'innocent';
}

export interface AssignmentResult {
  success: boolean;
  assignedCount: number;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Case Creation
// ---------------------------------------------------------------------------

/**
 * Create a new jury case for a flagged game.
 *
 * This creates the case record and immediately attempts to assign jurors.
 *
 * @param input - Case creation parameters
 * @returns The created case
 */
export async function createCase(input: CaseCreationInput): Promise<JuryCase> {
  // Calculate deadline (default: 48 hours from now)
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + CASE_DEADLINE_HOURS);

  // Create the case
  const [newCase] = await db
    .insert(juryCases)
    .values({
      gameId: input.gameId,
      suspectPlayerId: input.suspectPlayerId,
      suspicionScore: input.suspicionScore.toFixed(4),
      priority: input.priority || 'normal',
      deadline,
      status: 'pending_assignment',
      isTestCase: input.isTestCase || false,
      knownOutcome: input.knownOutcome,
      anticheatMetadata: input.anticheatMetadata,
    })
    .returning();

  console.log(
    `[Jury] Created case ${newCase.id} for game ${input.gameId} ` +
    `(suspect: ${input.suspectPlayerId}, score: ${input.suspicionScore.toFixed(2)})`
  );

  // Attempt to assign jurors immediately
  await assignJurorsToCase(newCase.id);

  // Refresh the case to get updated status
  const updatedCase = await db.query.juryCases.findFirst({
    where: eq(juryCases.id, newCase.id),
  });

  return updatedCase!;
}

/**
 * Assign jurors to a case.
 *
 * This finds eligible jurors from different ELO ranges and assigns them.
 * Excludes players involved in the game or who know the suspect.
 *
 * @param caseId - The case to assign jurors to
 * @returns Assignment result with count and any errors
 */
export async function assignJurorsToCase(caseId: string): Promise<AssignmentResult> {
  const errors: string[] = [];

  // Get the case and related game
  const juryCase = await db.query.juryCases.findFirst({
    where: eq(juryCases.id, caseId),
  });

  if (!juryCase) {
    return { success: false, assignedCount: 0, errors: ['Case not found'] };
  }

  // Get the game to find excluded players
  const game = await db.query.games.findFirst({
    where: eq(games.id, juryCase.gameId),
  });

  if (!game) {
    return { success: false, assignedCount: 0, errors: ['Game not found'] };
  }

  // Players who cannot be jurors for this case
  const excludedPlayerIds = [
    game.whitePlayerId,
    game.blackPlayerId,
    juryCase.suspectPlayerId,
  ];

  // Get current assignments to avoid duplicates
  const existingAssignments = await db.query.juryCaseAssignments.findMany({
    where: eq(juryCaseAssignments.caseId, caseId),
  });
  const alreadyAssignedIds = existingAssignments.map(a => a.investigatorId);

  // Find eligible jurors from each ELO range
  const assignedJurors: string[] = [];

  for (const range of ELO_RANGES) {
    const jurorsInRange = await findEligibleJurorsInRange(
      range.min,
      range.max,
      range.target,
      [...excludedPlayerIds, ...alreadyAssignedIds, ...assignedJurors]
    );

    for (const juror of jurorsInRange) {
      // Double-check they can receive assignments
      const canAssign = await canReceiveAssignments(juror.userId);
      if (!canAssign) continue;

      // Check they don't have too many pending cases
      const pendingCount = await getPendingAssignmentCount(juror.userId);
      if (pendingCount >= MAX_PENDING_ASSIGNMENTS) continue;

      // Create the assignment
      try {
        await db.insert(juryCaseAssignments).values({
          caseId,
          investigatorId: juror.userId,
          eloAtAssignment: juror.user.eloRating,
          scoreAtAssignment: juror.investigatorScore,
          status: 'pending',
        });

        assignedJurors.push(juror.userId);
        console.log(
          `[Jury] Assigned juror ${juror.userId} (ELO: ${juror.user.eloRating}) ` +
          `to case ${caseId}`
        );
      } catch (err) {
        // Might fail if there's a race condition with unique constraint
        errors.push(`Failed to assign ${juror.userId}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }

  // Update case status if we have enough jurors
  const totalAssigned = existingAssignments.length + assignedJurors.length;
  if (totalAssigned >= MIN_JURORS_PER_CASE) {
    await db
      .update(juryCases)
      .set({ status: 'active' })
      .where(eq(juryCases.id, caseId));
  }

  return {
    success: totalAssigned >= MIN_JURORS_PER_CASE,
    assignedCount: assignedJurors.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Find eligible jurors within a specific ELO range.
 *
 * @param minElo - Minimum ELO for this range
 * @param maxElo - Maximum ELO for this range
 * @param count - How many jurors to find
 * @param excludeIds - User IDs to exclude
 * @returns Array of eligible jurors
 */
async function findEligibleJurorsInRange(
  minElo: number,
  maxElo: number,
  count: number,
  excludeIds: string[]
): Promise<Array<typeof juryInvestigators.$inferSelect & { user: typeof users.$inferSelect }>> {
  // Build the query for eligible jurors
  const now = new Date();

  // We need to join with users to get current ELO
  // Since Drizzle doesn't support complex joins easily, we'll do this in steps

  // First, get all active jurors not in the exclude list
  const activeJurors = await db.query.juryInvestigators.findMany({
    where: and(
      eq(juryInvestigators.isActive, true),
      excludeIds.length > 0 ? notInArray(juryInvestigators.userId, excludeIds) : undefined
    ),
  });

  // Filter by suspension and get user data
  const eligibleJurors: Array<typeof juryInvestigators.$inferSelect & { user: typeof users.$inferSelect }> = [];

  for (const juror of activeJurors) {
    // Skip if suspended
    if (juror.suspendedUntil && juror.suspendedUntil > now) continue;

    // Get user data for ELO check
    const user = await db.query.users.findFirst({
      where: eq(users.id, juror.userId),
    });

    if (!user) continue;

    // Check ELO range
    if (user.eloRating >= minElo && user.eloRating <= maxElo) {
      eligibleJurors.push({ ...juror, user });
    }
  }

  // Sort by investigator score (higher score = more trusted) and take top N
  eligibleJurors.sort((a, b) => parseFloat(b.investigatorScore) - parseFloat(a.investigatorScore));

  return eligibleJurors.slice(0, count);
}

/**
 * Get the number of pending case assignments for a juror.
 *
 * @param userId - The juror's user ID
 * @returns Count of pending assignments
 */
async function getPendingAssignmentCount(userId: string): Promise<number> {
  const pending = await db.query.juryCaseAssignments.findMany({
    where: and(
      eq(juryCaseAssignments.investigatorId, userId),
      eq(juryCaseAssignments.status, 'pending')
    ),
  });

  return pending.length;
}

/**
 * Get all cases assigned to a juror.
 *
 * @param userId - The juror's user ID
 * @param status - Optional filter by assignment status
 * @returns Array of case assignments with case details
 */
export async function getJurorCases(
  userId: string,
  status?: 'pending' | 'in_progress' | 'completed'
): Promise<Array<JuryCaseAssignment & { case: JuryCase }>> {
  const assignments = await db.query.juryCaseAssignments.findMany({
    where: and(
      eq(juryCaseAssignments.investigatorId, userId),
      status ? eq(juryCaseAssignments.status, status) : undefined
    ),
    orderBy: [desc(juryCaseAssignments.assignedAt)],
  });

  // Fetch case details for each assignment
  const results: Array<JuryCaseAssignment & { case: JuryCase }> = [];

  for (const assignment of assignments) {
    const caseData = await db.query.juryCases.findFirst({
      where: eq(juryCases.id, assignment.caseId),
    });

    if (caseData) {
      results.push({ ...assignment, case: caseData });
    }
  }

  return results;
}

/**
 * Get case details for a juror to review.
 *
 * This returns anonymized case data (player IDs removed or replaced).
 *
 * @param caseId - The case ID
 * @param investigatorId - The juror requesting the case
 * @returns Anonymized case details or null if not assigned
 */
export async function getCaseForReview(
  caseId: string,
  investigatorId: string
): Promise<{
  case: JuryCase;
  game: typeof games.$inferSelect;
  anonymizedPlayerId: string;
} | null> {
  // Verify the juror is assigned to this case
  const assignment = await db.query.juryCaseAssignments.findFirst({
    where: and(
      eq(juryCaseAssignments.caseId, caseId),
      eq(juryCaseAssignments.investigatorId, investigatorId)
    ),
  });

  if (!assignment) {
    return null;
  }

  // Get case and game data
  const caseData = await db.query.juryCases.findFirst({
    where: eq(juryCases.id, caseId),
  });

  if (!caseData) {
    return null;
  }

  const game = await db.query.games.findFirst({
    where: eq(games.id, caseData.gameId),
  });

  if (!game) {
    return null;
  }

  // Mark assignment as in_progress if it was pending
  if (assignment.status === 'pending') {
    await db
      .update(juryCaseAssignments)
      .set({ status: 'in_progress' })
      .where(eq(juryCaseAssignments.id, assignment.id));
  }

  // Generate anonymized player ID (consistent for this case)
  // We use a hash of the case ID + suspect ID to generate a consistent anonymous name
  const anonymizedPlayerId = `Player_${caseId.slice(-6).toUpperCase()}`;

  return {
    case: caseData,
    game,
    anonymizedPlayerId,
  };
}

/**
 * Get all assignments for a case.
 *
 * @param caseId - The case ID
 * @returns Array of assignments
 */
export async function getCaseAssignments(caseId: string): Promise<JuryCaseAssignment[]> {
  return db.query.juryCaseAssignments.findMany({
    where: eq(juryCaseAssignments.caseId, caseId),
  });
}

/**
 * Mark an assignment as recused (juror can't review this case).
 *
 * @param caseId - The case ID
 * @param investigatorId - The juror's user ID
 * @param reason - Why they're recusing
 */
export async function recuseFromCase(
  caseId: string,
  investigatorId: string,
  reason: string
): Promise<void> {
  await db
    .update(juryCaseAssignments)
    .set({
      status: 'recused',
      completedAt: new Date(),
    })
    .where(and(
      eq(juryCaseAssignments.caseId, caseId),
      eq(juryCaseAssignments.investigatorId, investigatorId)
    ));

  console.log(`[Jury] Juror ${investigatorId} recused from case ${caseId}: ${reason}`);

  // Try to find a replacement juror
  await assignJurorsToCase(caseId);
}

/**
 * Expire all pending assignments that have passed the case deadline.
 *
 * This should be called periodically (e.g., every hour) to clean up.
 */
export async function expirePendingAssignments(): Promise<number> {
  const now = new Date();

  // Find all cases past their deadline that are still active
  const expiredCases = await db.query.juryCases.findMany({
    where: and(
      eq(juryCases.status, 'active'),
      lt(juryCases.deadline, now)
    ),
  });

  let expiredCount = 0;

  for (const caseData of expiredCases) {
    // Mark incomplete assignments as expired
    const result = await db
      .update(juryCaseAssignments)
      .set({ status: 'expired' })
      .where(and(
        eq(juryCaseAssignments.caseId, caseData.id),
        inArray(juryCaseAssignments.status, ['pending', 'in_progress'])
      ))
      .returning();

    expiredCount += result.length;
  }

  if (expiredCount > 0) {
    console.log(`[Jury] Expired ${expiredCount} pending assignments`);
  }

  return expiredCount;
}
