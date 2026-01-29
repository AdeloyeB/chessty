/**
 * Anti-Cheat Database Schema
 *
 * This file defines all database tables for the anti-cheat system.
 * See docs/ANTI_CHEAT_PLAN.md section 13 (Data Architecture) for the full design.
 *
 * Tables:
 * - cheatFlags: Stores suspicion flags per player/game
 * - gameAnalyses: Stores engine correlation analysis results
 * - playerBehaviorProfiles: Stores behavioral baselines per player
 * - reviewTasks: Human review queue
 * - playerSanctions: Warnings, bans, appeals
 * - gameNetworkActivity: Network traffic analysis per game
 * - moveInputValidations: Input physics validation per move
 * - detectedSkillShifts: Mid-game skill shift detections
 */

import { pgTable, text, integer, numeric, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users, games } from './pg-schema';

// ============================================================================
// CHEAT FLAGS TABLE
// ============================================================================
// Stores individual suspicion flags raised against players during or after games.
// Each flag represents one suspicious behavior or pattern detected.
// Multiple flags can exist for the same player/game combination.
export const cheatFlags = pgTable('cheat_flags', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The player being flagged (required)
  playerId: text('player_id').notNull().references(() => users.id),

  // The game where the suspicious behavior occurred (optional - some flags are cross-game)
  gameId: text('game_id').references(() => games.id),

  // Type of flag: 'engine_correlation', 'timing_anomaly', 'focus_pattern', 'network_suspicious', etc.
  flagType: text('flag_type').notNull(),

  // Severity level: 'low', 'medium', 'high', 'critical'
  severity: text('severity').notNull(),

  // Suspicion score from 0.0000 to 1.0000 (4 decimal places)
  // This is a probability score - 0.85 means 85% confidence this is cheating
  suspicionScore: numeric('suspicion_score', { precision: 5, scale: 4 }).notNull(),

  // Detailed information about the flag (structure varies by flag type)
  // Example for engine_correlation: { topMoveRate: 0.92, avgCpl: 12, engineName: 'stockfish-16' }
  details: jsonb('details').notNull().$type<Record<string, unknown>>(),

  // Status: 'active', 'reviewed', 'dismissed', 'escalated'
  status: text('status').notNull().default('active'),

  // When this flag was created
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When a reviewer looked at this flag
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

  // Which admin/reviewer handled this flag (uses users table since we don't have admin_users)
  reviewedBy: text('reviewed_by').references(() => users.id),
}, (table) => [
  // Index for fast lookups by player (common query: "show all flags for user X")
  index('cheat_flags_player_idx').on(table.playerId),
  // Index for fast lookups by game (common query: "show all flags for game Y")
  index('cheat_flags_game_idx').on(table.gameId),
  // Index for finding unreviewed flags (common query: "show pending flags")
  index('cheat_flags_status_idx').on(table.status),
]);

// ============================================================================
// GAME ANALYSES TABLE
// ============================================================================
// Stores the results of engine correlation analysis for each game.
// After a game ends, we run it through an engine (like Stockfish) to compare
// each player's moves against the engine's recommendations.
export const gameAnalyses = pgTable('game_analyses', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game that was analyzed (required)
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // Which engine was used for analysis (e.g., 'stockfish-16', 'lc0')
  engineName: text('engine_name').notNull(),

  // How many moves ahead the engine looked (higher = more accurate but slower)
  engineDepth: integer('engine_depth').notNull(),

  // White's statistics
  // Top move rate: percentage of moves that matched the engine's #1 recommendation (0.0000 to 1.0000)
  whiteTopMoveRate: numeric('white_top_move_rate', { precision: 5, scale: 4 }),
  // Average centipawn loss: how many "points" lost per move compared to best move
  // Lower = better. GM-level is typically 15-25, engine is 0-5
  whiteAvgCpl: numeric('white_avg_cpl', { precision: 6, scale: 2 }),

  // Black's statistics (same as white)
  blackTopMoveRate: numeric('black_top_move_rate', { precision: 5, scale: 4 }),
  blackAvgCpl: numeric('black_avg_cpl', { precision: 6, scale: 2 }),

  // Per-move analysis data
  // Array of: { moveIndex, playedMove, bestMove, cpl, rank, classification }
  moveAnalyses: jsonb('move_analyses').notNull().$type<Array<{
    moveIndex: number;
    playedMove: string;
    bestMove: string;
    cpl: number;
    rank: number;
    classification: string;
  }>>(),

  // Detected suspicious patterns
  // Array of: { pattern: 'consistent_engine_correlation', confidence: 0.85, details: {...} }
  detectedPatterns: jsonb('detected_patterns').$type<Array<{
    pattern: string;
    confidence: number;
    details: Record<string, unknown>;
  }>>(),

  // When this analysis was completed
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for fast lookups by game
  index('game_analyses_game_idx').on(table.gameId),
]);

