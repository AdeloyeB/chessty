/**
 * Jury Eligibility Service Tests
 * ===============================
 *
 * Tests for determining whether users are eligible to serve as jurors
 * in the community review system.
 *
 * ELIGIBILITY REQUIREMENTS:
 * 1. ELO Rating >= 1400 (demonstrates chess competence)
 * 2. Games Played >= 100 (platform experience)
 * 3. Good Standing (no active sanctions, 1-year cooldown after bans)
 *
 * WHY THESE REQUIREMENTS:
 * - ELO 1400+: Jurors need to understand good vs. suspicious play
 * - 100+ games: Ensures familiarity with platform norms
 * - Good standing: Prevents bad actors from influencing verdicts
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import {
  createTestUser,
  createTestInvestigator,
  createTestSanction,
  createTestCaseAssignment,
} from '../../__tests__/utils/fixtures';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

// Store mock data that tests can modify
let mockUsers: Map<string, ReturnType<typeof createTestUser>>;
let mockInvestigators: Map<string, ReturnType<typeof createTestInvestigator>>;
let mockSanctions: Map<string, ReturnType<typeof createTestSanction>[]>;
let mockAssignments: Map<string, ReturnType<typeof createTestCaseAssignment>[]>;

// Track operations
let insertedInvestigators: ReturnType<typeof createTestInvestigator>[] = [];
let updatedInvestigators: { userId: string; changes: Record<string, unknown> }[] = [];

// Create comprehensive database mock
const createMockDb = () => ({
  query: {
    users: {
      findFirst: async ({ where: _where }: { where?: unknown } = {}) => {
        // Return user if found
        for (const [userId, user] of mockUsers) {
          // In a real scenario, we'd parse the where clause
          // For tests, we return the first user or search by ID
          return user;
        }
        return undefined;
      },
    },
    juryInvestigators: {
      findFirst: async ({ where: _where }: { where?: unknown } = {}) => {
        for (const [userId, investigator] of mockInvestigators) {
          return investigator;
        }
        return undefined;
      },
      findMany: async ({ where: _where }: { where?: unknown } = {}) => {
        return Array.from(mockInvestigators.values());
      },
    },
    playerSanctions: {
      findFirst: async ({ where: _where }: { where?: unknown } = {}) => {
        // Return first blocking sanction
        for (const [_, sanctions] of mockSanctions) {
          for (const sanction of sanctions) {
            // Check if this sanction blocks eligibility
            // In production, this uses SQL conditions for dates
            return sanction;
          }
        }
        return undefined;
      },
      findMany: async ({ where: _where }: { where?: unknown } = {}) => {
        const allSanctions: ReturnType<typeof createTestSanction>[] = [];
        for (const [_, sanctions] of mockSanctions) {
          allSanctions.push(...sanctions);
        }
        return allSanctions;
      },
    },
    juryCaseAssignments: {
      findMany: async ({ where: _where }: { where?: unknown } = {}) => {
        const allAssignments: ReturnType<typeof createTestCaseAssignment>[] = [];
        for (const [_, assignments] of mockAssignments) {
          allAssignments.push(...assignments);
        }
        return allAssignments;
      },
    },
  },
  insert: (_table: unknown) => ({
    values: (data: unknown) => ({
      returning: async () => {
        const investigator = data as ReturnType<typeof createTestInvestigator>;
        insertedInvestigators.push(investigator);
        return [{ ...investigator, id: `investigator-${Date.now()}` }];
      },
    }),
  }),
  update: (_table: unknown) => ({
    set: (changes: Record<string, unknown>) => ({
      where: (_condition: unknown) => {
        updatedInvestigators.push({ userId: 'mock-user', changes });
        return Promise.resolve();
      },
    }),
  }),
});

// Mock the drizzle module
mock.module('../../drizzle', () => ({
  db: createMockDb(),
  users: { id: 'users' },
  juryInvestigators: {
    id: 'juryInvestigators',
    userId: 'userId',
    isActive: 'isActive',
    suspendedUntil: 'suspendedUntil',
    investigatorScore: 'investigatorScore',
    casesReviewed: 'casesReviewed',
    accurateVerdicts: 'accurateVerdicts',
  },
  playerSanctions: {
    id: 'playerSanctions',
    playerId: 'playerId',
    appealed: 'appealed',
    appealOutcome: 'appealOutcome',
    endsAt: 'endsAt',
  },
  juryCaseAssignments: {
    id: 'juryCaseAssignments',
    investigatorId: 'investigatorId',
    status: 'status',
  },
}));

// Import constants after mocking
import {
  JURY_MIN_ELO,
  JURY_MIN_GAMES,
  JURY_SUSPENSION_THRESHOLD,
  MAX_PENDING_ASSIGNMENTS,
} from './eligibility';

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

function resetMocks() {
  mockUsers = new Map();
  mockInvestigators = new Map();
  mockSanctions = new Map();
  mockAssignments = new Map();
  insertedInvestigators = [];
  updatedInvestigators = [];
}

/**
 * Create a user that meets all eligibility requirements.
 * Note: The fixture uses 'elo' but the schema uses 'eloRating'.
 * We need to return data in the format the actual code expects.
 */
