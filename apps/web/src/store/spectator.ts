import { create } from 'zustand';
import type { PublicUser } from '@chess-game/shared';

interface SpectatorState {
  isSpectating: boolean;
  gameId: string | null;
  whitePlayer: PublicUser | null;
  blackPlayer: PublicUser | null;
  currentFen: string;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  whiteOdds: number;
  blackOdds: number;
  spectatorCount: number;

  // Actions
  startSpectating: (gameId: string) => void;
  stopSpectating: () => void;
  setPlayers: (white: PublicUser, black: PublicUser) => void;
  updateGameState: (fen: string, whiteTime: number, blackTime: number) => void;
  updateOdds: (whiteOdds: number, blackOdds: number) => void;
  setSpectatorCount: (count: number) => void;
}

export const useSpectatorStore = create<SpectatorState>((set) => ({
  isSpectating: false,
  gameId: null,
  whitePlayer: null,
  blackPlayer: null,
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  whiteTimeRemaining: 0,
  blackTimeRemaining: 0,
  whiteOdds: 1,
  blackOdds: 1,
  spectatorCount: 0,

  startSpectating: (gameId) => set({ isSpectating: true, gameId }),

  stopSpectating: () =>
    set({
      isSpectating: false,
      gameId: null,
      whitePlayer: null,
      blackPlayer: null,
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      whiteTimeRemaining: 0,
      blackTimeRemaining: 0,
      whiteOdds: 1,
      blackOdds: 1,
    }),

  setPlayers: (white, black) =>
    set({ whitePlayer: white, blackPlayer: black }),

  updateGameState: (fen, whiteTime, blackTime) =>
    set({
      currentFen: fen,
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime,
    }),

  updateOdds: (whiteOdds, blackOdds) =>
    set({ whiteOdds, blackOdds }),

  setSpectatorCount: (count) => set({ spectatorCount: count }),
}));
