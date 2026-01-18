// Default values
export const DEFAULT_ELO = 1200;
export const DEFAULT_BALANCE = 1000;
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ELO calculation constants
export const ELO_K_FACTOR = 32;
export const ELO_DIVISOR = 400;
export const MAX_ELO_SEARCH_RANGE = 400;
export const ELO_SEARCH_EXPANSION_RATE = 50; // points per 10 seconds
export const ELO_SEARCH_EXPANSION_INTERVAL = 10000; // milliseconds

// Matchmaking constants
export const STAKE_TOLERANCE_PERCENT = 0.2; // 20% tolerance

// Betting constants
export const HOUSE_EDGE_SPECTATOR = 0.05; // 5%
export const HOUSE_EDGE_DRAW_REFUND = 0.10; // 10%
export const ELO_ODDS_WEIGHT = 0.7; // 70% weight for ELO in odds calculation
export const TIME_ODDS_WEIGHT = 0.3; // 30% weight for time remaining

// Time control presets (in seconds)
export const TIME_CONTROLS = {
  bullet: { initial: 60, increment: 0 },
  bullet_1_1: { initial: 60, increment: 1 },
  blitz_3: { initial: 180, increment: 0 },
  blitz_3_2: { initial: 180, increment: 2 },
  blitz_5: { initial: 300, increment: 0 },
  blitz_5_3: { initial: 300, increment: 3 },
  rapid_10: { initial: 600, increment: 0 },
  rapid_10_5: { initial: 600, increment: 5 },
  rapid_15_10: { initial: 900, increment: 10 },
  classical_30: { initial: 1800, increment: 0 },
} as const;

// Challenge marketplace time controls (simplified)
export const CHALLENGE_TIME_CONTROLS = {
  bullet_1: { initial: 60, increment: 0, label: '1 min' },
  blitz_3: { initial: 180, increment: 0, label: '3 min' },
  blitz_5: { initial: 300, increment: 0, label: '5 min' },
  rapid_10: { initial: 600, increment: 0, label: '10 min' },
  rapid_15: { initial: 900, increment: 0, label: '15 min' },
  classical_30: { initial: 1800, increment: 0, label: '30 min' },
} as const;

export type ChallengeTimeControlKey = keyof typeof CHALLENGE_TIME_CONTROLS;

// Stake presets
export const STAKE_PRESETS = [10, 25, 50, 100, 250, 500, 1000];

// Minimum and maximum stakes
export const MIN_STAKE = 10;
export const MAX_STAKE = 10000;
export const MIN_BET = 5;
export const MAX_BET = 5000;

// Clock sync interval
export const CLOCK_SYNC_INTERVAL = 1000; // 1 second

// Reconnection settings
export const RECONNECT_TIMEOUT = 60000; // 60 seconds to reconnect
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_DELAY_BASE = 1000; // exponential backoff base

// Game abandonment
export const ABANDONMENT_TIMEOUT = 120000; // 2 minutes disconnect = abandonment

// Challenge marketplace
export const CHALLENGE_EXPIRATION = 30 * 60 * 1000; // 30 minutes
export const CHALLENGE_CONFIRM_TIMEOUT = 60 * 1000; // 60 seconds to confirm after acceptance

// WebSocket
export const WS_PING_INTERVAL = 30000; // 30 seconds
export const WS_PONG_TIMEOUT = 10000; // 10 seconds

// API routes
export const API_ROUTES = {
  AUTH: {
    REGISTER: '/api/auth/register',
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
    OAUTH_GOOGLE: '/api/auth/oauth/google',
    OAUTH_GITHUB: '/api/auth/oauth/github',
  },
  USERS: {
    PROFILE: '/api/users/:id',
    STATS: '/api/users/:id/stats',
  },
  MATCHMAKING: {
    JOIN: '/api/matchmaking/join',
    LEAVE: '/api/matchmaking/leave',
    STATUS: '/api/matchmaking/status',
  },
  GAMES: {
    LIST: '/api/games',
    GET: '/api/games/:id',
    ACTIVE: '/api/games/active',
    HISTORY: '/api/games/history',
  },
  BETTING: {
    PLACE: '/api/betting/place',
    HISTORY: '/api/betting/history',
    ODDS: '/api/betting/odds/:gameId',
  },
  WALLET: {
    BALANCE: '/api/wallet/balance',
    TRANSACTIONS: '/api/wallet/transactions',
  },
  LEADERBOARD: {
    ELO: '/api/leaderboard/elo',
    WINNINGS: '/api/leaderboard/winnings',
  },
  PROFILE: {
    GET: '/api/profile',
    UPDATE: '/api/profile',
    ACHIEVEMENTS: '/api/profile/achievements',
  },
} as const;

// Re-export rank and achievement constants
export * from './ranks';
export * from './achievements';
