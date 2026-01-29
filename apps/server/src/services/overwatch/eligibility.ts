/**
 * Arbiter Overwatch Eligibility Service
 * ======================================
 *
 * Determines whether a user is eligible to serve as an arbiter in the community
 * review system. Eligibility is based on experience and standing.
 *
 * ELIGIBILITY REQUIREMENTS:
 * 1. ELO Rating >= 1400 (demonstrates competence at chess)
 * 2. Games Played >= 100 (has enough experience on the platform)
 * 3. Good Standing (not currently banned or under investigation)
 *
 * WHY THESE REQUIREMENTS:
 * - ELO 1400+: Arbiters need to understand good vs. suspicious play
 * - 100+ games: Ensures familiarity with platform norms and behaviors
 * - Good standing: Prevents bad actors from influencing verdicts
 */

import { eq, and, or, isNull, gt } from 'drizzle-orm';
import { db, users, overwatchArbiters, playerSanctions, overwatchCaseAssignments } from '../../drizzle';

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/** Minimum ELO rating required to be an arbiter */
export const OVERWATCH_MIN_ELO = 1400;

/** Minimum number of games played required to be an arbiter */
export const OVERWATCH_MIN_GAMES = 100;

/** Score threshold below which an arbiter is suspended */
export const OVERWATCH_SUSPENSION_THRESHOLD = 0.250;

/** Default suspension duration in days */
export const OVERWATCH_SUSPENSION_DAYS = 30;

/** Maximum number of pending cases an arbiter can have at once */
export const MAX_PENDING_ASSIGNMENTS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  /** Whether the user is eligible to be an arbiter */
  eligible: boolean;

  /** If already enrolled, the arbiter profile */
  enrolled: boolean;

  /** If enrolled, whether currently active */
  active?: boolean;

  /** If not eligible, why */
  reasons?: string[];

  /** Current stats for reference */
  stats: {
    currentElo: number;
    gamesPlayed: number;
    meetsEloRequirement: boolean;
    meetsGamesRequirement: boolean;
    hasGoodStanding: boolean;
  };
}

// ---------------------------------------------------------------------------
// Main Functions
// ---------------------------------------------------------------------------

/**
 * Check if a user is eligible to serve as an arbiter.
 *
 * This checks:
 * 1. ELO rating meets minimum (1400+)
 * 2. Games played meets minimum (100+)
 * 3. User is in good standing (no active sanctions)
 * 4. User is not currently under investigation
 *
 * @param userId - The user ID to check eligibility for
 * @returns Eligibility result with status and reasons
 */
export async function checkEligibility(userId: string): Promise<EligibilityResult> {
  // Get the user's current stats
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return {
      eligible: false,
      enrolled: false,
      reasons: ['User not found'],
      stats: {
        currentElo: 0,
        gamesPlayed: 0,
        meetsEloRequirement: false,
        meetsGamesRequirement: false,
        hasGoodStanding: false,
      },
    };
  }

  // Check if user is already enrolled as an arbiter
  const existingArbiter = await db.query.overwatchArbiters.findFirst({
    where: eq(overwatchArbiters.userId, userId),
  });

  // Check requirements
  const meetsEloRequirement = user.eloRating >= OVERWATCH_MIN_ELO;
  const meetsGamesRequirement = user.gamesPlayed >= OVERWATCH_MIN_GAMES;

  // Check for active sanctions OR recent sanctions (1-year cooldown after ban ends)
  // A user cannot be an arbiter if:
  // 1. They have a permanent ban (endsAt is null)
  // 2. They have a temp ban that hasn't ended yet (endsAt > now)
  // 3. They had a ban that ended less than 1 year ago (cooldown period)
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const blockingSanction = await db.query.playerSanctions.findFirst({
    where: and(
      eq(playerSanctions.playerId, userId),
      // Sanctions that block arbiter eligibility:
      // - Not appealed at all (appealed = false), OR
      // - Appealed but upheld (appeal failed - sanction remains in effect)
      // Successfully appealed sanctions (reduced/overturned) DON'T block
      or(
        // Not appealed at all
        eq(playerSanctions.appealed, false),
        // Appealed but upheld (appeal failed)
        eq(playerSanctions.appealOutcome, 'upheld')
      ),
      or(
        isNull(playerSanctions.endsAt),        // Permanent ban
        gt(playerSanctions.endsAt, now),       // Temp ban still active
        gt(playerSanctions.endsAt, oneYearAgo) // Ban ended within last year (cooldown)
      )
    ),
  });

  // A user has good standing if they have no blocking sanctions
  const hasGoodStanding = !blockingSanction;

  const reasons: string[] = [];
  if (!meetsEloRequirement) {
    reasons.push(`ELO rating must be at least ${OVERWATCH_MIN_ELO} (current: ${user.eloRating})`);
  }
  if (!meetsGamesRequirement) {
    reasons.push(`Must have played at least ${OVERWATCH_MIN_GAMES} games (current: ${user.gamesPlayed})`);
  }
  if (!hasGoodStanding) {
    // Provide more specific feedback about why they're not eligible
    if (blockingSanction) {
      if (blockingSanction.endsAt === null) {
        reasons.push('Must be in good standing (currently under permanent sanction)');
      } else if (blockingSanction.endsAt > now) {
        reasons.push(`Must be in good standing (active sanction until ${blockingSanction.endsAt.toISOString().split('T')[0]})`);
      } else {
        // Ban ended but within 1-year cooldown
        const cooldownEnds = new Date(blockingSanction.endsAt);
        cooldownEnds.setFullYear(cooldownEnds.getFullYear() + 1);
        reasons.push(`Must be in good standing (1-year cooldown after sanction ends, eligible ${cooldownEnds.toISOString().split('T')[0]})`);
      }
    } else {
      reasons.push('Must be in good standing (no active sanctions)');
    }
  }

  const eligible = meetsEloRequirement && meetsGamesRequirement && hasGoodStanding;

  // If enrolled, check if suspended
  let active = true;
  if (existingArbiter) {
    if (!existingArbiter.isActive) {
      active = false;
    }
    if (existingArbiter.suspendedUntil && existingArbiter.suspendedUntil > now) {
      active = false;
    }
  }

  return {
    eligible,
    enrolled: !!existingArbiter,
    active: existingArbiter ? active : undefined,
    reasons: reasons.length > 0 ? reasons : undefined,
    stats: {
      currentElo: user.eloRating,
      gamesPlayed: user.gamesPlayed,
      meetsEloRequirement,
      meetsGamesRequirement,
      hasGoodStanding,
    },
  };
}

