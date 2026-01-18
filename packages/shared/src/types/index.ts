import { z } from 'zod';

// User types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().min(3).max(20),
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
  'id' | 'username' | 'eloRating' | 'peakEloRating' | 'gamesPlayed' | 'gamesWon' | 'gamesLost' | 'gamesDraw'
>;

// Game types
export const GameStatusSchema = z.enum(['pending', 'active', 'completed', 'abandoned', 'draw']);
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
  stakeAmount: z.number(),
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
  'game_stake',
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
  stakeAmount: z.number(),
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
  'bet:place',
  // Server -> Client
  'game:started',
  'game:move_made',
  'game:ended',
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
  stakeAmount: number;
  timeControl: TimeControl;
  minElo?: number;
  maxElo?: number;
}

export interface SpectateJoinPayload {
  gameId: string;
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
  stakeAmount: number;
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

// Auth types
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(8),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export interface AuthResponse {
  user: PublicUser & { email: string; balance: number };
  token: string;
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
