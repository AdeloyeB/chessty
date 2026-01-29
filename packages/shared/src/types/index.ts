import { z } from 'zod';

// User types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(), // Nullable for wallet-only users
  username: z.string().min(3).max(20), // Internal ID, auto-generated for wallet users
  displayName: z.string().min(3).max(20).nullable(), // Public display name for gameplay
  walletAddress: z.string().nullable(), // Ethereum address for SIWE auth
  eloRating: z.number().default(1200),
  peakEloRating: z.number().default(1200),
  gamesPlayed: z.number().default(0),
  gamesWon: z.number().default(0),
  gamesLost: z.number().default(0),
  gamesDraw: z.number().default(0),
  balance: z.number().default(1000),
  totalWagered: z.number().default(0),
  totalWon: z.number().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export type PublicUser = Pick<
  User,
  'id' | 'username' | 'displayName' | 'eloRating' | 'peakEloRating' | 'gamesPlayed' | 'gamesWon' | 'gamesLost' | 'gamesDraw'
>;

// Game types
export const GameStatusSchema = z.enum(['pending', 'active', 'completed', 'abandoned', 'draw', 'cancelled']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const GameResultSchema = z.enum([
  'white_wins',
  'black_wins',
  'draw',
  'stalemate',
  'timeout',
  'resignation',
  'abandonment',
]);
export type GameResult = z.infer<typeof GameResultSchema>;

export const TimeControlSchema = z.object({
  initial: z.number(), // seconds
  increment: z.number(), // seconds per move
});
export type TimeControl = z.infer<typeof TimeControlSchema>;

export const MoveSchema = z.object({
  from: z.string(),
  to: z.string(),
  promotion: z.string().optional(),
  san: z.string(),
  fen: z.string(),
  timestamp: z.number(),
});
export type Move = z.infer<typeof MoveSchema>;

export const GameSchema = z.object({
  id: z.string(),
  whitePlayerId: z.string(),
  blackPlayerId: z.string(),
  winnerId: z.string().nullable(),
  status: GameStatusSchema,
  result: GameResultSchema.nullable(),
  currentFen: z.string(),
  pgn: z.string(),
  moves: z.array(MoveSchema),
  timeControl: TimeControlSchema,
  whiteTimeRemaining: z.number(),
  blackTimeRemaining: z.number(),
  wagerAmount: z.number(),
  totalPot: z.number(),
  whiteEloAtStart: z.number(),
  blackEloAtStart: z.number(),
  eloChange: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().nullable(),
  endedAt: z.date().nullable(),
});
export type Game = z.infer<typeof GameSchema>;

// Bet types
export const BetStatusSchema = z.enum(['pending', 'won', 'lost', 'refunded', 'draw']);
export type BetStatus = z.infer<typeof BetStatusSchema>;

export const BetSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  userId: z.string(),
  betOnPlayerId: z.string(),
  amount: z.number().positive(),
  odds: z.number().positive(),
  potentialPayout: z.number(),
  status: BetStatusSchema,
  fenAtBet: z.string(),
  moveNumberAtBet: z.number(),
  createdAt: z.date(),
  settledAt: z.date().nullable(),
});
export type Bet = z.infer<typeof BetSchema>;

