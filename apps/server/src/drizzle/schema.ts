import { pgTable, text, timestamp, integer, decimal, jsonb, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const gameStatusEnum = pgEnum('game_status', ['pending', 'active', 'completed', 'abandoned', 'draw']);
export const gameResultEnum = pgEnum('game_result', [
  'white_wins',
  'black_wins',
  'draw',
  'stalemate',
  'timeout',
  'resignation',
  'abandonment',
]);
export const betStatusEnum = pgEnum('bet_status', ['pending', 'won', 'lost', 'refunded', 'draw']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'withdrawal',
  'bet_placed',
  'bet_won',
  'bet_lost',
  'bet_refunded',
  'game_stake',
  'game_win',
  'bonus',
]);

// Users table
export const users = pgTable(
  'users',
  {
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
    balance: decimal('balance', { precision: 12, scale: 2 }).notNull().default('1000'),
    totalWagered: decimal('total_wagered', { precision: 12, scale: 2 }).notNull().default('0'),
    totalWon: decimal('total_won', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    usernameIdx: uniqueIndex('users_username_idx').on(table.username),
    eloIdx: index('users_elo_idx').on(table.eloRating),
  })
);

// Games table
export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    whitePlayerId: text('white_player_id')
      .notNull()
      .references(() => users.id),
    blackPlayerId: text('black_player_id')
      .notNull()
      .references(() => users.id),
    winnerId: text('winner_id').references(() => users.id),
    status: gameStatusEnum('status').notNull().default('pending'),
    result: gameResultEnum('result'),
    currentFen: text('current_fen').notNull().default('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    pgn: text('pgn').notNull().default(''),
    moves: jsonb('moves').notNull().default([]),
    timeControlInitial: integer('time_control_initial').notNull(),
    timeControlIncrement: integer('time_control_increment').notNull().default(0),
    whiteTimeRemaining: integer('white_time_remaining').notNull(),
    blackTimeRemaining: integer('black_time_remaining').notNull(),
    stakeAmount: decimal('stake_amount', { precision: 12, scale: 2 }).notNull(),
    totalPot: decimal('total_pot', { precision: 12, scale: 2 }).notNull(),
    whiteEloAtStart: integer('white_elo_at_start').notNull(),
    blackEloAtStart: integer('black_elo_at_start').notNull(),
    eloChange: integer('elo_change'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
  },
  (table) => ({
    whitePlayerIdx: index('games_white_player_idx').on(table.whitePlayerId),
    blackPlayerIdx: index('games_black_player_idx').on(table.blackPlayerId),
    statusIdx: index('games_status_idx').on(table.status),
    createdAtIdx: index('games_created_at_idx').on(table.createdAt),
  })
);

// Bets table
export const bets = pgTable(
  'bets',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    betOnPlayerId: text('bet_on_player_id')
      .notNull()
      .references(() => users.id),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    odds: decimal('odds', { precision: 6, scale: 2 }).notNull(),
    potentialPayout: decimal('potential_payout', { precision: 12, scale: 2 }).notNull(),
    status: betStatusEnum('status').notNull().default('pending'),
    fenAtBet: text('fen_at_bet').notNull(),
    moveNumberAtBet: integer('move_number_at_bet').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    settledAt: timestamp('settled_at'),
  },
  (table) => ({
    gameIdx: index('bets_game_idx').on(table.gameId),
    userIdx: index('bets_user_idx').on(table.userId),
    statusIdx: index('bets_status_idx').on(table.status),
  })
);

// Transactions table
export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: transactionTypeEnum('type').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
    referenceId: text('reference_id'),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('transactions_user_idx').on(table.userId),
    typeIdx: index('transactions_type_idx').on(table.type),
    createdAtIdx: index('transactions_created_at_idx').on(table.createdAt),
  })
);

// Matchmaking queue table
export const matchmakingQueue = pgTable(
  'matchmaking_queue',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id),
    eloRating: integer('elo_rating').notNull(),
    stakeAmount: decimal('stake_amount', { precision: 12, scale: 2 }).notNull(),
    timeControlInitial: integer('time_control_initial').notNull(),
    timeControlIncrement: integer('time_control_increment').notNull().default(0),
    minElo: integer('min_elo'),
    maxElo: integer('max_elo'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (table) => ({
    eloIdx: index('matchmaking_elo_idx').on(table.eloRating),
    joinedAtIdx: index('matchmaking_joined_at_idx').on(table.joinedAt),
  })
);

// Sessions table for tracking active sessions
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('sessions_user_idx').on(table.userId),
    expiresIdx: index('sessions_expires_idx').on(table.expiresAt),
  })
);

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