// ============================================================================
// PLAYER BEHAVIOR PROFILES TABLE
// ============================================================================
// Stores behavioral baselines for each player.
// We build a "profile" of how each player normally behaves (timing patterns,
// mouse movements, focus patterns) so we can detect when they deviate.
export const playerBehaviorProfiles = pgTable('player_behavior_profiles', {
  // Primary key is the player ID (one profile per player)
  playerId: text('player_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),

  // Distribution of move times (histogram data)
  // Example: { "0-5s": 0.15, "5-10s": 0.35, "10-20s": 0.30, "20-60s": 0.15, "60s+": 0.05 }
  moveTimeDistribution: jsonb('move_time_distribution').$type<Record<string, number>>(),

  // Variance in move timing (high variance = inconsistent, low = very predictable)
  moveTimeVariance: numeric('move_time_variance', { precision: 8, scale: 4 }),

  // Average curvature of mouse paths (0 = perfectly straight, higher = more curved)
  // Human mouse paths are naturally curved, not straight lines
  avgPathCurvature: numeric('avg_path_curvature', { precision: 6, scale: 4 }),

  // Average number of times per game the player unfocuses (alt-tabs away)
  avgUnfocusPerGame: numeric('avg_unfocus_per_game', { precision: 5, scale: 2 }),

  // How many games were used to build this profile
  gamesInProfile: integer('games_in_profile').notNull().default(0),

  // When this profile was last updated
  lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// REVIEW TASKS TABLE
// ============================================================================
// Human review queue for cases that need manual investigation.
// When automated systems flag a player with high confidence, a review task is created.
export const reviewTasks = pgTable('review_tasks', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // Type of review: 'cheating_investigation', 'sandbagging_review', 'collusion_check', 'appeal'
  taskType: text('task_type').notNull(),

  // Priority level: 'low', 'medium', 'high', 'urgent'
  priority: text('priority').notNull(),

  // The player being investigated
  playerId: text('player_id').notNull().references(() => users.id),

  // List of game IDs to review (stored as JSON array since Drizzle doesn't support text[])
  gameIds: jsonb('game_ids').notNull().$type<string[]>(),

  // Why this review was triggered
  reason: text('reason').notNull(),

  // Combined suspicion score that triggered the review (0.0000 to 1.0000)
  suspicionScore: numeric('suspicion_score', { precision: 5, scale: 4 }).notNull(),

  // Status: 'pending', 'in_progress', 'completed', 'escalated'
  status: text('status').notNull().default('pending'),

  // Which reviewer is handling this task (uses users table)
  assignedTo: text('assigned_to').references(() => users.id),

  // Final decision: 'innocent', 'warning_issued', 'temp_ban', 'perm_ban', 'inconclusive'
  verdict: text('verdict'),

  // Reviewer's notes explaining the decision
  verdictNotes: text('verdict_notes'),

  // When this task was created
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When the review was completed
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  // Index for finding tasks assigned to a specific reviewer
  index('review_tasks_assigned_idx').on(table.assignedTo),
  // Index for finding pending tasks (work queue)
  index('review_tasks_status_idx').on(table.status),
  // Index for finding tasks about a specific player
  index('review_tasks_player_idx').on(table.playerId),
]);

// ============================================================================
// PLAYER SANCTIONS TABLE
// ============================================================================
// Records all sanctions (warnings, bans) issued to players.
// Also tracks appeals and their outcomes.
export const playerSanctions = pgTable('player_sanctions', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The player who received the sanction
  playerId: text('player_id').notNull().references(() => users.id),

  // Type of sanction: 'warning', 'temp_ban', 'perm_ban', 'stake_limit', 'review_required'
  sanctionType: text('sanction_type').notNull(),

  // Explanation of why this sanction was issued
  reason: text('reason').notNull(),

  // When the sanction takes effect
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),

  // When the sanction expires (null = permanent)
  endsAt: timestamp('ends_at', { withTimezone: true }),

  // Link to the review task that resulted in this sanction
  reviewTaskId: text('review_task_id').references(() => reviewTasks.id),

  // Whether the player has appealed this sanction
  appealed: boolean('appealed').notNull().default(false),

  // Result of the appeal: 'upheld', 'reduced', 'overturned', null if not appealed
  appealOutcome: text('appeal_outcome'),
}, (table) => [
  // Index for finding all sanctions for a player
  index('player_sanctions_player_idx').on(table.playerId),
  // Index for finding active sanctions (common query: "is this player banned?")
  index('player_sanctions_active_idx').on(table.playerId, table.endsAt),
]);