function createEligibleUser(overrides?: Partial<ReturnType<typeof createTestUser>>) {
  const user = createTestUser({
    elo: JURY_MIN_ELO + 100, // 1500
    gamesPlayed: JURY_MIN_GAMES + 50, // 150
    ...overrides,
  });
  // Add eloRating alias for actual schema compatibility
  return { ...user, eloRating: user.elo };
}

/**
 * Create a user that does NOT meet ELO requirements.
 */
function createLowEloUser(overrides?: Partial<ReturnType<typeof createTestUser>>) {
  const user = createTestUser({
    elo: JURY_MIN_ELO - 100, // 1300
    gamesPlayed: JURY_MIN_GAMES + 50, // 150
    ...overrides,
  });
  return { ...user, eloRating: user.elo };
}

/**
 * Create a user that does NOT meet games played requirements.
 */
function createLowGamesUser(overrides?: Partial<ReturnType<typeof createTestUser>>) {
  const user = createTestUser({
    elo: JURY_MIN_ELO + 100, // 1500
    gamesPlayed: JURY_MIN_GAMES - 50, // 50
    ...overrides,
  });
  return { ...user, eloRating: user.elo };
}

// ---------------------------------------------------------------------------
// Tests: checkEligibility()
// ---------------------------------------------------------------------------

