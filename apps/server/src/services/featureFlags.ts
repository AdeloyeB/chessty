import { eq } from 'drizzle-orm';
import { db, featureFlags } from '../drizzle';
import type { FeatureFlagState, KnownFeatureFlag } from '@chess-game/shared';
import { DEFAULT_FEATURE_FLAGS } from '@chess-game/shared';

// ============================================================================
// FEATURE FLAGS SERVICE
// See docs/Feature-Flags.md for usage and migration guide
// ============================================================================

/**
 * In-memory cache for feature flags
 * This avoids hitting the database on every flag check
 */
let flagCache: FeatureFlagState = {};
let cacheInitialized = false;

/**
 * Initialize feature flags in the database
 * Seeds default flags if they don't exist
 */
export async function initializeFeatureFlags(): Promise<void> {
  const now = new Date();

  for (const [id, config] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(featureFlags).values({
        id,
        name: config.name,
        description: config.description,
        enabled: config.enabled ? 1 : 0,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[FeatureFlags] Created flag: ${id} (enabled: ${config.enabled})`);
    }
  }

  // Load flags into cache
  await refreshFlagCache();
  console.log('[FeatureFlags] Initialized with', Object.keys(flagCache).length, 'flags');
}

/**
 * Refresh the in-memory cache from database
 */
export async function refreshFlagCache(): Promise<void> {
  const allFlags = await db.select().from(featureFlags);

  const newCache: FeatureFlagState = {};
  for (const flag of allFlags) {
    newCache[flag.id] = flag.enabled === 1;
  }

  flagCache = newCache;
  cacheInitialized = true;
}

/**
 * Check if a feature flag is enabled
 *
 * @example
 * ```ts
 * if (isFeatureEnabled('betting_enabled')) {
 *   // Process bet
 * }
 * ```
 */
export function isFeatureEnabled(flagId: KnownFeatureFlag | string): boolean {
  if (!cacheInitialized) {
    console.warn('[FeatureFlags] Cache not initialized, using default value');
    const defaultFlag = DEFAULT_FEATURE_FLAGS[flagId as keyof typeof DEFAULT_FEATURE_FLAGS];
    return defaultFlag?.enabled ?? false;
  }

  return flagCache[flagId] ?? false;
}

/**
 * Get all feature flags as a state object
 */
export function getAllFlags(): FeatureFlagState {
  if (!cacheInitialized) {
    // Return defaults if cache not ready
    const defaults: FeatureFlagState = {};
    for (const [id, config] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      defaults[id] = config.enabled;
    }
    return defaults;
  }

  return { ...flagCache };
}

/**
 * Get a single feature flag's full details
 */
export async function getFlag(flagId: string) {
  const result = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.id, flagId))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Update a feature flag's enabled state
 * Refreshes cache after update
 */
export async function updateFlag(
  flagId: string,
  updates: { enabled?: boolean; name?: string; description?: string }
): Promise<boolean> {
  const existing = await getFlag(flagId);
  if (!existing) {
    return false;
  }

  await db
    .update(featureFlags)
    .set({
      ...(updates.enabled !== undefined && { enabled: updates.enabled ? 1 : 0 }),
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      updatedAt: new Date(),
    })
    .where(eq(featureFlags.id, flagId));

  // Refresh cache after update
  await refreshFlagCache();

  console.log(`[FeatureFlags] Updated flag: ${flagId}`, updates);
  return true;
}

/**
 * Create a new feature flag (for runtime flag creation)
 */
export async function createFlag(
  id: string,
  name: string,
  description: string | null,
  enabled: boolean = false
): Promise<boolean> {
  const existing = await getFlag(id);
  if (existing) {
    return false;
  }

  const now = new Date();
  await db.insert(featureFlags).values({
    id,
    name,
    description,
    enabled: enabled ? 1 : 0,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  });

  // Refresh cache after creation
  await refreshFlagCache();

  console.log(`[FeatureFlags] Created flag: ${id} (enabled: ${enabled})`);
  return true;
}

/**
 * Feature flag check middleware/guard for routes
 *
 * @example
 * ```ts
 * // In route handler
 * if (!requireFeature('betting_enabled')) {
 *   return new Response(JSON.stringify({
 *     success: false,
 *     error: { code: 'FEATURE_DISABLED', message: 'This feature is currently disabled' }
 *   }), { status: 403 });
 * }
 * ```
 */
export function requireFeature(flagId: KnownFeatureFlag | string): boolean {
  return isFeatureEnabled(flagId);
}
