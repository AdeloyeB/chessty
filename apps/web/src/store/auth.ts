import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser } from '@chess-game/shared';

interface UserWithBalance extends PublicUser {
  email: string;
  balance: number;
}

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
      user: null,
      token: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, token: null, isLoading: false }),
    }),
    {
      name: 'chess-game-auth',
      partialize: (state) => ({ token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setLoading(false);
        }
      },
    }
  )
);