// ============================================================================
// GAME NETWORK ACTIVITY TABLE
// ============================================================================
// Tracks network activity during games to detect external engine API calls.
// We monitor request patterns (timing, domains) to catch players querying
// remote chess engines like Chessify or lichess analysis.
export const gameNetworkActivity = pgTable('game_network_activity', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game during which this activity was recorded
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // The player whose network activity was monitored
  playerId: text('player_id').notNull().references(() => users.id),

  // Total number of network requests during the game
  totalRequests: integer('total_requests').notNull(),

  // Number of requests flagged as suspicious (to known engine APIs, etc.)
  suspiciousRequestCount: integer('suspicious_request_count').notNull(),

  // Timestamps (in milliseconds) of suspicious requests (stored as JSON array)
  suspiciousRequestTimestamps: jsonb('suspicious_request_timestamps').notNull().$type<number[]>(),

  // How many suspicious requests correlated with move times
  // (request happened 1-10 seconds before a move = correlation)
  correlatedWithMoves: integer('correlated_with_moves').notNull().default(0),

  // Overall suspicion score based on network patterns (0.0000 to 1.0000)
  suspicionScore: numeric('suspicion_score', { precision: 5, scale: 4 }).notNull(),

  // When this record was created
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for finding network activity for a specific game
  index('game_network_activity_game_idx').on(table.gameId),
  // Index for finding network activity for a specific player
  index('game_network_activity_player_idx').on(table.playerId),
]);

// ============================================================================
// MOVE INPUT VALIDATIONS TABLE
// ============================================================================
// Validates that mouse/touch inputs for each move follow realistic physics.
// Catches synthetic inputs (bots) that have impossibly smooth paths or
// superhuman timing precision.
export const moveInputValidations = pgTable('move_input_validations', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game containing this move
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // Which move in the game (0-indexed)
  moveIndex: integer('move_index').notNull(),

  // Did the input pass physics validation? (realistic acceleration, speed, jitter)
  physicsValid: boolean('physics_valid').notNull(),

  // Details of physics violations if any
  // Example: { "violation": "linear_path", "curvature": 0.001, "expected_min": 0.1 }
  physicsViolations: jsonb('physics_violations').$type<Array<{
    violation: string;
    [key: string]: unknown;
  }>>(),

  // Did the input pass consistency validation? (matches player's baseline profile)
  consistencyValid: boolean('consistency_valid').notNull(),

  // Details of consistency issues if any
  // Example: { "issue": "timing_deviation", "observed": 1200, "expected_range": [3000, 15000] }
  consistencyIssues: jsonb('consistency_issues').$type<Array<{
    issue: string;
    [key: string]: unknown;
  }>>(),

  // Score indicating likelihood this is synthetic/bot input (0.0000 to 1.0000)
  // Higher = more likely to be fake
  syntheticScore: numeric('synthetic_score', { precision: 5, scale: 4 }).notNull(),

  // Reasons for synthetic detection (stored as JSON array)
  syntheticReasons: jsonb('synthetic_reasons').$type<string[]>(),

  // When this validation was performed
  validatedAt: timestamp('validated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for finding validations for a specific game
  index('move_input_validations_game_idx').on(table.gameId),
]);

// ============================================================================
// DETECTED SKILL SHIFTS TABLE
// ============================================================================
// Records instances where a player's skill level suddenly changed mid-game.
// A player playing at 1500 ELO level suddenly playing at 2500 level is suspicious.
export const detectedSkillShifts = pgTable('detected_skill_shifts', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game where the skill shift was detected
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // The player who exhibited the skill shift
  playerId: text('player_id').notNull().references(() => users.id),

  // At which move the shift was detected
  moveIndex: integer('move_index').notNull(),

  // Average centipawn loss before the shift point (higher = worse play)
  beforeWindowCpl: numeric('before_window_cpl', { precision: 6, scale: 2 }).notNull(),

  // Average centipawn loss after the shift point (lower = better play)
  afterWindowCpl: numeric('after_window_cpl', { precision: 6, scale: 2 }).notNull(),

  // How big was the improvement (before - after)
  // A shift of 30+ CPL is very suspicious
  shiftMagnitude: numeric('shift_magnitude', { precision: 6, scale: 2 }).notNull(),

  // Events that happened around the same time as the shift (stored as JSON array)
  // Example: ['window_unfocused', 'suspicious_network_request', 'timing_pattern_change']
  coincidentEvents: jsonb('coincident_events').$type<string[]>(),

  // Severity level: 'low', 'medium', 'high', 'critical'
  severity: text('severity').notNull(),

  // When this shift was detected
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for finding skill shifts in a specific game
  index('detected_skill_shifts_game_idx').on(table.gameId),
  // Index for finding skill shifts for a specific player
  index('detected_skill_shifts_player_idx').on(table.playerId),
]);

