/**
 * Arbiter Overwatch Case Assignment Service
 * ==========================================
 *
 * Handles assigning arbiters to cases and managing the assignment lifecycle.
 *
 * ASSIGNMENT STRATEGY:
 * Each case gets 5-7 arbiters from different ELO ranges to ensure diverse
 * perspectives. Higher-rated arbiters can spot subtle cheating patterns,
 * while lower-rated arbiters ensure obvious cheating isn't missed.
 *
 * ELO RANGES FOR ASSIGNMENT:
 * - 1400-1600: 1-2 arbiters
 * - 1600-1800: 1-2 arbiters
 * - 1800-2000: 1-2 arbiters
 * - 2000+: 1 arbiter (if available)
 *
 * EXCLUSIONS:
 * - Players who played in the game being reviewed
 * - Players who have played against the suspect recently
 * - Players currently under investigation themselves
 */

import { eq, and, lt, notInArray, inArray, desc, gte, lte, or, isNull } from 'drizzle-orm';
// nanoid will be used when we need to generate unique IDs for assignments
import {
  db,
  users,
  games,
  overwatchArbiters,
  overwatchCases,
  overwatchCaseAssignments,
  type OverwatchCase,
  type OverwatchCaseAssignment,
} from '../../drizzle';
import { canReceiveAssignments, MAX_PENDING_ASSIGNMENTS } from './eligibility';
import { anonymizePlayerId } from '../../utils/anonymize';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum number of arbiters per case */
export const MIN_ARBITERS_PER_CASE = 5;

/** Maximum number of arbiters per case */
export const MAX_ARBITERS_PER_CASE = 7;

/** Target number of arbiters per case */
export const TARGET_ARBITERS_PER_CASE = 6;

/** Case deadline in hours from creation */
export const CASE_DEADLINE_HOURS = 48;

/**
 * ELO ranges for diverse assignment.
 * We try to get arbiters from each range to ensure perspectives across skill levels.
 */
export const ELO_RANGES = [
  { min: 1400, max: 1599, target: 2 },
  { min: 1600, max: 1799, target: 2 },
  { min: 1800, max: 1999, target: 1 },
  { min: 2000, max: 9999, target: 1 },
] as const;

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
 * Create a new overwatch case for a flagged game.
 *
 * This creates the case record and immediately attempts to assign arbiters.
 *
 * @param input - Case creation parameters
 * @returns The created case
 */
export async function createCase(input: CaseCreationInput): Promise<OverwatchCase> {
  // Calculate deadline (default: 48 hours from now)
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + CASE_DEADLINE_HOURS);

  // Create the case
  const [newCase] = await db
    .insert(overwatchCases)
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
    `[Overwatch] Created case ${newCase.id} for game ${input.gameId} ` +
    `(suspect: ${input.suspectPlayerId}, score: ${input.suspicionScore.toFixed(2)})`
  );

  // Attempt to assign arbiters immediately
  await assignArbitersToCase(newCase.id);

  // Refresh the case to get updated status
  const updatedCase = await db.query.overwatchCases.findFirst({
    where: eq(overwatchCases.id, newCase.id),
  });

  return updatedCase!;
}

/**
 * Assign arbiters to a case.
 *
 * This finds eligible arbiters from different ELO ranges and assigns them.
 * Excludes players involved in the game or who know the suspect.
 *
 * @param caseId - The case to assign arbiters to
 * @returns Assignment result with count and any errors
 */
