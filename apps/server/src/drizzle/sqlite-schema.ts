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
  // Account lockout fields
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  lastFailedLoginAt: integer('last_failed_login_at', { mode: 'timestamp' }),
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
  gameMode: text('game_mode').notNull().default('standard'),
  startingFen: text('starting_fen').notNull().default('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
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
  // Security tracking fields
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Challenges table for marketplace
export const challenges = sqliteTable('challenges', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').notNull().references(() => users.id),
  gameMode: text('game_mode').notNull().default('standard'),
  timeControlKey: text('time_control_key').notNull(),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  stakeAmount: real('stake_amount').notNull(),
  minElo: integer('min_elo'),
  maxElo: integer('max_elo'),
  status: text('status').notNull().default('open'),
  acceptedById: text('accepted_by_id').references(() => users.id),
  creatorConfirmed: integer('creator_confirmed').notNull().default(0),
  acceptorConfirmed: integer('acceptor_confirmed').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// Spectator predictions table (P2P betting between spectators)
export const spectatorPredictions = sqliteTable('spectator_predictions', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  creatorId: text('creator_id').notNull().references(() => users.id),
  acceptorId: text('acceptor_id').references(() => users.id),
  predictedWinnerId: text('predicted_winner_id').notNull().references(() => users.id),
  amount: real('amount').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  settledAt: integer('settled_at', { mode: 'timestamp' }),
});

// Spectator chat table
export const spectatorChat = sqliteTable('spectator_chat', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  userId: text('user_id').notNull().references(() => users.id),
  message: text('message').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// User achievements table
export const userAchievements = sqliteTable('user_achievements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  achievementId: text('achievement_id').notNull(),
  category: text('category').notNull(), // games, elo, streaks, special_moves, milestones
  unlockedAt: integer('unlocked_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// User profiles table (extended profile stats)
export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  isPublic: integer('is_public').notNull().default(1), // 1 = public, 0 = private
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  totalCheckmates: integer('total_checkmates').notNull().default(0),
  quickestWin: integer('quickest_win'), // fewest moves to win
  biggestStakeWin: real('biggest_stake_win').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Security audit log table
export const securityAuditLog = sqliteTable('security_audit_log', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(), // login_failed, login_success, account_locked, account_unlocked, etc.
  userId: text('user_id').references(() => users.id),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  whiteGames: many(games, { relationName: 'whitePlayer' }),
  blackGames: many(games, { relationName: 'blackPlayer' }),
  wonGames: many(games, { relationName: 'winner' }),
  bets: many(bets, { relationName: 'bettor' }),
  betsOn: many(bets, { relationName: 'betOn' }),
  transactions: many(transactions),
  sessions: many(sessions),
  createdChallenges: many(challenges, { relationName: 'creator' }),
  acceptedChallenges: many(challenges, { relationName: 'acceptor' }),
  spectatorPredictionsCreated: many(spectatorPredictions, { relationName: 'predictionCreator' }),
  spectatorPredictionsAccepted: many(spectatorPredictions, { relationName: 'predictionAcceptor' }),
  spectatorChatMessages: many(spectatorChat),
  securityAuditLogs: many(securityAuditLog),
  achievements: many(userAchievements),
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
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
  spectatorPredictions: many(spectatorPredictions),
  spectatorChatMessages: many(spectatorChat),
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

export const challengesRelations = relations(challenges, ({ one }) => ({
  creator: one(users, {
    fields: [challenges.creatorId],
    references: [users.id],
    relationName: 'creator',
  }),
  acceptedBy: one(users, {
    fields: [challenges.acceptedById],
    references: [users.id],
    relationName: 'acceptor',
  }),
}));

export const spectatorPredictionsRelations = relations(spectatorPredictions, ({ one }) => ({
  game: one(games, {
    fields: [spectatorPredictions.gameId],
    references: [games.id],
  }),
  creator: one(users, {
    fields: [spectatorPredictions.creatorId],
    references: [users.id],
    relationName: 'predictionCreator',
  }),
  acceptor: one(users, {
    fields: [spectatorPredictions.acceptorId],
    references: [users.id],
    relationName: 'predictionAcceptor',
  }),
  predictedWinner: one(users, {
    fields: [spectatorPredictions.predictedWinnerId],
    references: [users.id],
  }),
}));

export const spectatorChatRelations = relations(spectatorChat, ({ one }) => ({
  game: one(games, {
    fields: [spectatorChat.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [spectatorChat.userId],
    references: [users.id],
  }),
}));

export const securityAuditLogRelations = relations(securityAuditLog, ({ one }) => ({
  user: one(users, {
    fields: [securityAuditLog.userId],
    references: [users.id],
  }),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

// Feature flags table
export const featureFlags = sqliteTable('feature_flags', {
  id: text('id').primaryKey(), // e.g., 'betting_enabled', 'matchmaking_v2'
  name: text('name').notNull(),
  description: text('description'),
  enabled: integer('enabled').notNull().default(0), // 0 = false, 1 = true
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(), // For future extensibility
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Type exports
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
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
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type SpectatorPrediction = typeof spectatorPredictions.$inferSelect;
export type NewSpectatorPrediction = typeof spectatorPredictions.$inferInsert;
export type SpectatorChatMessage = typeof spectatorChat.$inferSelect;
export type NewSpectatorChatMessage = typeof spectatorChat.$inferInsert;
export type SecurityAuditLogEntry = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLogEntry = typeof securityAuditLog.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
