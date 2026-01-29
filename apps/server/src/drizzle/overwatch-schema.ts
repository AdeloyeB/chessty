/**
 * Arbiter Overwatch Database Schema
 *
 * This file defines all database tables for the Arbiter Overwatch system.
 * Inspired by CS:GO Overwatch, this allows experienced community members (arbiters)
 * to review flagged games and vote on whether cheating occurred.
 *
 * Tables:
 * - overwatchArbiters: Tracks eligible arbiters, their score, and review stats
 * - overwatchCases: Flagged games pending community review
 * - overwatchVerdicts: Individual arbiter votes per case
 * - overwatchCaseAssignments: Which arbiters are assigned to which cases
 *
 * HOW IT WORKS:
 * 1. Games with high suspicion scores (>95%) get flagged
 * 2. An overwatch case is created and 5-7 eligible arbiters are assigned
 * 3. Arbiters watch anonymized replays and vote on different cheat categories
 * 4. Weighted votes (based on arbiter accuracy scores) determine final verdict
 * 5. Arbiter scores are updated based on whether they agreed with the majority
 *
 * WHY THIS MATTERS:
 * - Reduces false positives from automated detection
 * - Scales moderation through community participation
 * - Creates accountability with arbiter accuracy tracking
 * - Calibration cases ensure arbiters stay honest
 */

import { pgTable, text, integer, numeric, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users, games } from './pg-schema';

// ============================================================================
// OVERWATCH ARBITERS TABLE
// ============================================================================
// Tracks users who are eligible to serve as arbiters and their performance stats.
// Think of this as an "arbiter profile" that determines if someone can review cases.
export const overwatchArbiters = pgTable('overwatch_arbiters', {
  // The user ID serves as the primary key (one arbiter profile per user)
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),

  // Snapshot of the player's ELO when they became eligible to be an arbiter
  // We store this to prevent manipulation (e.g., boosting ELO to become arbiter then tanking)
  eloAtQualification: integer('elo_at_qualification').notNull(),

  // How many games the user had played when they qualified
  gamesAtQualification: integer('games_at_qualification').notNull(),

  // ---------------------------------------------------------------------------
  // Investigator Score (0.000 to 1.000)
  // ---------------------------------------------------------------------------
  // This score represents how accurate the arbiter's verdicts are compared to the
  // consensus. New arbiters start at 0.500 (neutral). The score goes up when they
  // agree with the majority verdict and down when they disagree.
  //
  // Why this matters:
  // - High-score arbiters have more weight in the final verdict
  // - Low-score arbiters (<0.250) get suspended
  // - Creates incentive for careful, accurate reviewing
  investigatorScore: numeric('investigator_score', { precision: 4, scale: 3 }).notNull().default('0.500'),

  // Total number of cases this arbiter has reviewed (verdicts submitted)
  casesReviewed: integer('cases_reviewed').notNull().default(0),

  // How many of those verdicts agreed with the final majority verdict
  accurateVerdicts: integer('accurate_verdicts').notNull().default(0),

  // Whether this arbiter is currently active and can receive new case assignments
  isActive: boolean('is_active').notNull().default(true),

  // If suspended, when the suspension ends (null = not suspended or permanent)
  // Arbiters are suspended when their score drops too low (<0.250)
  suspendedUntil: timestamp('suspended_until', { withTimezone: true }),

  // Optional reason for suspension
  suspensionReason: text('suspension_reason'),

  // When this arbiter profile was created
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When this arbiter profile was last updated
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// OVERWATCH CASES TABLE
// ============================================================================
// Games that have been flagged for community review.
// Each case represents one game that needs arbiter investigation.
export const overwatchCases = pgTable('overwatch_cases', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game being reviewed
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // The player whose behavior is being reviewed
  // A single game could theoretically have two cases (one per player)
  suspectPlayerId: text('suspect_player_id').notNull().references(() => users.id),

  // ---------------------------------------------------------------------------
  // Suspicion Score (0.0000 to 1.0000)
  // ---------------------------------------------------------------------------
  // The automated anti-cheat system's confidence that this player was cheating.
  // Higher = more suspicious. Cases are only created when score > 0.95 (95%).
  suspicionScore: numeric('suspicion_score', { precision: 5, scale: 4 }).notNull(),

  // ---------------------------------------------------------------------------
  // Priority Level
  // ---------------------------------------------------------------------------
  // Determines how urgently this case should be reviewed:
  // - 'normal': Standard review, 48-hour deadline
  // - 'high': High-stakes game or repeat offender, prioritized
  // - 'urgent': Very high confidence or ongoing tournament, reviewed first
  priority: text('priority').notNull().default('normal'),

  // ---------------------------------------------------------------------------
  // Case Deadline
  // ---------------------------------------------------------------------------
  // When this case must be resolved by (default: 48 hours from creation)
  // If deadline passes without enough verdicts, the case may be auto-dismissed
  // or escalated depending on the evidence strength.
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),

  // ---------------------------------------------------------------------------
  // Case Status
  // ---------------------------------------------------------------------------
  // Tracks the lifecycle of the case:
  // - 'pending_assignment': Just created, waiting to be assigned to arbiters
  // - 'active': Assigned to arbiters, waiting for verdicts
  // - 'pending_resolution': Enough verdicts received, calculating final result
  // - 'resolved': Final verdict reached
  // - 'expired': Deadline passed without resolution (auto-handled)
  status: text('status').notNull().default('pending_assignment'),

  // ---------------------------------------------------------------------------
  // Final Verdict
  // ---------------------------------------------------------------------------
  // The outcome of the case once resolved:
  // - 'innocent': Not enough evidence of cheating
  // - 'guilty': Weighted majority voted guilty
  // - 'inconclusive': Arbiters were split, needs escalation
  // - null: Case not yet resolved
  finalVerdict: text('final_verdict'),

  // Additional notes about the final verdict (why this decision was made)
  verdictNotes: text('verdict_notes'),

  // The weighted guilty percentage at time of resolution (0.0000 to 1.0000)
  // Stored for analytics and appeals
  guiltyPercentage: numeric('guilty_percentage', { precision: 5, scale: 4 }),

  // ---------------------------------------------------------------------------
  // Test Case Fields
  // ---------------------------------------------------------------------------
  // Some cases are "calibration cases" - we already know if the player cheated
  // or not. These are used to test arbiter accuracy without them knowing.
  //
  // 1 in 5 cases is a test case (20%)
  isTestCase: boolean('is_test_case').notNull().default(false),

  // For test cases: what the known correct answer is ('guilty' or 'innocent')
  knownOutcome: text('known_outcome'),

  // Metadata from the anti-cheat system that flagged this game
  // Includes: flag types, scores, move indices, etc.
  anticheatMetadata: jsonb('anticheat_metadata').$type<Record<string, unknown>>(),

  // When this case was created
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When the final verdict was reached
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  // Index for finding cases by game
  index('overwatch_cases_game_idx').on(table.gameId),
  // Index for finding active cases for a suspect
  index('overwatch_cases_suspect_idx').on(table.suspectPlayerId),
  // Index for finding pending cases that need assignment
  index('overwatch_cases_status_idx').on(table.status),
  // Index for finding cases by deadline (to handle expiration)
  index('overwatch_cases_deadline_idx').on(table.deadline),
]);