/**
 * Enroll a user as an arbiter.
 *
 * This creates an arbiter profile for the user with their current stats.
 * The user must pass eligibility checks first.
 *
 * @param userId - The user ID to enroll
 * @returns The created arbiter profile or error
 */
export async function enrollAsArbiter(userId: string): Promise<{
  success: boolean;
  error?: string;
  arbiter?: typeof overwatchArbiters.$inferSelect;
}> {
  // Check eligibility first
  const eligibility = await checkEligibility(userId);

  if (eligibility.enrolled) {
    // User is already enrolled, just return success
    const existingArbiter = await db.query.overwatchArbiters.findFirst({
      where: eq(overwatchArbiters.userId, userId),
    });
    return { success: true, arbiter: existingArbiter! };
  }

  if (!eligibility.eligible) {
    return {
      success: false,
      error: `Not eligible: ${eligibility.reasons?.join(', ')}`,
    };
  }

  // Create the arbiter profile
  const [newArbiter] = await db
    .insert(overwatchArbiters)
    .values({
      userId,
      eloAtQualification: eligibility.stats.currentElo,
      gamesAtQualification: eligibility.stats.gamesPlayed,
      investigatorScore: '0.500', // Start at neutral
      casesReviewed: 0,
      accurateVerdicts: 0,
      isActive: true,
    })
    .returning();

  console.log(`[Overwatch] User ${userId} enrolled as arbiter with ELO ${eligibility.stats.currentElo}`);

  return { success: true, arbiter: newArbiter };
}

/**
 * Get a user's arbiter profile if they are enrolled.
 *
 * @param userId - The user ID to look up
 * @returns The arbiter profile or null
 */
export async function getArbiterProfile(userId: string): Promise<typeof overwatchArbiters.$inferSelect | null> {
  const profile = await db.query.overwatchArbiters.findFirst({
    where: eq(overwatchArbiters.userId, userId),
  });
  return profile ?? null;
}

/**
 * Check if an arbiter is currently eligible to receive new case assignments.
 *
 * This is different from general eligibility - it checks if an enrolled arbiter
 * can currently take on new cases (not suspended, not too busy, etc.)
 *
 * @param userId - The arbiter's user ID
 * @returns Whether they can receive new assignments
 */
export async function canReceiveAssignments(userId: string): Promise<boolean> {
  const arbiter = await getArbiterProfile(userId);

  if (!arbiter) {
    return false;
  }

  // Check if active
  if (!arbiter.isActive) {
    return false;
  }

  // Check if suspended
  const now = new Date();
  if (arbiter.suspendedUntil && arbiter.suspendedUntil > now) {
    return false;
  }

  // Check if score is above suspension threshold
  const score = parseFloat(arbiter.investigatorScore);
  if (score < OVERWATCH_SUSPENSION_THRESHOLD) {
    return false;
  }

  // Check pending assignment count - arbiters shouldn't be overloaded
  const pendingAssignments = await db.query.overwatchCaseAssignments.findMany({
    where: and(
      eq(overwatchCaseAssignments.investigatorId, userId),
      eq(overwatchCaseAssignments.status, 'pending')
    ),
  });

  if (pendingAssignments.length >= MAX_PENDING_ASSIGNMENTS) {
    return false; // Arbiter has too many pending cases
  }

  return true;
}

/**
 * Suspend an arbiter for poor performance.
 *
 * @param userId - The arbiter to suspend
 * @param reason - Why they're being suspended
 * @param durationDays - How long to suspend (default: 30 days)
 */
export async function suspendArbiter(
  userId: string,
  reason: string,
  durationDays: number = OVERWATCH_SUSPENSION_DAYS
): Promise<void> {
  const suspendedUntil = new Date();
  suspendedUntil.setDate(suspendedUntil.getDate() + durationDays);

  await db
    .update(overwatchArbiters)
    .set({
      isActive: false,
      suspendedUntil,
      suspensionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(overwatchArbiters.userId, userId));

  console.log(`[Overwatch] Arbiter ${userId} suspended for ${durationDays} days: ${reason}`);
}

/**
 * Reactivate a suspended arbiter.
 *
 * @param userId - The arbiter to reactivate
 */
export async function reactivateArbiter(userId: string): Promise<void> {
  await db
    .update(overwatchArbiters)
    .set({
      isActive: true,
      suspendedUntil: null,
      suspensionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(overwatchArbiters.userId, userId));

  console.log(`[Overwatch] Arbiter ${userId} reactivated`);
}
