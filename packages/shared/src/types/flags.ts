import { z } from 'zod';

// ============================================================================
// FEATURE FLAGS TYPES
// ============================================================================

/**
 * Feature flag schema for database storage and API responses
 */
export const FeatureFlagSchema = z.object({
  id: z.string(), // e.g., 'betting_enabled', 'matchmaking_v2'
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  metadata: z.record(z.unknown()).nullable(), // For future extensibility (rollout %, user segments)
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

/**
 * Simplified flag state for client-side usage
 * Maps flag IDs to their enabled state
 */
export type FeatureFlagState = Record<string, boolean>;

/**
 * Input for creating a new feature flag
 */
export const CreateFeatureFlagSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'Flag ID must start with a letter and contain only lowercase letters, numbers, and underscores'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateFeatureFlagInput = z.infer<typeof CreateFeatureFlagSchema>;

/**
 * Input for updating a feature flag
 */
export const UpdateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateFeatureFlagInput = z.infer<typeof UpdateFeatureFlagSchema>;

/**
 * API response for feature flags
 */
export interface FeatureFlagsResponse {
  flags: FeatureFlagState;
  fetchedAt: number; // timestamp for cache invalidation
}

/**
 * Known feature flag IDs (type-safe keys)
 * Add new flags here as you create them
 */
export type KnownFeatureFlag =
  | 'betting_enabled'
  | 'matchmaking_v2'
  | 'chess960_mode'
  | 'wallet_deposits'
  | 'wallet_withdrawals'
  | 'leaderboard_public'
  | 'achievements_enabled'
  | 'practice_mode'
  | 'challenge_marketplace'
  | 'spectator_mode'
  | 'spectator_predictions'
  | 'spectator_chat'
  | 'spectator_multi_game'
  | 'history_openings_tab'
  | 'analysis_board';

/**
 * Type-safe flag check helper type
 */
export interface FeatureFlagChecker {
  isEnabled(flagId: KnownFeatureFlag | string): boolean;
  getFlags(): FeatureFlagState;
  refresh(): Promise<void>;
}
