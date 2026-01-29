/**
 * Arbiter Overwatch Services
 * ===========================
 *
 * This module provides the complete backend implementation for the Arbiter
 * Overwatch system, inspired by CS:GO Overwatch.
 *
 * The Arbiter Overwatch system allows experienced community members (arbiters)
 * to review flagged games and vote on whether cheating occurred. It's a
 * crowdsourced moderation system that scales with the player base.
 *
 * HOW IT WORKS:
 * 1. Games with high suspicion scores (>95%) are automatically flagged
 * 2. An overwatch case is created and 5-7 eligible arbiters are assigned
 * 3. Arbiters watch anonymized replays and vote on cheat categories
 * 4. Weighted votes (based on arbiter accuracy) determine the final verdict
 * 5. Arbiter scores are updated based on agreement with the majority
 *
 * MODULES:
 * - eligibility: Check/enroll users as arbiters
 * - case-assignment: Create cases and assign arbiters
 * - verdict-aggregation: Submit verdicts and calculate final outcomes
 * - scoring: Update arbiter accuracy scores
 * - test-cases: Calibration cases to measure arbiter accuracy
 */

// Re-export all overwatch services
export * from './eligibility';
export * from './case-assignment';
export * from './verdict-aggregation';
export * from './scoring';
export * from './test-cases';

// Export a unified namespace for convenience
import * as eligibility from './eligibility';
import * as caseAssignment from './case-assignment';
import * as verdictAggregation from './verdict-aggregation';
import * as scoring from './scoring';
import * as testCases from './test-cases';

export const overwatchService = {
  // Eligibility
  checkEligibility: eligibility.checkEligibility,
  enrollAsArbiter: eligibility.enrollAsArbiter,
  getArbiterProfile: eligibility.getArbiterProfile,
  canReceiveAssignments: eligibility.canReceiveAssignments,
  suspendArbiter: eligibility.suspendArbiter,
  reactivateArbiter: eligibility.reactivateArbiter,

  // Case Assignment
  createCase: caseAssignment.createCase,
  assignArbitersToCase: caseAssignment.assignArbitersToCase,
  getArbiterCases: caseAssignment.getArbiterCases,
  getCaseForReview: caseAssignment.getCaseForReview,
  getCaseAssignments: caseAssignment.getCaseAssignments,
  recuseFromCase: caseAssignment.recuseFromCase,
  expirePendingAssignments: caseAssignment.expirePendingAssignments,

  // Verdict Aggregation
  submitVerdict: verdictAggregation.submitVerdict,
  aggregateVerdicts: verdictAggregation.aggregateVerdicts,
  checkAndResolveCases: verdictAggregation.checkAndResolveCases,

  // Scoring
  getArbiterStats: scoring.getArbiterStats,
  getArbiterLeaderboard: scoring.getArbiterLeaderboard,
  adjustArbiterScore: scoring.adjustArbiterScore,

  // Test Cases
  shouldInsertTestCase: testCases.shouldInsertTestCase,
  createTestCase: testCases.createTestCase,
  getTestCaseStats: testCases.getTestCaseStats,
  maybeInsertTestCase: testCases.maybeInsertTestCase,

  // Constants
  OVERWATCH_MIN_ELO: eligibility.OVERWATCH_MIN_ELO,
  OVERWATCH_MIN_GAMES: eligibility.OVERWATCH_MIN_GAMES,
  MIN_ARBITERS_PER_CASE: caseAssignment.MIN_ARBITERS_PER_CASE,
  MAX_ARBITERS_PER_CASE: caseAssignment.MAX_ARBITERS_PER_CASE,
  GUILTY_THRESHOLD: verdictAggregation.GUILTY_THRESHOLD,
  CASE_DEADLINE_HOURS: caseAssignment.CASE_DEADLINE_HOURS,
};