// ============================================================================
// RELATIONS
// ============================================================================
// Define relationships between tables for type-safe joins and includes

export const cheatFlagsRelations = relations(cheatFlags, ({ one }) => ({
  player: one(users, {
    fields: [cheatFlags.playerId],
    references: [users.id],
    relationName: 'flaggedPlayer',
  }),
  game: one(games, {
    fields: [cheatFlags.gameId],
    references: [games.id],
  }),
  reviewer: one(users, {
    fields: [cheatFlags.reviewedBy],
    references: [users.id],
    relationName: 'flagReviewer',
  }),
}));

export const gameAnalysesRelations = relations(gameAnalyses, ({ one }) => ({
  game: one(games, {
    fields: [gameAnalyses.gameId],
    references: [games.id],
  }),
}));

export const playerBehaviorProfilesRelations = relations(playerBehaviorProfiles, ({ one }) => ({
  player: one(users, {
    fields: [playerBehaviorProfiles.playerId],
    references: [users.id],
  }),
}));

export const reviewTasksRelations = relations(reviewTasks, ({ one }) => ({
  player: one(users, {
    fields: [reviewTasks.playerId],
    references: [users.id],
    relationName: 'reviewSubject',
  }),
  assignee: one(users, {
    fields: [reviewTasks.assignedTo],
    references: [users.id],
    relationName: 'reviewAssignee',
  }),
}));

export const playerSanctionsRelations = relations(playerSanctions, ({ one }) => ({
  player: one(users, {
    fields: [playerSanctions.playerId],
    references: [users.id],
  }),
  reviewTask: one(reviewTasks, {
    fields: [playerSanctions.reviewTaskId],
    references: [reviewTasks.id],
  }),
}));

export const gameNetworkActivityRelations = relations(gameNetworkActivity, ({ one }) => ({
  game: one(games, {
    fields: [gameNetworkActivity.gameId],
    references: [games.id],
  }),
  player: one(users, {
    fields: [gameNetworkActivity.playerId],
    references: [users.id],
  }),
}));

export const moveInputValidationsRelations = relations(moveInputValidations, ({ one }) => ({
  game: one(games, {
    fields: [moveInputValidations.gameId],
    references: [games.id],
  }),
}));

export const detectedSkillShiftsRelations = relations(detectedSkillShifts, ({ one }) => ({
  game: one(games, {
    fields: [detectedSkillShifts.gameId],
    references: [games.id],
  }),
  player: one(users, {
    fields: [detectedSkillShifts.playerId],
    references: [users.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================
// Export TypeScript types for use in application code

export type CheatFlag = typeof cheatFlags.$inferSelect;
export type NewCheatFlag = typeof cheatFlags.$inferInsert;

export type GameAnalysis = typeof gameAnalyses.$inferSelect;
export type NewGameAnalysis = typeof gameAnalyses.$inferInsert;

export type PlayerBehaviorProfile = typeof playerBehaviorProfiles.$inferSelect;
export type NewPlayerBehaviorProfile = typeof playerBehaviorProfiles.$inferInsert;

export type ReviewTask = typeof reviewTasks.$inferSelect;
export type NewReviewTask = typeof reviewTasks.$inferInsert;

export type PlayerSanction = typeof playerSanctions.$inferSelect;
export type NewPlayerSanction = typeof playerSanctions.$inferInsert;

export type GameNetworkActivity = typeof gameNetworkActivity.$inferSelect;
export type NewGameNetworkActivity = typeof gameNetworkActivity.$inferInsert;

export type MoveInputValidation = typeof moveInputValidations.$inferSelect;
export type NewMoveInputValidation = typeof moveInputValidations.$inferInsert;

export type DetectedSkillShift = typeof detectedSkillShifts.$inferSelect;
export type NewDetectedSkillShift = typeof detectedSkillShifts.$inferInsert;
