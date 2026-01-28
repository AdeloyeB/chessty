import { pgTable, text, integer, numeric, boolean, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(), // Nullable for wallet-only users
  username: text('username').notNull().unique(), // Internal ID, auto-generated for wallet users
  displayName: text('display_name').unique(), // Public display name, required for gameplay
  passwordHash: text('password_hash'),
  walletAddress: text('wallet_address').unique(), // Ethereum address for SIWE auth
  googleId: text('google_id').unique(),
  githubId: text('github_id').unique(),
  twitterId: text('twitter_id').unique(),
  appleId: text('apple_id').unique(),
  eloRating: integer('elo_rating').notNull().default(1200),
  peakEloRating: integer('peak_elo_rating').notNull().default(1200),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  gamesLost: integer('games_lost').notNull().default(0),
  gamesDraw: integer('games_draw').notNull().default(0),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('1000'),
  totalWagered: numeric('total_wagered', { precision: 12, scale: 2 }).notNull().default('0'),
  totalWon: numeric('total_won', { precision: 12, scale: 2 }).notNull().default('0'),
  // Account lockout fields
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastFailedLoginAt: timestamp('last_failed_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// Games table
export const games = pgTable('games', {
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
  moves: jsonb('moves').notNull().$type<any[]>().default([]),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  whiteTimeRemaining: integer('white_time_remaining').notNull(),
  blackTimeRemaining: integer('black_time_remaining').notNull(),
  wagerAmount: numeric('wager_amount', { precision: 12, scale: 2 }).notNull(),
  totalPot: numeric('total_pot', { precision: 12, scale: 2 }).notNull(),
  whiteEloAtStart: integer('white_elo_at_start').notNull(),
  blackEloAtStart: integer('black_elo_at_start').notNull(),
  eloChange: integer('elo_change'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

// Bets table
export const bets = pgTable('bets', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  userId: text('user_id').notNull().references(() => users.id),
  betOnPlayerId: text('bet_on_player_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  odds: numeric('odds', { precision: 8, scale: 4 }).notNull(),
  potentialPayout: numeric('potential_payout', { precision: 12, scale: 2 }).notNull(),
  status: text('status').notNull().default('pending'),
  fenAtBet: text('fen_at_bet').notNull(),
  moveNumberAtBet: integer('move_number_at_bet').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});

// Transactions table
export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  referenceId: text('reference_id'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// Matchmaking queue table
export const matchmakingQueue = pgTable('matchmaking_queue', {
  userId: text('user_id').primaryKey().references(() => users.id),
  eloRating: integer('elo_rating').notNull(),
  wagerAmount: numeric('wager_amount', { precision: 12, scale: 2 }).notNull(),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  minElo: integer('min_elo'),
  maxElo: integer('max_elo'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Security tracking fields
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// Challenges table for marketplace
export const challenges = pgTable('challenges', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').notNull().references(() => users.id),
  gameMode: text('game_mode').notNull().default('standard'),
  timeControlKey: text('time_control_key').notNull(),
  timeControlInitial: integer('time_control_initial').notNull(),
  timeControlIncrement: integer('time_control_increment').notNull().default(0),
  wagerAmount: numeric('wager_amount', { precision: 12, scale: 2 }).notNull(),
  minElo: integer('min_elo'),
  maxElo: integer('max_elo'),
  status: text('status').notNull().default('open'),
  acceptedById: text('accepted_by_id').references(() => users.id),
  creatorConfirmed: boolean('creator_confirmed').notNull().default(false),
  acceptorConfirmed: boolean('acceptor_confirmed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Spectator predictions table (P2P betting between spectators)
export const spectatorPredictions = pgTable('spectator_predictions', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  creatorId: text('creator_id').notNull().references(() => users.id),
  acceptorId: text('acceptor_id').references(() => users.id),
  predictedWinnerId: text('predicted_winner_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});

// Spectator chat table
export const spectatorChat = pgTable('spectator_chat', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id),
  userId: text('user_id').notNull().references(() => users.id),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// User achievements table
export const userAchievements = pgTable('user_achievements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  achievementId: text('achievement_id').notNull(),
  category: text('category').notNull(), // games, elo, streaks, special_moves, milestones
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  unique('user_achievement_unique').on(table.userId, table.achievementId),
]);

// User profiles table (extended profile stats)
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  isPublic: boolean('is_public').notNull().default(true),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  totalCheckmates: integer('total_checkmates').notNull().default(0),
  quickestWin: integer('quickest_win'), // fewest moves to win
  biggestWagerWin: numeric('biggest_wager_win', { precision: 12, scale: 2 }).default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// MFA enrollments table (Two-Factor Authentication)
export const mfaEnrollments = pgTable('mfa_enrollments', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totpSecret: text('totp_secret').notNull(), // Encrypted TOTP secret
  backupCodes: text('backup_codes').notNull(), // JSON stringified array of hashed codes
  enabled: boolean('enabled').default(false).notNull(),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// C8 FIX: TOTP usage tracking to prevent replay attacks
// Each used TOTP code is recorded so it can't be reused within the time window
export const mfaTotpUsage = pgTable('mfa_totp_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  codeHash: text('code_hash').notNull(), // SHA-256 hash of the code (don't store plaintext)
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  unique('user_code_unique').on(table.userId, table.codeHash),
]);

// Security audit log table
export const securityAuditLog = pgTable('security_audit_log', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(), // login_failed, login_success, account_locked, etc.
  userId: text('user_id').references(() => users.id),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// Feature flags table
export const featureFlags = pgTable('feature_flags', {
  id: text('id').primaryKey(), // e.g., 'betting_enabled', 'matchmaking_v2'
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
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
  mfaEnrollment: one(mfaEnrollments, {
    fields: [users.id],
    references: [mfaEnrollments.userId],
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

export const mfaEnrollmentsRelations = relations(mfaEnrollments, ({ one }) => ({
  user: one(users, {
    fields: [mfaEnrollments.userId],
    references: [users.id],
  }),
}));

export const mfaTotpUsageRelations = relations(mfaTotpUsage, ({ one }) => ({
  user: one(users, {
    fields: [mfaTotpUsage.userId],
    references: [users.id],
  }),
}));

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
export type MfaEnrollment = typeof mfaEnrollments.$inferSelect;
export type NewMfaEnrollment = typeof mfaEnrollments.$inferInsert;
export type MfaTotpUsage = typeof mfaTotpUsage.$inferSelect;
export type NewMfaTotpUsage = typeof mfaTotpUsage.$inferInsert;