export async function assignArbitersToCase(caseId: string): Promise<AssignmentResult> {
  const errors: string[] = [];

  // Get the case and related game
  const overwatchCase = await db.query.overwatchCases.findFirst({
    where: eq(overwatchCases.id, caseId),
  });

  if (!overwatchCase) {
    return { success: false, assignedCount: 0, errors: ['Case not found'] };
  }

  // Get the game to find excluded players
  const game = await db.query.games.findFirst({
    where: eq(games.id, overwatchCase.gameId),
  });

  if (!game) {
    return { success: false, assignedCount: 0, errors: ['Game not found'] };
  }

  // Players who cannot be arbiters for this case
  const excludedPlayerIds = [
    game.whitePlayerId,
    game.blackPlayerId,
    overwatchCase.suspectPlayerId,
  ];

  // Get current assignments to avoid duplicates
  const existingAssignments = await db.query.overwatchCaseAssignments.findMany({
    where: eq(overwatchCaseAssignments.caseId, caseId),
  });
  const alreadyAssignedIds = existingAssignments.map(a => a.investigatorId);

  // Find eligible arbiters from each ELO range
  const assignedArbiters: string[] = [];

  for (const range of ELO_RANGES) {
    const arbitersInRange = await findEligibleArbitersInRange(
      range.min,
      range.max,
      range.target,
      [...excludedPlayerIds, ...alreadyAssignedIds, ...assignedArbiters]
    );

    for (const arbiter of arbitersInRange) {
      // Double-check they can receive assignments
      const canAssign = await canReceiveAssignments(arbiter.userId);
      if (!canAssign) continue;

      // Check they don't have too many pending cases
      const pendingCount = await getPendingAssignmentCount(arbiter.userId);
      if (pendingCount >= MAX_PENDING_ASSIGNMENTS) continue;

      // Create the assignment
      try {
        await db.insert(overwatchCaseAssignments).values({
          caseId,
          investigatorId: arbiter.userId,
          eloAtAssignment: arbiter.user.eloRating,
          scoreAtAssignment: arbiter.investigatorScore,
          status: 'pending',
        });

        assignedArbiters.push(arbiter.userId);
        console.log(
          `[Overwatch] Assigned arbiter ${arbiter.userId} (ELO: ${arbiter.user.eloRating}) ` +
          `to case ${caseId}`
        );
      } catch (err) {
        // Might fail if there's a race condition with unique constraint
        errors.push(`Failed to assign ${arbiter.userId}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }

  // Update case status if we have enough arbiters
  const totalAssigned = existingAssignments.length + assignedArbiters.length;
  if (totalAssigned >= MIN_ARBITERS_PER_CASE) {
    await db
      .update(overwatchCases)
      .set({ status: 'active' })
      .where(eq(overwatchCases.id, caseId));
  }

  return {
    success: totalAssigned >= MIN_ARBITERS_PER_CASE,
    assignedCount: assignedArbiters.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Find eligible arbiters within a specific ELO range.
 *
 * Uses batch queries to avoid N+1 database calls:
 * 1. Single query to get all active, non-suspended arbiters
 * 2. Single query to get all users in the ELO range
 * 3. In-memory join using a Map for O(1) lookups
 *
 * @param minElo - Minimum ELO for this range
 * @param maxElo - Maximum ELO for this range
 * @param count - How many arbiters to find
 * @param excludeIds - User IDs to exclude
 * @returns Array of eligible arbiters sorted by investigator score
 */
async function findEligibleArbitersInRange(
  minElo: number,
  maxElo: number,
  count: number,
  excludeIds: string[]
): Promise<Array<typeof overwatchArbiters.$inferSelect & { user: typeof users.$inferSelect; parsedScore: number }>> {
  const now = new Date();

  // Step 1: Get all active, non-suspended arbiters not in the exclude list (single query)
  const activeArbiters = await db.query.overwatchArbiters.findMany({
    where: and(
      eq(overwatchArbiters.isActive, true),
      excludeIds.length > 0 ? notInArray(overwatchArbiters.userId, excludeIds) : undefined,
      // Filter out suspended arbiters at the database level
      or(
        isNull(overwatchArbiters.suspendedUntil),
        lt(overwatchArbiters.suspendedUntil, now)
      )
    ),
  });

  if (activeArbiters.length === 0) return [];

  // Step 2: Batch fetch ALL users in ONE query, filtered by ELO range
  const userIds = activeArbiters.map(j => j.userId);
  const usersInRange = await db.query.users.findMany({
    where: and(
      inArray(users.id, userIds),
      gte(users.eloRating, minElo),
      lte(users.eloRating, maxElo)
    ),
  });

  if (usersInRange.length === 0) return [];

  // Step 3: Join in memory using Map for O(1) lookups
  const userMap = new Map(usersInRange.map(u => [u.id, u]));

  // Step 4: Pre-parse scores ONCE before sorting (avoids repeated parseFloat in sort comparator)
  const eligibleArbiters = activeArbiters
    .filter(j => userMap.has(j.userId))
    .map(j => ({
      ...j,
      user: userMap.get(j.userId)!,
      parsedScore: parseFloat(j.investigatorScore),
    }));

  // Sort by pre-parsed investigator score (higher score = more trusted)
  eligibleArbiters.sort((a, b) => b.parsedScore - a.parsedScore);

  return eligibleArbiters.slice(0, count);
}

/**
 * Get the number of pending case assignments for an arbiter.
 *
 * @param userId - The arbiter's user ID
 * @returns Count of pending assignments
 */
async function getPendingAssignmentCount(userId: string): Promise<number> {
  const pending = await db.query.overwatchCaseAssignments.findMany({
    where: and(
      eq(overwatchCaseAssignments.investigatorId, userId),
      eq(overwatchCaseAssignments.status, 'pending')
    ),
  });

  return pending.length;
}

/**
 * Get all cases assigned to an arbiter.
 *
 * @param userId - The arbiter's user ID
 * @param status - Optional filter by assignment status
 * @returns Array of case assignments with case details
 */
export async function getArbiterCases(
  userId: string,
  status?: 'pending' | 'in_progress' | 'completed'
): Promise<Array<OverwatchCaseAssignment & { case: OverwatchCase }>> {
  const assignments = await db.query.overwatchCaseAssignments.findMany({
    where: and(
      eq(overwatchCaseAssignments.investigatorId, userId),
      status ? eq(overwatchCaseAssignments.status, status) : undefined
    ),
    orderBy: [desc(overwatchCaseAssignments.assignedAt)],
  });

  // Handle empty assignments case
  if (assignments.length === 0) {
    return [];
  }

  // BATCH QUERY: Fetch all cases in one query instead of N queries (fixes N+1 problem)
  const caseIds = assignments.map(a => a.caseId);
  const cases = await db.query.overwatchCases.findMany({
    where: inArray(overwatchCases.id, caseIds),
  });

  // Create lookup map for O(1) access
  const caseMap = new Map(cases.map(c => [c.id, c]));

  // Join in memory
  return assignments
    .map(assignment => {
      const caseData = caseMap.get(assignment.caseId);
      return caseData ? { ...assignment, case: caseData } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Get case details for an arbiter to review.
 *
 * This returns anonymized case data (player IDs removed or replaced).
 *
 * @param caseId - The case ID
 * @param investigatorId - The arbiter requesting the case
 * @returns Anonymized case details or null if not assigned
 */
export async function getCaseForReview(
  caseId: string,
  investigatorId: string
): Promise<{
  case: OverwatchCase;
  game: typeof games.$inferSelect;
  anonymizedPlayerId: string;
} | null> {
  // Verify the arbiter is assigned to this case
  const assignment = await db.query.overwatchCaseAssignments.findFirst({
    where: and(
      eq(overwatchCaseAssignments.caseId, caseId),
      eq(overwatchCaseAssignments.investigatorId, investigatorId)
    ),
  });

  if (!assignment) {
    return null;
  }

  // Get case and game data
  const caseData = await db.query.overwatchCases.findFirst({
    where: eq(overwatchCases.id, caseId),
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
      .update(overwatchCaseAssignments)
      .set({ status: 'in_progress' })
      .where(eq(overwatchCaseAssignments.id, assignment.id));
  }

  // Generate anonymized player ID using secure HMAC-based anonymization
  // This is deterministic (same inputs = same output) but irreversible
  const anonymizedPlayer = anonymizePlayerId(caseId, caseData.suspectPlayerId);

  return {
    case: caseData,
    game,
    anonymizedPlayerId: anonymizedPlayer,
  };
}

/**
 * Get all assignments for a case.
 *
 * @param caseId - The case ID
 * @returns Array of assignments
 */
export async function getCaseAssignments(caseId: string): Promise<OverwatchCaseAssignment[]> {
  return db.query.overwatchCaseAssignments.findMany({
    where: eq(overwatchCaseAssignments.caseId, caseId),
  });
}

/**
 * Mark an assignment as recused (arbiter can't review this case).
 *
 * @param caseId - The case ID
 * @param investigatorId - The arbiter's user ID
 * @param reason - Why they're recusing
 */
export async function recuseFromCase(
  caseId: string,
  investigatorId: string,
  reason: string
): Promise<void> {
  await db
    .update(overwatchCaseAssignments)
    .set({
      status: 'recused',
      completedAt: new Date(),
    })
    .where(and(
      eq(overwatchCaseAssignments.caseId, caseId),
      eq(overwatchCaseAssignments.investigatorId, investigatorId)
    ));

  console.log(`[Overwatch] Arbiter ${investigatorId} recused from case ${caseId}: ${reason}`);

  // Try to find a replacement arbiter
  await assignArbitersToCase(caseId);
}

/**
 * Expire all pending assignments that have passed the case deadline.
 *
 * This should be called periodically (e.g., every hour) to clean up.
 */
export async function expirePendingAssignments(): Promise<number> {
  const now = new Date();

  // Find all cases past their deadline that are still active
  const expiredCases = await db.query.overwatchCases.findMany({
    where: and(
      eq(overwatchCases.status, 'active'),
      lt(overwatchCases.deadline, now)
    ),
  });

  let expiredCount = 0;

  for (const caseData of expiredCases) {
    // Mark incomplete assignments as expired
    const result = await db
      .update(overwatchCaseAssignments)
      .set({ status: 'expired' })
      .where(and(
        eq(overwatchCaseAssignments.caseId, caseData.id),
        inArray(overwatchCaseAssignments.status, ['pending', 'in_progress'])
      ))
      .returning();

    expiredCount += result.length;
  }

  if (expiredCount > 0) {
    console.log(`[Overwatch] Expired ${expiredCount} pending assignments`);
  }

  return expiredCount;
}
