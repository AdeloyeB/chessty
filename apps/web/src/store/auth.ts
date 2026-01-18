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
  setUser: (user: UserWithBalance | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: USE_MOCK_DATA ? MOCK_USER : null,
      token: USE_MOCK_DATA ? 'mock-token-for-development' : null,
      isLoading: false,
      setUser: (user) => set({ user, isLoading: false }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: USE_MOCK_DATA ? MOCK_USER : null, token: USE_MOCK_DATA ? 'mock-token-for-development' : null, isLoading: false }),
    }),
    {
      name: 'chess-game-auth',
      partialize: (state) => USE_MOCK_DATA ? {} : { token: state.token }, // Don't persist when using mock data
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setLoading(false);
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