// Transaction types
export const TransactionTypeSchema = z.enum([
  'deposit',
  'withdrawal',
  'bet_placed',
  'bet_won',
  'bet_lost',
  'bet_refunded',
  'game_wager',
  'game_win',
  'bonus',
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: TransactionTypeSchema,
  amount: z.number(),
  balanceAfter: z.number(),
  referenceId: z.string().nullable(), // gameId or betId
  description: z.string().nullable(),
  createdAt: z.date(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

// Matchmaking types
export const MatchmakingEntrySchema = z.object({
  userId: z.string(),
  eloRating: z.number(),
  wagerAmount: z.number(),
  timeControl: TimeControlSchema,
  minElo: z.number().nullable(),
  maxElo: z.number().nullable(),
  joinedAt: z.date(),
});
export type MatchmakingEntry = z.infer<typeof MatchmakingEntrySchema>;

// WebSocket message types
export const WSMessageTypeSchema = z.enum([
  // Client -> Server
  'game:join',
  'game:leave',
  'game:move',
  'game:resign',
  'game:offer_draw',
  'game:accept_draw',
  'game:decline_draw',
  'queue:join',
  'queue:leave',
  'spectate:join',
  'spectate:leave',
  'spectate:leave_all',
  'bet:place',
  // Challenge messages (Client -> Server)
  'challenge:create',
  'challenge:cancel',
  'challenge:accept',
  'challenge:confirm',
  'challenge:decline',
  // Spectator predictions (Client -> Server)
  'spectator:prediction_create',
  'spectator:prediction_accept',
  // Server -> Client
  'game:started',
  'game:move_made',
  'game:ended',
  'game:cancelled',
  'game:clock_update',
  'game:draw_offered',
  'game:draw_declined',
  'queue:joined',
  'queue:left',
  'queue:match_found',
  'spectate:joined',
  'spectate:left',
  'spectate:game_state',
  'odds:updated',
  'bet:placed',
  'bet:settled',
  // Challenge messages (Server -> Client)
  'challenge:created',
  'challenge:list_update',
  'challenge:accepted',
  'challenge:confirmed',
  'challenge:expired',
  'challenge:cancelled',
  'challenge:declined',
  // Spectator predictions (Server -> Client)
  'spectator:prediction_created',
  'spectator:prediction_matched',
  'spectator:prediction_settled',
  'spectator:predictions_list',
  // Achievement notifications (Server -> Client)
  'achievement:unlocked',
  'error',
  'ping',
  'pong',
]);
export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  timestamp: number;
}

// WebSocket payload types
export interface GameMovePayload {
  gameId: string;
  from: string;
  to: string;
  promotion?: string;
}

export interface QueueJoinPayload {
  wagerAmount: number;
  timeControl: TimeControl;
  minElo?: number;
  maxElo?: number;
}

export interface SpectateJoinPayload {
  gameId: string;
}

export interface SpectateLeavePayload {
  gameId?: string; // Optional for backward compatibility — omit to leave current game (old behavior)
}

export interface BetPlacePayload {
  gameId: string;
  betOnPlayerId: string;
  amount: number;
}

export interface GameStartedPayload {
  game: Game;
  whitePlayer: PublicUser;
  blackPlayer: PublicUser;
}

export interface GameMovePayloadServer {
  gameId: string;
  move: Move;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
}

export interface GameEndedPayload {
  gameId: string;
  result: GameResult;
  winnerId: string | null;
  whiteEloChange: number;
  blackEloChange: number;
}

export interface ClockUpdatePayload {
  gameId: string;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
}

export interface MatchFoundPayload {
  gameId: string;
  opponent: PublicUser;
  playerColor: 'white' | 'black';
  wagerAmount: number;
  timeControl: TimeControl;
}

export interface OddsUpdatePayload {
  gameId: string;
  whiteOdds: number;
  blackOdds: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// Challenge payload types
export interface ChallengeCreatePayload {
  gameMode: GameMode;
  timeControlKey: string;
  wagerAmount: number;
  minElo?: number;
  maxElo?: number;
}

export interface ChallengeCancelPayload {
  challengeId: string;
}

export interface ChallengeAcceptPayload {
  challengeId: string;
}

export interface ChallengeConfirmPayload {
  challengeId: string;
}

export interface ChallengeDeclinePayload {
  challengeId: string;
}

export interface ChallengeCreatedPayload {
  challenge: ChallengeWithCreator;
}

export interface ChallengeListUpdatePayload {
  challenges: ChallengeWithCreator[];
}

export interface ChallengeAcceptedPayload {
  challenge: ChallengeWithCreator;
  acceptedBy: PublicUser;
}

export interface ChallengeConfirmedPayload {
  challenge: ChallengeWithCreator;
  game: Game;
  whitePlayer: PublicUser;
  blackPlayer: PublicUser;
}

export interface ChallengeExpiredPayload {
  challengeId: string;
}

export interface ChallengeCancelledPayload {
  challengeId: string;
}

export interface ChallengeDeclinedPayload {
  challengeId: string;
}

// Spectator prediction payload types
export interface SpectatorPredictionCreatePayload {
  gameId: string;
  predictedWinnerId: string;
  amount: number;
}

export interface SpectatorPredictionAcceptPayload {
  predictionId: string;
}

export interface SpectatorPredictionCreatedPayload {
  prediction: SpectatorPredictionWithUsers;
}

export interface SpectatorPredictionMatchedPayload {
  prediction: SpectatorPredictionWithUsers;
}

export interface SpectatorPredictionSettledPayload {
  prediction: SpectatorPredictionWithUsers;
  winnerId: string | null;
}

export interface SpectatorPredictionsListPayload {
  predictions: SpectatorPredictionWithUsers[];
}

// Auth types
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1), // Don't enforce complexity on login, just ensure non-empty
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: PasswordSchema,
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export interface AuthResponse {
  user: PublicUser & { email: string | null; balance: number; walletAddress?: string | null };
  token: string;
  needsDisplayName?: boolean; // True if user needs to set a display name (new wallet users)
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Leaderboard types
export interface LeaderboardEntry {
  rank: number;
  user: PublicUser;
  value: number; // elo or winnings depending on type
}

export type LeaderboardType = 'elo' | 'winnings';

// Game Mode
export const GameModeSchema = z.enum(['standard', 'chess960']);
export type GameMode = z.infer<typeof GameModeSchema>;

// Challenge types
export const ChallengeStatusSchema = z.enum(['open', 'accepted', 'confirmed', 'cancelled', 'expired']);
export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

export const ChallengeSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  gameMode: GameModeSchema,
  timeControlKey: z.string(),
  timeControl: TimeControlSchema,
  wagerAmount: z.number(),
  minElo: z.number().nullable(),
  maxElo: z.number().nullable(),
  status: ChallengeStatusSchema,
  acceptedById: z.string().nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

// Challenge with creator info for display
export interface ChallengeWithCreator extends Challenge {
  creator: PublicUser;
  acceptedBy?: PublicUser;
}

// Spectator Prediction (P2P)
export const SpectatorPredictionStatusSchema = z.enum(['open', 'matched', 'settled', 'cancelled']);
export type SpectatorPredictionStatus = z.infer<typeof SpectatorPredictionStatusSchema>;

export const SpectatorPredictionSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  creatorId: z.string(),
  acceptorId: z.string().nullable(),
  predictedWinnerId: z.string(),
  amount: z.number().positive(),
  status: SpectatorPredictionStatusSchema,
  createdAt: z.date(),
  settledAt: z.date().nullable(),
});
export type SpectatorPrediction = z.infer<typeof SpectatorPredictionSchema>;

// Spectator Prediction with user info for display
export interface SpectatorPredictionWithUsers extends SpectatorPrediction {
  creator: PublicUser;
  acceptor?: PublicUser;
  predictedWinner: PublicUser;
}

// Profile types
export interface UserProfileData {
  isPublic: boolean;
  currentStreak: number;
  longestStreak: number;
  totalCheckmates: number;
  quickestWin: number | null;
  biggestWagerWin: number;
}

export interface AchievementProgress {
  id: string;
  unlocked: boolean;
  unlockedAt?: Date;
  progress: number;
}

// Re-export history types
export * from './history';

// Re-export feature flag types
export * from './flags';

// Re-export profile types
export * from './profile';

// Re-export analysis types
export * from './analysis';

// Re-export anti-cheat types
export * from './anticheat';
