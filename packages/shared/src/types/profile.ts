/**
 * Profile API Types
 *
 * These types define the shape of profile-related API responses.
 * Used by both frontend (useApi, useProfileData) and backend (routes/profile.ts).
 */

import type { RankTier } from '../constants/ranks';
import type { UserProfileData, AchievementProgress } from './index';
import type { AchievementCategory } from '../constants/achievements';

// User data as returned by profile API
export interface ProfileUser {
  id: string;
  username: string;
  eloRating: number;
  peakEloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  totalWagered: number;
  totalWon: number;
  createdAt: Date | string;
}

// Rank information computed from ELO
export interface ProfileRank {
  current: RankTier;
  next: RankTier | null;
  progressToNext: number;
}

// Achievement statistics
export interface ProfileStats {
  totalAchievements: number;
  unlockedAchievements: number;
}

// Full profile API response
export interface ProfileResponse {
  user: ProfileUser;
  rank: ProfileRank;
  profile: UserProfileData;
  achievements: AchievementProgress[];
  stats: ProfileStats;
}

// Public profile (when viewing another user)
export interface PublicProfileResponse extends ProfileResponse {
  isPrivate: boolean;
}

// Input for updating profile settings
export interface UpdateProfileInput {
  isPublic?: boolean;
}

// Achievement unlock notification payload (for WebSocket)
export interface AchievementUnlockedPayload {
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AchievementCategory;
    unlockedAt: Date | string;
  }>;
}
