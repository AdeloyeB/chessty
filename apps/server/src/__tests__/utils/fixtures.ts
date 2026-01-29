/**
 * Shared test fixtures for all tests
 */
import { nanoid } from 'nanoid';

export const TEST_USER = {
  id: 'test-user-1',
  username: 'testplayer',
  email: 'test@example.com',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  balance: '1000',
  elo: 1200,
  rank: 'intermediate',
  gamesPlayed: 0,
  gamesWon: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const TEST_GAME = {
  id: 'test-game-1',
  whitePlayerId: 'test-user-1',
  blackPlayerId: 'test-user-2',
  status: 'active' as const,
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn: '',
  moves: [],
  wagerAmount: '10',
  whiteTimeRemaining: 300,
  blackTimeRemaining: 300,
  increment: 5,
  result: null,
  winnerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const TEST_CHALLENGE = {
  id: 'test-challenge-1',
  creatorId: 'test-user-1',
  acceptedById: null,
  status: 'open' as const,
  wagerAmount: '10',
  timeControl: 300,
  increment: 5,
  creatorConfirmed: false,
  acceptorConfirmed: false,
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function createTestUser(overrides?: Partial<typeof TEST_USER>) {
  return {
    ...TEST_USER,
    id: `test-user-${nanoid(8)}`,
    email: `test-${nanoid(8)}@example.com`,
    username: `player_${nanoid(8)}`,
    ...overrides
  };
}

export function createTestGame(overrides?: Partial<typeof TEST_GAME>) {
  return {
    ...TEST_GAME,
    id: `test-game-${nanoid(8)}`,
    ...overrides
  };
}

export function createTestChallenge(overrides?: Partial<typeof TEST_CHALLENGE>) {
  return {
    ...TEST_CHALLENGE,
    id: `test-challenge-${nanoid(8)}`,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Settlement Fixtures
// ---------------------------------------------------------------------------

export const TEST_SETTLEMENT = {
  id: 'test-settlement-1',
  gameId: 'test-game-1',
  winnerId: 'test-user-1',
  loserId: 'test-user-2',
  totalPot: '100',
  platformFee: '0',
  winnerPayout: '100',
  status: 'pending' as const,
  suspicionScore: null,
  flaggedPlayerId: null,
  juryCaseId: null,
  settledAt: null,
  settledBy: null,
  escrowTxHash: null,
  settlementTxHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function createTestSettlement(overrides?: Partial<typeof TEST_SETTLEMENT>) {
  return {
    ...TEST_SETTLEMENT,
    id: `test-settlement-${nanoid(8)}`,
    gameId: `test-game-${nanoid(8)}`,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Jury Fixtures
// ---------------------------------------------------------------------------

export const TEST_JURY_CASE = {
  id: 'test-jury-case-1',
  gameId: 'test-game-1',
  suspectPlayerId: 'test-user-1',
  suspicionScore: '0.95',
  priority: 'high' as const,
  status: 'active' as const,
  isTestCase: false,
  knownOutcome: null,
  finalVerdict: null,
  guiltyPercentage: null,
  verdictNotes: null,
  deadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function createTestJuryCase(overrides?: Partial<typeof TEST_JURY_CASE>) {
  return {
    ...TEST_JURY_CASE,
    id: `test-jury-case-${nanoid(8)}`,
    gameId: `test-game-${nanoid(8)}`,
    ...overrides
  };
}

export const TEST_JURY_VERDICT = {
  id: 'test-verdict-1',
  caseId: 'test-jury-case-1',
  investigatorId: 'test-investigator-1',
  engineAssistance: 'innocent' as const,
  inputAutomation: 'innocent' as const,
  externalAssistance: 'innocent' as const,
  notes: null,
  confidence: 3,
  createdAt: new Date(),
};

export function createTestVerdict(overrides?: Partial<typeof TEST_JURY_VERDICT>) {
  return {
    ...TEST_JURY_VERDICT,
    id: `test-verdict-${nanoid(8)}`,
    ...overrides
  };
}

export const TEST_INVESTIGATOR = {
  id: 'test-investigator-1',
  userId: 'test-user-1',
  accuracyScore: '0.500',
  casesReviewed: 0,
  isActive: true,
  sanctionedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function createTestInvestigator(overrides?: Partial<typeof TEST_INVESTIGATOR>) {
  return {
    ...TEST_INVESTIGATOR,
    id: `test-investigator-${nanoid(8)}`,
    userId: `test-user-${nanoid(8)}`,
    ...overrides
  };
}

export const TEST_CASE_ASSIGNMENT = {
  id: 'test-assignment-1',
  caseId: 'test-jury-case-1',
  investigatorId: 'test-investigator-1',
  status: 'pending' as const,
  scoreAtAssignment: '0.500',
  assignedAt: new Date(),
  completedAt: null,
};

export function createTestCaseAssignment(overrides?: Partial<typeof TEST_CASE_ASSIGNMENT>) {
  return {
    ...TEST_CASE_ASSIGNMENT,
    id: `test-assignment-${nanoid(8)}`,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Anti-Cheat Fixtures
// ---------------------------------------------------------------------------

export const TEST_MOVE_ANALYSIS = {
  moveNumber: 1,
  move: 'e2e4',
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  engineEval: 0.2,
  playerEval: 0.2,
  centipawnLoss: 0,
  moveTime: 5000, // 5 seconds
  engineRank: 1, // Top engine move
  isTopMove: true,
  phase: 'opening' as const,
};

export function createTestMoveAnalysis(overrides?: Partial<typeof TEST_MOVE_ANALYSIS>) {
  return {
    ...TEST_MOVE_ANALYSIS,
    moveNumber: overrides?.moveNumber ?? TEST_MOVE_ANALYSIS.moveNumber,
    ...overrides
  };
}

export const TEST_SUSPICION_FLAGS = {
  engineCorrelation: {
    type: 'engine_correlation' as const,
    severity: 'medium' as const,
    description: 'High engine correlation detected',
    moveNumbers: [15, 18, 22],
  },
  timingAnomaly: {
    type: 'timing_anomaly' as const,
    severity: 'low' as const,
    description: 'Consistent timing pattern detected',
    moveNumbers: [10, 11, 12, 13],
  },
  skillShift: {
    type: 'mid_game_skill_shift' as const,
    severity: 'high' as const,
    description: 'Sudden improvement in play quality at move 15',
    moveNumbers: [15],
  },
};

// ---------------------------------------------------------------------------
// Player Sanction Fixtures
// ---------------------------------------------------------------------------

export const TEST_PLAYER_SANCTION = {
  id: 'test-sanction-1',
  playerId: 'test-user-1',
  sanctionType: 'temp_ban' as const,
  reason: 'Found guilty of cheating by community jury',
  endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  reviewTaskId: null,
  appealed: false,
  createdAt: new Date(),
};

export function createTestSanction(overrides?: Partial<typeof TEST_PLAYER_SANCTION>) {
  return {
    ...TEST_PLAYER_SANCTION,
    id: `test-sanction-${nanoid(8)}`,
    ...overrides
  };
}
