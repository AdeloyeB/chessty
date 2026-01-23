import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeatureFlagState, KnownFeatureFlag } from '@chess-game/shared';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAG_CACHE_DURATION } from '@chess-game/shared';

// ============================================================================
// FEATURE FLAGS STORE
// See docs/Feature-Flags.md for usage and migration guide
// ============================================================================

interface FeatureFlagsState {
  // State
  flags: FeatureFlagState;
  lastFetchedAt: number | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  isEnabled: (flagId: KnownFeatureFlag | string) => boolean;
  setFlags: (flags: FeatureFlagState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refresh: () => Promise<void>;
  isCacheValid: () => boolean;
}

/**
 * Convert default flags to initial state
 */
const getDefaultFlagState = (): FeatureFlagState => {
  const state: FeatureFlagState = {};
  for (const [id, config] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    state[id] = config.enabled;
  }
  return state;
};

/**
 * Feature Flags Store
 *
 * Usage in components:
 * ```tsx
 * import { useFeatureFlags } from '@/store/flags';
 *
 * function MyComponent() {
 *   const { isEnabled } = useFeatureFlags();
 *
 *   if (isEnabled('betting_enabled')) {
 *     return <BettingUI />;
 *   }
 *   return <BettingDisabledMessage />;
 * }
 * ```
 *
 * To refresh flags (e.g., on app mount):
 * ```tsx
 * const { refresh, isCacheValid } = useFeatureFlags();
 *
 * useEffect(() => {
 *   if (!isCacheValid()) {
 *     refresh();
 *   }
 * }, []);
 * ```
 */
export const useFeatureFlags = create<FeatureFlagsState>()(
  persist(
    (set, get) => ({
      // Initial state - use defaults until server flags are fetched
      flags: getDefaultFlagState(),
      lastFetchedAt: null,
      isLoading: false,
      error: null,

      // Check if a flag is enabled
      isEnabled: (flagId: KnownFeatureFlag | string): boolean => {
        const { flags } = get();
        // Return the flag value if it exists, otherwise default to false
        return flags[flagId] ?? false;
      },

      // Set flags from API response
      setFlags: (flags: FeatureFlagState) =>
        set({
          flags,
          lastFetchedAt: Date.now(),
          isLoading: false,
          error: null,
        }),

      setLoading: (isLoading: boolean) => set({ isLoading }),
      setError: (error: string | null) => set({ error, isLoading: false }),

      // Check if cache is still valid
      isCacheValid: (): boolean => {
        const { lastFetchedAt } = get();
        if (!lastFetchedAt) return false;
        return Date.now() - lastFetchedAt < FEATURE_FLAG_CACHE_DURATION;
      },

      // Fetch flags from server
      refresh: async () => {
        const state = get();

        // Don't refetch if already loading
        if (state.isLoading) return;

        set({ isLoading: true, error: null });

        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
          const response = await fetch(`${apiUrl}/api/flags`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch flags: ${response.status}`);
          }

          const data = await response.json();

          if (data.success && data.data?.flags) {
            set({
              flags: data.data.flags,
              lastFetchedAt: Date.now(),
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(data.error?.message || 'Invalid response format');
          }
        } catch (error) {
          console.error('[FeatureFlags] Failed to fetch flags:', error);
          // Keep existing flags on error, just update error state
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch flags',
          });
        }
      },
    }),
    {
      name: 'chess-game-feature-flags',
      // Only persist flags and lastFetchedAt
      partialize: (state) => ({
        flags: state.flags,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);

/**
 * Hook for checking a single flag (convenience)
 *
 * Usage:
 * ```tsx
 * const isBettingEnabled = useFeatureFlag('betting_enabled');
 * ```
 */
export function useFeatureFlag(flagId: KnownFeatureFlag | string): boolean {
  return useFeatureFlags((state) => state.isEnabled(flagId));
}

/**
 * Selector for multiple flags
 *
 * Usage:
 * ```tsx
 * const flags = useFeatureFlagsSelected(['betting_enabled', 'chess960_mode']);
 * // flags = { betting_enabled: true, chess960_mode: true }
 * ```
 */
export function useFeatureFlagsSelected(
  flagIds: (KnownFeatureFlag | string)[]
): FeatureFlagState {
  return useFeatureFlags((state) => {
    const result: FeatureFlagState = {};
    for (const id of flagIds) {
      result[id] = state.isEnabled(id);
    }
    return result;
  });
}
