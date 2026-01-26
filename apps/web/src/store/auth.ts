import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser } from '@chess-game/shared';
import { USE_MOCK_DATA } from '@/lib/mock/mockData';

interface UserWithBalance extends PublicUser {
  email: string;
  balance: number;
}

// Mock user for development
const MOCK_USER: UserWithBalance = {
  id: 'mock-user-1',
  username: 'DemoPlayer',
  email: 'demo@chessgame.dev',
  eloRating: 1850,
  peakEloRating: 1920,
  gamesPlayed: 247,
  gamesWon: 142,
  gamesLost: 89,
  gamesDraw: 16,
  balance: 1250.00,
};

interface AuthState {
  user: UserWithBalance | null;
  token: string | null;
  isLoading: boolean;
  // MFA state - not persisted to localStorage
  mfaRequired: boolean;
  tempToken: string | null;
  setUser: (user: UserWithBalance | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setMfaRequired: (required: boolean, tempToken?: string) => void;
  clearMfaState: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: USE_MOCK_DATA ? MOCK_USER : null,
      token: USE_MOCK_DATA ? 'mock-token-for-development' : null,
      isLoading: false,
      // MFA state - starts clean (not persisted)
      mfaRequired: false,
      tempToken: null,
      setUser: (user) => set({ user, isLoading: false }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      setMfaRequired: (required, tempToken) =>
        set({ mfaRequired: required, tempToken: tempToken || null }),
      clearMfaState: () => set({ mfaRequired: false, tempToken: null }),
      logout: () =>
        set({
          user: USE_MOCK_DATA ? MOCK_USER : null,
          token: USE_MOCK_DATA ? 'mock-token-for-development' : null,
          isLoading: false,
          mfaRequired: false,
          tempToken: null,
        }),
    }),
    {
      name: 'chess-game-auth',
      // Only persist the token - MFA temp state should NOT be persisted
      partialize: (state) => (USE_MOCK_DATA ? {} : { token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setLoading(false);
          // Clear any MFA state on rehydration (page refresh)
          state.clearMfaState();
          // If using mock data, always set mock user
          if (USE_MOCK_DATA) {
            state.setUser(MOCK_USER);
            state.setToken('mock-token-for-development');
          }
        }
      },
    }
  )
);
