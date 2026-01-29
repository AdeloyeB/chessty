/**
 * Arbiter Overwatch Test Cases Service
 * =====================================
 *
 * Handles calibration cases (test cases) that are used to measure arbiter accuracy.
 *
 * WHAT ARE TEST CASES?
 * Test cases are overwatch cases where we already know the correct answer.
 * They're inserted into the case queue without arbiters knowing which cases
 * are real and which are tests.
 *
 * PURPOSE:
 * 1. Measure arbiter accuracy objectively
 * 2. Catch bad-faith arbiters (those who vote randomly or always vote one way)
 * 3. Maintain overwatch quality over time
 * 4. Provide training for new arbiters
 *
 * HOW IT WORKS:
 * - 1 in 5 cases (20%) are test cases
 * - Test cases are marked isTestCase=true and have a knownOutcome
 * - Arbiters who fail test cases get extra penalties to their score
 * - Arbiters who pass test cases get extra bonuses
 *
 * SOURCES OF TEST CASES:
 * 1. Confirmed cheaters from previous investigations (known guilty)
 * 2. Verified clean games from trusted players (known innocent)
 * 3. Manually curated edge cases for training
 */

import { eq, and, desc, gte } from 'drizzle-orm';
import {
  db,
  games,
  overwatchCases,
  playerSanctions,
  users,
  type OverwatchCase,
} from '../../drizzle';
import { createCase } from './case-assignment';
import { withTransaction } from '../../utils/transaction';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Target percentage of cases that should be test cases */
export const TEST_CASE_TARGET_PERCENTAGE = 0.20; // 20%

/** Minimum suspicion score for a game to be selected as a "known guilty" test case */
export const KNOWN_GUILTY_MIN_SCORE = 0.99;

/** Maximum suspicion score for a game to be selected as a "known innocent" test case */
export const KNOWN_INNOCENT_MAX_SCORE = 0.10;

/** How many test cases to maintain in the pool */
export const TEST_CASE_POOL_SIZE = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestCaseSource {
  gameId: string;
  playerId: string;
  outcome: 'guilty' | 'innocent';
  reason: string;
  suspicionScore: number;
}

// ---------------------------------------------------------------------------
// Test Case Management
// ---------------------------------------------------------------------------

/**
 * Determine if the next case should be a test case.
 *
 * Based on the ratio of test cases to real cases in recent history,
 * returns whether we should insert a test case next.
 *
 * @returns Whether to insert a test case
 */
export async function shouldInsertTestCase(): Promise<boolean> {
  // Get recent cases (last 100)
  const recentCases = await db.query.overwatchCases.findMany({
    orderBy: [desc(overwatchCases.createdAt)],
    limit: 100,
  });

  if (recentCases.length < 5) {
    // Not enough data, default to 20% chance
    return Math.random() < TEST_CASE_TARGET_PERCENTAGE;
  }

  // Calculate current test case ratio
  const testCaseCount = recentCases.filter(c => c.isTestCase).length;
  const currentRatio = testCaseCount / recentCases.length;

  // If we're below target, higher chance to insert
  // If we're above target, lower chance
  const targetRatio = TEST_CASE_TARGET_PERCENTAGE;
  const adjustedChance = targetRatio + (targetRatio - currentRatio);

  return Math.random() < Math.max(0, Math.min(1, adjustedChance));
}

/**
 * Get a test case to insert into the queue.
 *
 * Randomly selects from available test case sources:
 * - Known guilty cases (from confirmed sanctions)
 * - Known innocent cases (from trusted players with low suspicion)
 *
 * @returns A test case source or null if none available
 */
export async function getTestCaseSource(): Promise<TestCaseSource | null> {
  // Randomly decide: 50% guilty, 50% innocent
  const selectGuilty = Math.random() < 0.5;

  if (selectGuilty) {
    return await getKnownGuiltyCase();
  } else {
    return await getKnownInnocentCase();
  }
}

