'use client';

/**
 * useProfileData Hook
 *
 * React Query wrapper for fetching and caching profile data.
 * Provides loading states, error handling, and cache invalidation.
 *
 * ★ Insight ─────────────────────────────────────
 * React Query handles caching, refetching, and stale data automatically.
 * - staleTime: How long data is considered fresh (no refetch)
 * - cacheTime: How long data stays in cache after component unmounts
 * - refetchOnWindowFocus: Useful for keeping data fresh when user returns
 * ─────────────────────────────────────────────────
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from './useApi';
import type { ProfileResponse, PublicProfileResponse, UpdateProfileInput } from '@chess-game/shared';

// Query key factory for consistent cache keys
export const profileKeys = {
  all: ['profile'] as const,
  detail: () => [...profileKeys.all, 'detail'] as const,
  public: (userId: string) => [...profileKeys.all, 'public', userId] as const,
};

/**
 * Hook to fetch current user's profile
 */
export function useProfile() {
  const { getProfile } = useApi();

  return useQuery({
    queryKey: profileKeys.detail(),
    queryFn: getProfile,
    staleTime: 60 * 1000, // 1 minute - profile data doesn't change frequently
    refetchOnWindowFocus: false, // Don't spam API on tab focus
  });
}

/**
 * Hook to fetch another user's public profile
 */
export function usePublicProfile(userId: string | undefined) {
  const { getPublicProfile } = useApi();

  return useQuery({
    queryKey: profileKeys.public(userId || ''),
    queryFn: () => getPublicProfile(userId!),
    enabled: !!userId, // Only fetch if userId is provided
    staleTime: 2 * 60 * 1000, // 2 minutes - public profiles change less often
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to update profile settings (visibility, etc.)
 *
 * ★ Insight ─────────────────────────────────────
 * useMutation handles the update request with:
 * - onMutate: Called before mutation (for optimistic updates)
 * - onError: Rollback on failure
 * - onSettled: Invalidate cache to refetch fresh data
 * ─────────────────────────────────────────────────
 */
export function useUpdateProfile() {
  const { updateProfile } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileInput) => updateProfile(data),

    // Optimistic update - update cache immediately before API response
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: profileKeys.detail() });

      // Snapshot previous value for rollback
      const previousProfile = queryClient.getQueryData<ProfileResponse>(profileKeys.detail());

      // Optimistically update cache
      if (previousProfile && newData.isPublic !== undefined) {
        queryClient.setQueryData<ProfileResponse>(profileKeys.detail(), {
          ...previousProfile,
          profile: {
            ...previousProfile.profile,
            isPublic: newData.isPublic,
          },
        });
      }

      return { previousProfile };
    },

    // Rollback on error
    onError: (_error, _variables, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(), context.previousProfile);
      }
    },

    // Refetch after mutation to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() });
    },
  });
}

/**
 * Convenience hook combining profile data with mutation
 */
export function useProfileData() {
  const profile = useProfile();
  const updateMutation = useUpdateProfile();

  return {
    // Profile data
    profile: profile.data,
    isLoading: profile.isLoading,
    isError: profile.isError,
    error: profile.error,

    // Computed convenience values
    user: profile.data?.user,
    rank: profile.data?.rank,
    profileData: profile.data?.profile,
    achievements: profile.data?.achievements,
    stats: profile.data?.stats,

    // Mutation
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Refetch
    refetch: profile.refetch,
  };
}
