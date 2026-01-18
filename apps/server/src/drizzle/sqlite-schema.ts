import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash'),
  googleId: text('google_id').unique(),
  githubId: text('github_id').unique(),
  eloRating: integer('elo_rating').notNull().default(1200),
  peakEloRating: integer('peak_elo_rating').notNull().default(1200),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  gamesLost: integer('games_lost').notNull().default(0),
  gamesDraw: integer('games_draw').notNull().default(0),
  balance: real('balance').notNull().default(1000),
  totalWagered: real('total_wagered').notNull().default(0),
  totalWon: real('total_won').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Games table
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  whitePlayerId: text('white_player_id').notNull().references(() => users.id),
  blackPlayerId: text('black_player_id').notNull().references(() => users.id),
  winnerId: text('winner_id').references(() => users.id),
  status: text('status').notNull().default('pending'),
  result: text('result'),
  currentFen: text('current_fen').notNull().default('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  pgn: text('pgn').notNull().default(''),
  moves: text('moves', { mode: 'json' }).notNull().$type<any[]>().default([]),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  whiteTimeRemaining: integer('white_time_remaining').notNull(),
  blackTimeRemaining: integer('black_time_remaining').notNull(),
  stakeAmount: real('stake_amount').notNull(),
  totalPot: real('total_pot').notNull(),
  whiteEloAtStart: integer('white_elo_at_start').notNull(),
  blackEloAtStart: integer('black_elo_at_start').notNull(),
  eloChange: integer('elo_change'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
});

// Bets table
export const bets = sqliteTable('bets', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  userId: text('user_id').notNull().references(() => users.id),
  betOnPlayerId: text('bet_on_player_id').notNull().references(() => users.id),
  amount: real('amount').notNull(),
  odds: real('odds').notNull(),
  potentialPayout: real('potential_payout').notNull(),
  status: text('status').notNull().default('pending'),
  fenAtBet: text('fen_at_bet').notNull(),
  moveNumberAtBet: integer('move_number_at_bet').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  settledAt: integer('settled_at', { mode: 'timestamp' }),
});

// Transactions table
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  amount: real('amount').notNull(),
  balanceAfter: real('balance_after').notNull(),
  referenceId: text('reference_id'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Matchmaking queue table
export const matchmakingQueue = sqliteTable('matchmaking_queue', {
  userId: text('user_id').primaryKey().references(() => users.id),
  eloRating: integer('elo_rating').notNull(),
  stakeAmount: real('stake_amount').notNull(),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  minElo: integer('min_elo'),
  maxElo: integer('max_elo'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  whiteGames: many(games, { relationName: 'whitePlayer' }),
  blackGames: many(games, { relationName: 'blackPlayer' }),
  wonGames: many(games, { relationName: 'winner' }),
  bets: many(bets, { relationName: 'bettor' }),
  betsOn: many(bets, { relationName: 'betOn' }),
  transactions: many(transactions),
  sessions: many(sessions),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  whitePlayer: one(users, {
    fields: [games.whitePlayerId],
    references: [users.id],
    relationName: 'whitePlayer',
  }),
  blackPlayer: one(users, {
    fields: [games.blackPlayerId],
    references: [users.id],
    relationName: 'blackPlayer',
  }),
  winner: one(users, {
    fields: [games.winnerId],
    references: [users.id],
    relationName: 'winner',
  }),
  bets: many(bets),
}));

export const betsRelations = relations(bets, ({ one }) => ({
  game: one(games, {
    fields: [bets.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [bets.userId],
    references: [users.id],
    relationName: 'bettor',
  }),
  betOnPlayer: one(users, {
    fields: [bets.betOnPlayerId],
    references: [users.id],
    relationName: 'betOn',
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type MatchmakingEntry = typeof matchmakingQueue.$inferSelect;
export type NewMatchmakingEntry = typeof matchmakingQueue.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