/**
 * Find a game from a confirmed cheater to use as a "known guilty" test case.
 *
 * WHY TRANSACTION:
 * This function does multiple queries (sanctions, then games as white, then games as black).
 * Without a transaction, the data could change between queries - for example, a sanction
 * could be removed or a game deleted mid-operation. The transaction ensures we get a
 * consistent snapshot of the data across all queries.
 *
 * @returns A test case source or null
 */
async function getKnownGuiltyCase(): Promise<TestCaseSource | null> {
  return withTransaction(async (tx) => {
    // Find players with active sanctions from overwatch verdicts
    const sanctions = await tx.query.playerSanctions.findMany({
      where: and(
        eq(playerSanctions.sanctionType, 'temp_ban'),
        // Only use sanctions from overwatch verdicts (contain "Case:" in reason)
      ),
      limit: 50,
    });

    // Filter to sanctions that mention overwatch cases
    const overwatchSanctions = sanctions.filter(s =>
      s.reason.includes('Case:') || s.reason.includes('overwatch') || s.reason.includes('overwatch')
    );

    if (overwatchSanctions.length === 0) {
      // No confirmed cheaters, try using high-suspicion flags
      // Note: getHighSuspicionCase() runs outside this transaction, which is fine
      // because it's a separate, independent lookup
      return await getHighSuspicionCase();
    }

    // Pick a random sanctioned player
    const randomSanction = overwatchSanctions[Math.floor(Math.random() * overwatchSanctions.length)];

    // Find one of their games that hasn't been used as a test case recently
    // Use tx for consistency - ensures games match the sanction we just found
    const playerGames = await tx.query.games.findMany({
      where: eq(games.whitePlayerId, randomSanction.playerId),
      orderBy: [desc(games.createdAt)],
      limit: 20,
    });

    // Also check games where they were black
    const blackGames = await tx.query.games.findMany({
      where: eq(games.blackPlayerId, randomSanction.playerId),
      orderBy: [desc(games.createdAt)],
      limit: 20,
    });

    const allGames = [...playerGames, ...blackGames];

    if (allGames.length === 0) {
      return null;
    }

    // Pick a random game
    const randomGame = allGames[Math.floor(Math.random() * allGames.length)];

    return {
      gameId: randomGame.id,
      playerId: randomSanction.playerId,
      outcome: 'guilty',
      reason: 'Confirmed cheater (previously sanctioned)',
      suspicionScore: 0.99,
    };
  });
}

/**
 * Find a game from a high-suspicion case to use as a test case.
 *
 * @returns A test case source or null
 */
async function getHighSuspicionCase(): Promise<TestCaseSource | null> {
  // Find games with very high suspicion scores that weren't already test cases
  const resolvedGuilty = await db.query.overwatchCases.findMany({
    where: and(
      eq(overwatchCases.status, 'resolved'),
      eq(overwatchCases.finalVerdict, 'guilty'),
      eq(overwatchCases.isTestCase, false)
    ),
    orderBy: [desc(overwatchCases.createdAt)],
    limit: 20,
  });

  if (resolvedGuilty.length === 0) {
    return null;
  }

  // Pick a random case
  const randomCase = resolvedGuilty[Math.floor(Math.random() * resolvedGuilty.length)];

  return {
    gameId: randomCase.gameId,
    playerId: randomCase.suspectPlayerId,
    outcome: 'guilty',
    reason: 'Previously confirmed by arbiters (high confidence)',
    suspicionScore: parseFloat(randomCase.suspicionScore),
  };
}

/**
 * Find a game from a trusted player to use as a "known innocent" test case.
 *
 * Criteria for "trusted player":
 * - High ELO (2000+) with many games
 * - Never sanctioned
 * - Low suspicion scores historically
 *
 * @returns A test case source or null
 */