describe('checkEligibility()', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should return eligible=true for qualifying users', async () => {
    // A user meeting all requirements should be eligible

    const userId = 'eligible-user';
    const user = createEligibleUser({ id: userId });
    mockUsers.set(userId, user);

    // Create a mock db that returns this specific user
    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined, // Not enrolled yet
          },
          playerSanctions: {
            findFirst: async () => undefined, // No sanctions
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.eligible).toBe(true);
    expect(result.enrolled).toBe(false);
    expect(result.reasons).toBeUndefined();
    expect(result.stats.meetsEloRequirement).toBe(true);
    expect(result.stats.meetsGamesRequirement).toBe(true);
    expect(result.stats.hasGoodStanding).toBe(true);
  });

  test('should return eligible=false if user has active sanctions', async () => {
    // Users with active bans cannot serve as jurors

    const userId = 'sanctioned-user';
    const user = createEligibleUser({ id: userId });

    // Active sanction (ends in the future)
    const activeSanction = createTestSanction({
      playerId: userId,
      sanctionType: 'temp_ban',
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      appealed: false,
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => activeSanction, // Has active sanction
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.eligible).toBe(false);
    expect(result.stats.hasGoodStanding).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons?.some(r => r.includes('sanction'))).toBe(true);
  });

  test('should return eligible=false if insufficient games played', async () => {
    // Users need 100+ games to understand platform norms

    const userId = 'newbie-user';
    const user = createLowGamesUser({ id: userId });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.eligible).toBe(false);
    expect(result.stats.meetsGamesRequirement).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons?.some(r => r.includes('games'))).toBe(true);
  });

  test('should return eligible=false if ELO rating too low', async () => {
    // Users need 1400+ ELO to identify suspicious play

    const userId = 'low-elo-user';
    const user = createLowEloUser({ id: userId });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.eligible).toBe(false);
    expect(result.stats.meetsEloRequirement).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons?.some(r => r.includes('ELO'))).toBe(true);
  });

  test('should handle edge case of exactly meeting requirements', async () => {
    // Users at exactly the threshold should be eligible

    const userId = 'edge-case-user';
    const baseUser = createTestUser({
      id: userId,
      elo: JURY_MIN_ELO, // Exactly 1400
      gamesPlayed: JURY_MIN_GAMES, // Exactly 100
    });
    const user = { ...baseUser, eloRating: baseUser.elo };

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.eligible).toBe(true);
    expect(result.stats.meetsEloRequirement).toBe(true);
    expect(result.stats.meetsGamesRequirement).toBe(true);
  });

  test('should return user not found when user does not exist', async () => {
    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => undefined, // User not found
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility('nonexistent-user');

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('User not found');
  });

  test('should check if user is already enrolled as juror', async () => {
    const userId = 'enrolled-juror';
    const user = createEligibleUser({ id: userId });
    const investigator = createTestInvestigator({
      userId,
      isActive: true,
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => investigator, // Already enrolled
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.enrolled).toBe(true);
    expect(result.active).toBe(true);
  });

  test('should detect suspended juror status', async () => {
    const userId = 'suspended-juror';
    const user = createEligibleUser({ id: userId });
    const investigator = createTestInvestigator({
      userId,
      isActive: false, // Suspended
      sanctionedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }),
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { checkEligibility } = await import('./eligibility');
    const result = await checkEligibility(userId);

    expect(result.enrolled).toBe(true);
    expect(result.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: canReceiveAssignments()
// ---------------------------------------------------------------------------

describe('canReceiveAssignments()', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should return true for active juror with capacity', async () => {
    const userId = 'available-juror';
    const investigator = createTestInvestigator({
      userId,
      isActive: true,
      accuracyScore: '0.600', // Above suspension threshold
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              investigatorScore: '0.600',
              suspendedUntil: null,
            }),
          },
          juryCaseAssignments: {
            findMany: async () => [], // No pending assignments
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
        isActive: 'isActive',
        suspendedUntil: 'suspendedUntil',
      },
      juryCaseAssignments: {
        investigatorId: 'investigatorId',
        status: 'status',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments(userId);

    expect(result).toBe(true);
  });

  test('should return false if not enrolled as juror', async () => {
    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => undefined, // Not enrolled
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments('unenrolled-user');

    expect(result).toBe(false);
  });

  test('should return false if juror is inactive', async () => {
    const userId = 'inactive-juror';
    const investigator = createTestInvestigator({
      userId,
      isActive: false, // Inactive
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              investigatorScore: '0.600',
              suspendedUntil: null,
            }),
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
        isActive: 'isActive',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments(userId);

    expect(result).toBe(false);
  });

  test('should return false if juror is suspended', async () => {
    const userId = 'suspended-juror';
    const investigator = createTestInvestigator({
      userId,
      isActive: true,
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              investigatorScore: '0.600',
              suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Future
            }),
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
        isActive: 'isActive',
        suspendedUntil: 'suspendedUntil',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments(userId);

    expect(result).toBe(false);
  });

  test('should return false if score below suspension threshold', async () => {
    const userId = 'low-score-juror';
    const investigator = createTestInvestigator({
      userId,
      isActive: true,
      accuracyScore: '0.200', // Below JURY_SUSPENSION_THRESHOLD (0.250)
    });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              investigatorScore: '0.200', // Below threshold
              suspendedUntil: null,
            }),
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
        isActive: 'isActive',
        suspendedUntil: 'suspendedUntil',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments(userId);

    expect(result).toBe(false);
  });

  test('should return false if at max pending assignments', async () => {
    const userId = 'busy-juror';
    const investigator = createTestInvestigator({
      userId,
      isActive: true,
    });

    // Create MAX_PENDING_ASSIGNMENTS pending assignments
    const pendingAssignments = [];
    for (let i = 0; i < MAX_PENDING_ASSIGNMENTS; i++) {
      pendingAssignments.push(createTestCaseAssignment({
        investigatorId: userId,
        status: 'pending',
      }));
    }

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          juryInvestigators: {
            findFirst: async () => ({
              ...investigator,
              investigatorScore: '0.600',
              suspendedUntil: null,
            }),
          },
          juryCaseAssignments: {
            findMany: async () => pendingAssignments, // At capacity
          },
        },
      },
      juryInvestigators: {
        userId: 'userId',
        isActive: 'isActive',
        suspendedUntil: 'suspendedUntil',
      },
      juryCaseAssignments: {
        investigatorId: 'investigatorId',
        status: 'status',
      },
    }));

    const { canReceiveAssignments } = await import('./eligibility');
    const result = await canReceiveAssignments(userId);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: enrollAsJuror()
