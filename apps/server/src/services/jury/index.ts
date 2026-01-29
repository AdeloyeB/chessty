/**
 * Jury System Services
 * =====================
 *
 * This module provides the complete backend implementation for the community
 * review (jury) system, inspired by CS:GO Overwatch.
 *
 * The jury system allows experienced community members to review flagged games
 * and vote on whether cheating occurred. It's a crowdsourced moderation system
 * that scales with the player base.
 *
 * HOW IT WORKS:
 * 1. Games with high suspicion scores (>95%) are automatically flagged
 * 2. A jury case is created and 5-7 eligible jurors are assigned
 * 3. Jurors watch anonymized replays and vote on cheat categories
 * 4. Weighted votes (based on juror accuracy) determine the final verdict
 * 5. Juror scores are updated based on agreement with the majority
 *
 * MODULES:
 * - eligibility: Check/enroll users as jurors
 * - case-assignment: Create cases and assign jurors
 * - verdict-aggregation: Submit verdicts and calculate final outcomes
 * - scoring: Update juror accuracy scores
 * - test-cases: Calibration cases to measure juror accuracy
 */

// Re-export all jury services
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

export const juryService = {
  // Eligibility
  checkEligibility: eligibility.checkEligibility,
  enrollAsJuror: eligibility.enrollAsJuror,
  getJurorProfile: eligibility.getJurorProfile,
  canReceiveAssignments: eligibility.canReceiveAssignments,
  suspendJuror: eligibility.suspendJuror,
  reactivateJuror: eligibility.reactivateJuror,

  // Case Assignment
  createCase: caseAssignment.createCase,
  assignJurorsToCase: caseAssignment.assignJurorsToCase,
  getJurorCases: caseAssignment.getJurorCases,
  getCaseForReview: caseAssignment.getCaseForReview,
  getCaseAssignments: caseAssignment.getCaseAssignments,
  recuseFromCase: caseAssignment.recuseFromCase,
  expirePendingAssignments: caseAssignment.expirePendingAssignments,

  // Verdict Aggregation
  submitVerdict: verdictAggregation.submitVerdict,
  aggregateVerdicts: verdictAggregation.aggregateVerdicts,
  checkAndResolveCases: verdictAggregation.checkAndResolveCases,

  // Scoring
  getJurorStats: scoring.getJurorStats,
  getJurorLeaderboard: scoring.getJurorLeaderboard,
  adjustJurorScore: scoring.adjustJurorScore,

  // Test Cases
  shouldInsertTestCase: testCases.shouldInsertTestCase,
  createTestCase: testCases.createTestCase,
  getTestCaseStats: testCases.getTestCaseStats,
  maybeInsertTestCase: testCases.maybeInsertTestCase,

  // Constants
  JURY_MIN_ELO: eligibility.JURY_MIN_ELO,
  JURY_MIN_GAMES: eligibility.JURY_MIN_GAMES,
  MIN_JURORS_PER_CASE: caseAssignment.MIN_JURORS_PER_CASE,
  MAX_JURORS_PER_CASE: caseAssignment.MAX_JURORS_PER_CASE,
  GUILTY_THRESHOLD: verdictAggregation.GUILTY_THRESHOLD,
  CASE_DEADLINE_HOURS: caseAssignment.CASE_DEADLINE_HOURS,
};
