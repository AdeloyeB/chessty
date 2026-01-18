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
export const gameModeEnum = pgEnum('game_mode', ['standard', 'chess960']);
export const challengeStatusEnum = pgEnum('challenge_status', ['open', 'accepted', 'confirmed', 'cancelled', 'expired']);
export const spectatorPredictionStatusEnum = pgEnum('spectator_prediction_status', ['open', 'matched', 'settled', 'cancelled']);
export const achievementCategoryEnum = pgEnum('achievement_category', ['games', 'elo', 'streaks', 'special_moves', 'milestones']);

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
    gameMode: gameModeEnum('game_mode').notNull().default('standard'),
    startingFen: text('starting_fen').notNull().default('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
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

// Challenges table for marketplace
export const challenges = pgTable(
  'challenges',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    gameMode: gameModeEnum('game_mode').notNull().default('standard'),
    timeControlKey: text('time_control_key').notNull(),
    timeControlInitial: integer('time_control_initial').notNull(),
    timeControlIncrement: integer('time_control_increment').notNull().default(0),
    stakeAmount: decimal('stake_amount', { precision: 12, scale: 2 }).notNull(),
    minElo: integer('min_elo'),
    maxElo: integer('max_elo'),
    status: challengeStatusEnum('status').notNull().default('open'),
    acceptedById: text('accepted_by_id').references(() => users.id),
    creatorConfirmed: integer('creator_confirmed').notNull().default(0),
    acceptorConfirmed: integer('acceptor_confirmed').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => ({
    creatorIdx: index('challenges_creator_idx').on(table.creatorId),
    statusIdx: index('challenges_status_idx').on(table.status),
    expiresAtIdx: index('challenges_expires_at_idx').on(table.expiresAt),
  })
);

// Spectator predictions table (P2P betting between spectators)
export const spectatorPredictions = pgTable(
  'spectator_predictions',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    acceptorId: text('acceptor_id').references(() => users.id),
    predictedWinnerId: text('predicted_winner_id')
      .notNull()
      .references(() => users.id),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: spectatorPredictionStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    settledAt: timestamp('settled_at'),
  },
  (table) => ({
    gameIdx: index('spectator_predictions_game_idx').on(table.gameId),
    creatorIdx: index('spectator_predictions_creator_idx').on(table.creatorId),
    statusIdx: index('spectator_predictions_status_idx').on(table.status),
  })
);

// User achievements table
export const userAchievements = pgTable(
  'user_achievements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    achievementId: text('achievement_id').notNull(),
    category: achievementCategoryEnum('category').notNull(),
    unlockedAt: timestamp('unlocked_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('user_achievements_user_idx').on(table.userId),
    achievementIdx: index('user_achievements_achievement_idx').on(table.achievementId),
    userAchievementUnique: uniqueIndex('user_achievements_unique').on(table.userId, table.achievementId),
  })
);

// User profiles table (extended profile settings)
export const userProfiles = pgTable(
  'user_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id),
    isPublic: integer('is_public').notNull().default(1), // 1 = public, 0 = private
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    totalCheckmates: integer('total_checkmates').notNull().default(0),
    quickestWin: integer('quickest_win'), // moves to win
    biggestStakeWin: decimal('biggest_stake_win', { precision: 12, scale: 2 }).default('0'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

// Spectator chat table
export const spectatorChat = pgTable(
  'spectator_chat',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    message: text('message').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    gameIdx: index('spectator_chat_game_idx').on(table.gameId),
    createdAtIdx: index('spectator_chat_created_at_idx').on(table.createdAt),
  })
);

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
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type SpectatorPrediction = typeof spectatorPredictions.$inferSelect;
export type NewSpectatorPrediction = typeof spectatorPredictions.$inferInsert;
export type SpectatorChatMessage = typeof spectatorChat.$inferSelect;
export type NewSpectatorChatMessage = typeof spectatorChat.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