// ---------------------------------------------------------------------------

describe('enrollAsJuror()', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should enroll eligible user as juror', async () => {
    const userId = 'new-juror';
    const user = createEligibleUser({ id: userId });

    let wasInserted = false;

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined, // Not enrolled yet
          },
          playerSanctions: {
            findFirst: async () => undefined, // No sanctions
          },
        },
        insert: () => ({
          values: (data: unknown) => ({
            returning: async () => {
              wasInserted = true;
              return [{ ...data, id: 'new-investigator-id' }];
            },
          }),
        }),
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { enrollAsJuror } = await import('./eligibility');
    const result = await enrollAsJuror(userId);

    expect(result.success).toBe(true);
    expect(result.juror).toBeDefined();
    expect(wasInserted).toBe(true);
  });

  test('should return success if user already enrolled', async () => {
    const userId = 'existing-juror';
    const user = createEligibleUser({ id: userId });
    const existingInvestigator = createTestInvestigator({ userId });

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => existingInvestigator, // Already enrolled
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { enrollAsJuror } = await import('./eligibility');
    const result = await enrollAsJuror(userId);

    expect(result.success).toBe(true);
    expect(result.juror).toBeDefined();
  });

  test('should fail enrollment if user not eligible', async () => {
    const userId = 'ineligible-user';
    const user = createLowEloUser({ id: userId }); // Doesn't meet ELO requirement

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { enrollAsJuror } = await import('./eligibility');
    const result = await enrollAsJuror(userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not eligible');
    expect(result.error).toContain('ELO');
  });

  test('should record ELO and games at enrollment time', async () => {
    const userId = 'tracked-juror';
    const baseUser = createTestUser({
      id: userId,
      elo: 1650, // Specific ELO
      gamesPlayed: 250, // Specific games count
    });
    const user = { ...baseUser, eloRating: baseUser.elo };

    let capturedData: Record<string, unknown> | null = null;

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
        insert: () => ({
          values: (data: unknown) => ({
            returning: async () => {
              capturedData = data as Record<string, unknown>;
              return [{ ...data, id: 'investigator-id' }];
            },
          }),
        }),
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { enrollAsJuror } = await import('./eligibility');
    await enrollAsJuror(userId);

    expect(capturedData).toBeDefined();
    expect(capturedData?.eloAtQualification).toBe(1650);
    expect(capturedData?.gamesAtQualification).toBe(250);
  });

  test('should start new jurors with neutral score (0.500)', async () => {
    const userId = 'new-juror';
    const user = createEligibleUser({ id: userId });

    let capturedData: Record<string, unknown> | null = null;

    mock.module('../../drizzle', () => ({
      db: {
        query: {
          users: {
            findFirst: async () => user,
          },
          juryInvestigators: {
            findFirst: async () => undefined,
          },
          playerSanctions: {
            findFirst: async () => undefined,
          },
        },
        insert: () => ({
          values: (data: unknown) => ({
            returning: async () => {
              capturedData = data as Record<string, unknown>;
              return [{ ...data, id: 'investigator-id' }];
            },
          }),
        }),
      },
      users: { id: 'users' },
      juryInvestigators: { userId: 'userId' },
      playerSanctions: {
        playerId: 'playerId',
        appealed: 'appealed',
        appealOutcome: 'appealOutcome',
        endsAt: 'endsAt',
      },
    }));

    const { enrollAsJuror } = await import('./eligibility');
    await enrollAsJuror(userId);

    expect(capturedData?.investigatorScore).toBe('0.500');
  });
});