// ============================================================================
// OVERWATCH VERDICTS TABLE
// ============================================================================
// Individual arbiter votes for each case.
// Each arbiter submits one verdict per case they're assigned to.
export const overwatchVerdicts = pgTable('overwatch_verdicts', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The case this verdict is for
  caseId: text('case_id').notNull().references(() => overwatchCases.id, { onDelete: 'cascade' }),

  // The arbiter who submitted this verdict
  investigatorId: text('investigator_id').notNull().references(() => users.id),

  // ---------------------------------------------------------------------------
  // Cheat Category Verdicts
  // ---------------------------------------------------------------------------
  // Arbiters vote on three specific categories of cheating:
  //
  // 1. ENGINE ASSISTANCE
  //    Using a chess engine (like Stockfish) to suggest moves
  //    Signs: Very high accuracy, unusual move choices, consistent perfect play
  //
  // 2. INPUT AUTOMATION
  //    Using bots or scripts to play moves automatically
  //    Signs: Inhuman mouse patterns, perfect timing, synthetic input physics
  //
  // 3. EXTERNAL ASSISTANCE
  //    Getting help from another person or unauthorized resource
  //    Signs: Alt-tabbing, long pauses followed by perfect moves, communication patterns

  // 'insufficient': Not enough evidence to determine guilt
  // 'guilty': Evidence strongly suggests cheating in this category
  engineAssistance: text('engine_assistance').notNull(),
  inputAutomation: text('input_automation').notNull(),
  externalAssistance: text('external_assistance').notNull(),

  // Optional notes explaining the arbiter's reasoning
  notes: text('notes'),

  // How confident the arbiter is in their verdict (1-5)
  // 1 = very uncertain, 5 = very confident
  confidence: integer('confidence').notNull().default(3),

  // ---------------------------------------------------------------------------
  // Post-Resolution Fields
  // ---------------------------------------------------------------------------
  // These are populated after the case is resolved

  // Whether this verdict agreed with the final majority verdict
  // (true = accurate, false = inaccurate, null = case not yet resolved)
  agreedWithMajority: boolean('agreed_with_majority'),

  // How many points the arbiter's score changed based on this verdict
  // Positive = gained accuracy points, negative = lost points
  scoreDelta: numeric('score_delta', { precision: 4, scale: 3 }),

  // When this verdict was submitted
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Ensure an arbiter can only submit one verdict per case
  unique('overwatch_verdict_unique').on(table.caseId, table.investigatorId),
  // Index for finding all verdicts for a case
  index('overwatch_verdicts_case_idx').on(table.caseId),
  // Index for finding all verdicts by an arbiter
  index('overwatch_verdicts_investigator_idx').on(table.investigatorId),
]);