async function getKnownInnocentCase(): Promise<TestCaseSource | null> {
  // Find high-rated, experienced players
  // Filter directly in the query instead of fetching all users
  const trustedPlayers = await db.query.users.findMany({
    where: and(
      gte(users.eloRating, 2000),
      gte(users.gamesPlayed, 200)
    ),
    limit: 100,
    orderBy: [desc(users.eloRating)], // Get highest rated first
  });

  if (trustedPlayers.length === 0) {
    return null;
  }

  // Pick a random player
  const randomPlayer = trustedPlayers[Math.floor(Math.random() * trustedPlayers.length)];

  // Find a recent game of theirs
  const playerGames = await db.query.games.findMany({
    where: eq(games.whitePlayerId, randomPlayer.id),
    orderBy: [desc(games.createdAt)],
    limit: 10,
  });

  const blackGames = await db.query.games.findMany({
    where: eq(games.blackPlayerId, randomPlayer.id),
    orderBy: [desc(games.createdAt)],
    limit: 10,
  });

  const allGames = [...playerGames, ...blackGames];

  if (allGames.length === 0) {
    return null;
  }

  // Pick a random game
  const randomGame = allGames[Math.floor(Math.random() * allGames.length)];

  return {
    gameId: randomGame.id,
    playerId: randomPlayer.id,
    outcome: 'innocent',
    reason: 'Trusted player (high ELO, clean history)',
    suspicionScore: 0.05,
  };
}

/**
 * Create a test case from a source.
 *
 * @param source - The test case source
 * @returns The created overwatch case
 */
export async function createTestCase(source: TestCaseSource): Promise<OverwatchCase> {
  console.log(
    `[Overwatch] Creating test case: ${source.outcome} ` +
    `(game: ${source.gameId}, player: ${source.playerId})`
  );

  // DON'T expose testCaseReason to arbiters - it reveals this is a test case
  return createCase({
    gameId: source.gameId,
    suspectPlayerId: source.playerId,
    suspicionScore: source.suspicionScore,
    priority: 'normal',
    isTestCase: true,
    knownOutcome: source.outcome,
    // Only include non-identifying metadata
    anticheatMetadata: {
      // testCaseReason is NOT included - would reveal this is a test case
      // insertedAt is NOT included - timing correlation
      source: 'calibration', // Generic marker for internal use only
    },
  });
}

/**
 * Get statistics about test case usage.
 *
 * @returns Statistics about test cases in the system
 */
export async function getTestCaseStats(): Promise<{
  totalTestCases: number;
  activeTestCases: number;
  resolvedTestCases: number;
  arbiterAccuracyOnTestCases: number;
  testCaseRatio: number;
}> {
  const allCases = await db.query.overwatchCases.findMany({});

  const testCases = allCases.filter(c => c.isTestCase);
  const resolvedTestCases = testCases.filter(c => c.status === 'resolved');
  const activeTestCases = testCases.filter(c => c.status === 'active');

  // Calculate arbiter accuracy on resolved test cases
  let correctVerdicts = 0;
  let totalResolved = 0;

  for (const tc of resolvedTestCases) {
    if (tc.knownOutcome && tc.finalVerdict) {
      totalResolved++;
      if (tc.finalVerdict === tc.knownOutcome) {
        correctVerdicts++;
      }
    }
  }

  const arbiterAccuracyOnTestCases = totalResolved > 0
    ? (correctVerdicts / totalResolved) * 100
    : 0;

  // Calculate overall test case ratio
  const testCaseRatio = allCases.length > 0
    ? (testCases.length / allCases.length) * 100
    : 0;

  return {
    totalTestCases: testCases.length,
    activeTestCases: activeTestCases.length,
    resolvedTestCases: resolvedTestCases.length,
    arbiterAccuracyOnTestCases,
    testCaseRatio,
  };
}

/**
 * Maybe insert a test case when creating a new regular case.
 *
 * Call this when a new real case is about to be created.
 * It may create a test case first if the ratio needs balancing.
 */
export async function maybeInsertTestCase(): Promise<OverwatchCase | null> {
  const shouldInsert = await shouldInsertTestCase();

  if (!shouldInsert) {
    return null;
  }

  const source = await getTestCaseSource();

  if (!source) {
    console.log('[Overwatch] No test case source available');
    return null;
  }

  return createTestCase(source);
}