// ---------------------------------------------------------------------------
// Tests: suspendJuror()
// ---------------------------------------------------------------------------

describe('suspendJuror()', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should set suspension date and reason', async () => {
    const userId = 'suspended-juror';
    let capturedChanges: Record<string, unknown> | null = null;

    mock.module('../../drizzle', () => ({
      db: {
        update: () => ({
          set: (changes: Record<string, unknown>) => ({
            where: () => {
              capturedChanges = changes;
              return Promise.resolve();
            },
          }),
        }),
      },
      juryInvestigators: { userId: 'userId' },
    }));

    const { suspendJuror } = await import('./eligibility');
    await suspendJuror(userId, 'Low accuracy score', 30);

    expect(capturedChanges).toBeDefined();
    expect(capturedChanges?.isActive).toBe(false);
    expect(capturedChanges?.suspensionReason).toBe('Low accuracy score');
    expect(capturedChanges?.suspendedUntil).toBeDefined();
  });

  test('should use default suspension duration when not specified', async () => {
    const userId = 'suspended-juror';
    let capturedChanges: Record<string, unknown> | null = null;

    mock.module('../../drizzle', () => ({
      db: {
        update: () => ({
          set: (changes: Record<string, unknown>) => ({
            where: () => {
              capturedChanges = changes;
              return Promise.resolve();
            },
          }),
        }),
      },
      juryInvestigators: { userId: 'userId' },
    }));

    const { suspendJuror, JURY_SUSPENSION_DAYS } = await import('./eligibility');
    const beforeSuspension = new Date();
    await suspendJuror(userId, 'Poor performance');
    const afterSuspension = new Date();

    expect(capturedChanges?.suspendedUntil).toBeDefined();
    const suspendedUntil = capturedChanges?.suspendedUntil as Date;

    // Should be approximately JURY_SUSPENSION_DAYS (30) from now
    const expectedMin = new Date(beforeSuspension);
    expectedMin.setDate(expectedMin.getDate() + JURY_SUSPENSION_DAYS - 1);
    const expectedMax = new Date(afterSuspension);
    expectedMax.setDate(expectedMax.getDate() + JURY_SUSPENSION_DAYS + 1);

    expect(suspendedUntil.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(suspendedUntil.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });
});

// ---------------------------------------------------------------------------
// Tests: reactivateJuror()
// ---------------------------------------------------------------------------

describe('reactivateJuror()', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should clear suspension and reactivate juror', async () => {
    const userId = 'reactivated-juror';
    let capturedChanges: Record<string, unknown> | null = null;

    mock.module('../../drizzle', () => ({
      db: {
        update: () => ({
          set: (changes: Record<string, unknown>) => ({
            where: () => {
              capturedChanges = changes;
              return Promise.resolve();
            },
          }),
        }),
      },
      juryInvestigators: { userId: 'userId' },
    }));

    const { reactivateJuror } = await import('./eligibility');
    await reactivateJuror(userId);

    expect(capturedChanges).toBeDefined();
    expect(capturedChanges?.isActive).toBe(true);
    expect(capturedChanges?.suspendedUntil).toBeNull();
    expect(capturedChanges?.suspensionReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constant Tests
// ---------------------------------------------------------------------------

describe('Constants', () => {
  test('JURY_MIN_ELO should be 1400', () => {
    expect(JURY_MIN_ELO).toBe(1400);
  });

  test('JURY_MIN_GAMES should be 100', () => {
    expect(JURY_MIN_GAMES).toBe(100);
  });

  test('JURY_SUSPENSION_THRESHOLD should be 0.250', () => {
    expect(JURY_SUSPENSION_THRESHOLD).toBe(0.250);
  });

  test('MAX_PENDING_ASSIGNMENTS should be 5', () => {
    expect(MAX_PENDING_ASSIGNMENTS).toBe(5);
  });
});