// ============================================================================
// OVERWATCH CASE ASSIGNMENTS TABLE
// ============================================================================
// Tracks which arbiters are assigned to which cases.
// Each case gets 5-7 arbiters from different ELO ranges.
export const overwatchCaseAssignments = pgTable('overwatch_case_assignments', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The case this assignment is for
  caseId: text('case_id').notNull().references(() => overwatchCases.id, { onDelete: 'cascade' }),

  // The arbiter assigned to this case
  investigatorId: text('investigator_id').notNull().references(() => users.id),

  // ---------------------------------------------------------------------------
  // Assignment Metadata
  // ---------------------------------------------------------------------------

  // The arbiter's ELO at time of assignment
  // We try to assign arbiters from various ELO ranges to get diverse perspectives
  eloAtAssignment: integer('elo_at_assignment').notNull(),

  // The arbiter's investigator score at time of assignment
  // Higher-score arbiters get more weight in the final verdict calculation
  scoreAtAssignment: numeric('score_at_assignment', { precision: 4, scale: 3 }).notNull(),

  // ---------------------------------------------------------------------------
  // Assignment Status
  // ---------------------------------------------------------------------------
  // - 'pending': Assigned but arbiter hasn't started reviewing
  // - 'in_progress': Arbiter has opened the case
  // - 'completed': Arbiter has submitted their verdict
  // - 'expired': Arbiter didn't submit verdict before deadline
  // - 'recused': Arbiter couldn't review (knew the player, etc.)
  status: text('status').notNull().default('pending'),

  // When this assignment was created
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When the arbiter submitted their verdict (if completed)
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  // Ensure an arbiter can only be assigned once per case
  unique('overwatch_assignment_unique').on(table.caseId, table.investigatorId),
  // Index for finding all assignments for a case
  index('overwatch_case_assignments_case_idx').on(table.caseId),
  // Index for finding all assignments for an arbiter (to show them their queue)
  index('overwatch_case_assignments_investigator_idx').on(table.investigatorId),
  // Index for finding pending assignments (work queue)
  index('overwatch_case_assignments_status_idx').on(table.status),
]);

// ============================================================================
// RELATIONS
// ============================================================================

export const overwatchArbitersRelations = relations(overwatchArbiters, ({ one, many }) => ({
  user: one(users, {
    fields: [overwatchArbiters.userId],
    references: [users.id],
  }),
  verdicts: many(overwatchVerdicts),
  assignments: many(overwatchCaseAssignments),
}));

export const overwatchCasesRelations = relations(overwatchCases, ({ one, many }) => ({
  game: one(games, {
    fields: [overwatchCases.gameId],
    references: [games.id],
  }),
  suspectPlayer: one(users, {
    fields: [overwatchCases.suspectPlayerId],
    references: [users.id],
  }),
  verdicts: many(overwatchVerdicts),
  assignments: many(overwatchCaseAssignments),
}));

export const overwatchVerdictsRelations = relations(overwatchVerdicts, ({ one }) => ({
  case: one(overwatchCases, {
    fields: [overwatchVerdicts.caseId],
    references: [overwatchCases.id],
  }),
  investigator: one(users, {
    fields: [overwatchVerdicts.investigatorId],
    references: [users.id],
  }),
}));

export const overwatchCaseAssignmentsRelations = relations(overwatchCaseAssignments, ({ one }) => ({
  case: one(overwatchCases, {
    fields: [overwatchCaseAssignments.caseId],
    references: [overwatchCases.id],
  }),
  investigator: one(users, {
    fields: [overwatchCaseAssignments.investigatorId],
    references: [users.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type OverwatchArbiter = typeof overwatchArbiters.$inferSelect;
export type NewOverwatchArbiter = typeof overwatchArbiters.$inferInsert;

export type OverwatchCase = typeof overwatchCases.$inferSelect;
export type NewOverwatchCase = typeof overwatchCases.$inferInsert;

export type OverwatchVerdict = typeof overwatchVerdicts.$inferSelect;
export type NewOverwatchVerdict = typeof overwatchVerdicts.$inferInsert;

export type OverwatchCaseAssignment = typeof overwatchCaseAssignments.$inferSelect;
export type NewOverwatchCaseAssignment = typeof overwatchCaseAssignments.$inferInsert;

// Verdict options for each cheat category
export type VerdictOption = 'insufficient' | 'guilty';

// Case status values
export type CaseStatus = 'pending_assignment' | 'active' | 'pending_resolution' | 'resolved' | 'expired';

// Case priority values
export type CasePriority = 'normal' | 'high' | 'urgent';

// Final verdict values
export type FinalVerdict = 'innocent' | 'guilty' | 'inconclusive';

// Assignment status values
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'expired' | 'recused';
