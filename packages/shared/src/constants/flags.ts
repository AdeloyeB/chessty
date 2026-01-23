// ============================================================================
// FEATURE FLAGS CONSTANTS
// ============================================================================

/**
 * Default feature flag definitions
 * These are seeded into the database when the server starts
 *
 * Flag naming convention:
 *   {category}_{feature}_{variant?}
 *
 * Categories:
 *   - betting_     : Betting/wagering features
 *   - matchmaking_ : Game matching features
 *   - ui_          : UI/UX changes
 *   - experiment_  : A/B tests
 *   - admin_       : Admin-only features
 *   - debug_       : Development/debugging
 */
export const DEFAULT_FEATURE_FLAGS = {
  // Core gameplay features
  betting_enabled: {
    name: 'Betting System',
    description: 'Enable the betting system for players to wager on games',
    enabled: true,
  },
  matchmaking_v2: {
    name: 'Matchmaking V2',
    description: 'Use the new matchmaking algorithm with improved ELO matching',
    enabled: false,
  },
  spectator_predictions: {
    name: 'Spectator Predictions',
    description: 'Allow spectators to place P2P predictions on game outcomes',
    enabled: true,
  },
  chess960_mode: {
    name: 'Chess960 Mode',
    description: 'Enable Chess960 (Fischer Random) game mode',
    enabled: true,
  },

  // Wallet features
  wallet_deposits: {
    name: 'Wallet Deposits',
    description: 'Allow users to deposit funds into their wallet',
    enabled: false, // Disabled until payment integration
  },
  wallet_withdrawals: {
    name: 'Wallet Withdrawals',
    description: 'Allow users to withdraw funds from their wallet',
    enabled: false, // Disabled until payment integration
  },

  // Social features
  leaderboard_public: {
    name: 'Public Leaderboard',
    description: 'Show the leaderboard to all users (including non-logged in)',
    enabled: true,
  },
  achievements_enabled: {
    name: 'Achievements System',
    description: 'Enable the achievements and badges system',
    enabled: true,
  },

  // Game modes
  practice_mode: {
    name: 'Practice Mode',
    description: 'Enable local practice mode against yourself or analysis board',
    enabled: true,
  },
  challenge_marketplace: {
    name: 'Challenge Marketplace',
    description: 'Enable the challenge marketplace for creating and accepting challenges',
    enabled: true,
  },
} as const;

export type DefaultFeatureFlagId = keyof typeof DEFAULT_FEATURE_FLAGS;

/**
 * Feature flag categories for organization
 */
export const FEATURE_FLAG_CATEGORIES = {
  CORE: ['betting_enabled', 'matchmaking_v2', 'spectator_predictions', 'chess960_mode'],
  WALLET: ['wallet_deposits', 'wallet_withdrawals'],
  SOCIAL: ['leaderboard_public', 'achievements_enabled'],
  GAME_MODES: ['practice_mode', 'challenge_marketplace'],
} as const;

/**
 * Cache duration for feature flags (in milliseconds)
 * Flags are cached client-side to reduce API calls
 */
export const FEATURE_FLAG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * API routes for feature flags
 */
export const FEATURE_FLAG_ROUTES = {
  LIST: '/api/flags',
  GET: '/api/flags/:id',
  UPDATE: '/api/flags/:id', // PATCH
} as const;
