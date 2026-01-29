/**
 * Settlement Database Schema
 * ==========================
 *
 * Database tables for the settlement system that handles game result processing,
 * fund distribution, and anti-cheat integration.
 *
 * This schema tracks:
 * - Settlement records for each completed game
 * - Settlement history (audit trail of status changes)
 *
 * DESIGN NOTES:
 * - Every completed game gets a settlement record
 * - Most settlements are auto-settled (status goes pending -> settled quickly)
 * - Suspicious games get held (pending -> disputed -> resolved)
 * - 48-hour timeout ensures funds are never stuck indefinitely
 *
 * See /apps/server/src/services/settlement/types.ts for type definitions.
 */

import { pgTable, text, numeric, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users, games } from './pg-schema';
import { reviewTasks } from './anticheat-schema';

// ============================================================================
// SETTLEMENTS TABLE
// ============================================================================
// The main settlement record for each completed game.
// Tracks the full lifecycle from game end to final fund distribution.

export const settlements = pgTable('settlements', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The game this settlement is for (required, one settlement per game)
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }).unique(),

  // Who won the game (null for draws)
  winnerId: text('winner_id').references(() => users.id),

  // Who lost the game (null for draws)
  loserId: text('loser_id').references(() => users.id),

  // Total pot amount (both players' wagers combined)
  // Stored as string for precision (Drizzle numeric pattern)
  totalPot: numeric('total_pot', { precision: 12, scale: 2 }).notNull(),

  // Platform fee taken (currently 0, structured for future)
  platformFee: numeric('platform_fee', { precision: 12, scale: 2 }).notNull().default('0'),

  // Amount paid to winner (null if disputed or draw)
  winnerPayout: numeric('winner_payout', { precision: 12, scale: 2 }),

  // Settlement status: 'pending', 'settled', 'disputed', 'resolved'
  status: text('status').notNull().default('pending'),

  // Anti-cheat suspicion score (0.0000 to 100.0000)
  // null until evaluation is complete
  suspicionScore: numeric('suspicion_score', { precision: 7, scale: 4 }),

  // The player who triggered the suspicion flag (null if clean)
  flaggedPlayerId: text('flagged_player_id').references(() => users.id),

  // Link to the Arbiter Overwatch review case if disputed
  // Note: Database column is 'jury_case_id' for backwards compatibility
  overwatchCaseId: text('jury_case_id').references(() => reviewTasks.id),

  // When the settlement was finalized (null if pending/disputed)
  settledAt: timestamp('settled_at', { withTimezone: true }),

  // What triggered the final settlement: 'auto', 'overwatch', 'timeout', 'admin'
  // null if not yet settled
  settledBy: text('settled_by'),

  // Blockchain transaction hashes (stubbed for future implementation)
  escrowTxHash: text('escrow_tx_hash'),
  settlementTxHash: text('settlement_tx_hash'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for finding settlements by status (work queues)
  index('settlements_status_idx').on(table.status),
  // Index for finding disputed settlements that might be timed out
  index('settlements_disputed_created_idx').on(table.status, table.createdAt),
  // Index for finding settlements by flagged player
  index('settlements_flagged_player_idx').on(table.flaggedPlayerId),
]);

// ============================================================================
// SETTLEMENT HISTORY TABLE
// ============================================================================
// Audit trail of all settlement status changes.
// Used for debugging, compliance, and dispute resolution.

export const settlementHistory = pgTable('settlement_history', {
  // Primary key - auto-generated unique ID
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // The settlement this history entry belongs to
  settlementId: text('settlement_id').notNull().references(() => settlements.id, { onDelete: 'cascade' }),

  // Previous status before this change (null for initial creation)
  previousStatus: text('previous_status'),

  // New status after this change
  newStatus: text('new_status').notNull(),

  // What triggered this change: 'created', 'evaluated', 'disputed', 'verdict', 'timeout', 'admin'
  trigger: text('trigger').notNull(),

  // Who triggered this change (null for automated changes)
  triggeredBy: text('triggered_by').references(() => users.id),

  // Additional details about this change (varies by trigger type)
  // Example: { verdictType: 'guilty', notes: 'Clear engine correlation detected' }
  details: jsonb('details').$type<Record<string, unknown>>(),

  // When this change occurred
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // Index for finding all history for a settlement
  index('settlement_history_settlement_idx').on(table.settlementId),
]);

// ============================================================================
// RELATIONS
// ============================================================================

export const settlementsRelations = relations(settlements, ({ one, many }) => ({
  game: one(games, {
    fields: [settlements.gameId],
    references: [games.id],
  }),
  winner: one(users, {
    fields: [settlements.winnerId],
    references: [users.id],
    relationName: 'settlementWinner',
  }),
  loser: one(users, {
    fields: [settlements.loserId],
    references: [users.id],
    relationName: 'settlementLoser',
  }),
  flaggedPlayer: one(users, {
    fields: [settlements.flaggedPlayerId],
    references: [users.id],
    relationName: 'settlementFlaggedPlayer',
  }),
  overwatchCase: one(reviewTasks, {
    fields: [settlements.overwatchCaseId],
    references: [reviewTasks.id],
  }),
  history: many(settlementHistory),
}));

export const settlementHistoryRelations = relations(settlementHistory, ({ one }) => ({
  settlement: one(settlements, {
    fields: [settlementHistory.settlementId],
    references: [settlements.id],
  }),
  triggeredByUser: one(users, {
    fields: [settlementHistory.triggeredBy],
    references: [users.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SettlementRecord = typeof settlements.$inferSelect;
export type NewSettlementRecord = typeof settlements.$inferInsert;

export type SettlementHistoryRecord = typeof settlementHistory.$inferSelect;
export type NewSettlementHistoryRecord = typeof settlementHistory.$inferInsert;
