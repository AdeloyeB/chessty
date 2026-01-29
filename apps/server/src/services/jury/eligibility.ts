/**
 * Jury Eligibility Service
 * =========================
 *
 * Determines whether a user is eligible to serve as a juror in the community
 * review system. Eligibility is based on experience and standing.
 *
 * ELIGIBILITY REQUIREMENTS:
 * 1. ELO Rating >= 1400 (demonstrates competence at chess)
 * 2. Games Played >= 100 (has enough experience on the platform)
 * 3. Good Standing (not currently banned or under investigation)
 *
 * WHY THESE REQUIREMENTS:
 * - ELO 1400+: Jurors need to understand good vs. suspicious play
 * - 100+ games: Ensures familiarity with platform norms and behaviors
 * - Good standing: Prevents bad actors from influencing verdicts
 */

import { eq, and, or, isNull, gt } from 'drizzle-orm';
import { db, users, juryInvestigators, playerSanctions, juryCaseAssignments } from '../../drizzle';

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/** Minimum ELO rating required to be a juror */
export const JURY_MIN_ELO = 1400;

/** Minimum number of games played required to be a juror */
export const JURY_MIN_GAMES = 100;

/** Score threshold below which a juror is suspended */
export const JURY_SUSPENSION_THRESHOLD = 0.250;

/** Default suspension duration in days */
export const JURY_SUSPENSION_DAYS = 30;

/** Maximum number of pending cases a juror can have at once */
export const MAX_PENDING_ASSIGNMENTS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  /** Whether the user is eligible to be a juror */
  eligible: boolean;

  /** If already enrolled, the juror profile */
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
 * Check if a user is eligible to serve as a juror.
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

  // Check if user is already enrolled as a juror
  const existingJuror = await db.query.juryInvestigators.findFirst({
    where: eq(juryInvestigators.userId, userId),
  });

  // Check requirements
  const meetsEloRequirement = user.eloRating >= JURY_MIN_ELO;
  const meetsGamesRequirement = user.gamesPlayed >= JURY_MIN_GAMES;

  // Check for active sanctions OR recent sanctions (1-year cooldown after ban ends)
  // A user cannot be a juror if:
  // 1. They have a permanent ban (endsAt is null)
  // 2. They have a temp ban that hasn't ended yet (endsAt > now)
  // 3. They had a ban that ended less than 1 year ago (cooldown period)
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const blockingSanction = await db.query.playerSanctions.findFirst({
    where: and(
      eq(playerSanctions.playerId, userId),
      // Only consider non-appealed sanctions (successfully appealed sanctions don't block)
      eq(playerSanctions.appealed, false),
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
    reasons.push(`ELO rating must be at least ${JURY_MIN_ELO} (current: ${user.eloRating})`);
  }
  if (!meetsGamesRequirement) {
    reasons.push(`Must have played at least ${JURY_MIN_GAMES} games (current: ${user.gamesPlayed})`);
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
  if (existingJuror) {
    if (!existingJuror.isActive) {
      active = false;
    }
    if (existingJuror.suspendedUntil && existingJuror.suspendedUntil > now) {
      active = false;
    }
  }

  return {
    eligible,
    enrolled: !!existingJuror,
    active: existingJuror ? active : undefined,
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
 * Enroll a user as a juror.
 *
 * This creates a juror profile for the user with their current stats.
 * The user must pass eligibility checks first.
 *
 * @param userId - The user ID to enroll
 * @returns The created juror profile or error
 */
export async function enrollAsJuror(userId: string): Promise<{
  success: boolean;
  error?: string;
  juror?: typeof juryInvestigators.$inferSelect;
}> {
  // Check eligibility first
  const eligibility = await checkEligibility(userId);

  if (eligibility.enrolled) {
    // User is already enrolled, just return success
    const existingJuror = await db.query.juryInvestigators.findFirst({
      where: eq(juryInvestigators.userId, userId),
    });
    return { success: true, juror: existingJuror! };
  }

  if (!eligibility.eligible) {
    return {
      success: false,
      error: `Not eligible: ${eligibility.reasons?.join(', ')}`,
    };
  }

  // Create the juror profile
  const [newJuror] = await db
    .insert(juryInvestigators)
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

  console.log(`[Jury] User ${userId} enrolled as juror with ELO ${eligibility.stats.currentElo}`);

  return { success: true, juror: newJuror };
}

/**
 * Get a user's juror profile if they are enrolled.
 *
 * @param userId - The user ID to look up
 * @returns The juror profile or null
 */
export async function getJurorProfile(userId: string): Promise<typeof juryInvestigators.$inferSelect | null> {
  const profile = await db.query.juryInvestigators.findFirst({
    where: eq(juryInvestigators.userId, userId),
  });
  return profile ?? null;
}

/**
 * Check if a juror is currently eligible to receive new case assignments.
 *
 * This is different from general eligibility - it checks if an enrolled juror
 * can currently take on new cases (not suspended, not too busy, etc.)
 *
 * @param userId - The juror's user ID
 * @returns Whether they can receive new assignments
 */
export async function canReceiveAssignments(userId: string): Promise<boolean> {
  const juror = await getJurorProfile(userId);

  if (!juror) {
    return false;
  }

  // Check if active
  if (!juror.isActive) {
    return false;
  }

  // Check if suspended
  const now = new Date();
  if (juror.suspendedUntil && juror.suspendedUntil > now) {
    return false;
  }

  // Check if score is above suspension threshold
  const score = parseFloat(juror.investigatorScore);
  if (score < JURY_SUSPENSION_THRESHOLD) {
    return false;
  }

  // Check pending assignment count - jurors shouldn't be overloaded
  const pendingAssignments = await db.query.juryCaseAssignments.findMany({
    where: and(
      eq(juryCaseAssignments.investigatorId, userId),
      eq(juryCaseAssignments.status, 'pending')
    ),
  });

  if (pendingAssignments.length >= MAX_PENDING_ASSIGNMENTS) {
    return false; // Juror has too many pending cases
  }

  return true;
}

/**
 * Suspend a juror for poor performance.
 *
 * @param userId - The juror to suspend
 * @param reason - Why they're being suspended
 * @param durationDays - How long to suspend (default: 30 days)
 */
export async function suspendJuror(
  userId: string,
  reason: string,
  durationDays: number = JURY_SUSPENSION_DAYS
): Promise<void> {
  const suspendedUntil = new Date();
  suspendedUntil.setDate(suspendedUntil.getDate() + durationDays);

  await db
    .update(juryInvestigators)
    .set({
      isActive: false,
      suspendedUntil,
      suspensionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(juryInvestigators.userId, userId));

  console.log(`[Jury] Juror ${userId} suspended for ${durationDays} days: ${reason}`);
}

/**
 * Reactivate a suspended juror.
 *
 * @param userId - The juror to reactivate
 */
export async function reactivateJuror(userId: string): Promise<void> {
  await db
    .update(juryInvestigators)
    .set({
      isActive: true,
      suspendedUntil: null,
      suspensionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(juryInvestigators.userId, userId));

  console.log(`[Jury] Juror ${userId} reactivated`);
}
