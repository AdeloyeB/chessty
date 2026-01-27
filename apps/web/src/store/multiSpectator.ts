import { create } from 'zustand';
import type { PublicUser } from '@chess-game/shared';

/**
 * State for a single spectated game.
 * The multi-spectator store holds a Record of these, keyed by gameId.
 */
export interface SpectatedGameState {
  gameId: string;
  whitePlayer: PublicUser | null;
  blackPlayer: PublicUser | null;
  currentFen: string;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  whiteOdds: number;
  blackOdds: number;
  spectatorCount: number;
  status: 'active' | 'ended';
}

/** Maximum number of games that can be in the multi-game grid */
const MAX_GRID_GAMES = 5;

interface MultiSpectatorState {
  // --- Data ---
  games: Record<string, SpectatedGameState>;  // All spectated games, keyed by gameId
  viewMode: 'single' | 'multi';              // Current content area mode
  focusedGameId: string | null;              // Which game is shown full-screen in single mode
  gridGameIds: string[];                     // Ordered list of games in the multi-game grid (max 5)

  // --- Navigation Actions ---
  addGame: (gameId: string) => void;         // Start spectating a new game (creates slot in sub-nav)
  removeGame: (gameId: string) => void;      // Stop spectating (removes from sub-nav + grid)
  removeAllGames: () => void;                // Stop spectating everything
  setFocusedGame: (gameId: string) => void;  // Click a sub-nav tile → show full-screen
  addToGrid: (gameId: string) => void;       // Drag tile into grid → add to multi-game view
  removeFromGrid: (gameId: string) => void;  // Remove from grid (keep in sub-nav)
  reorderGrid: (gameIds: string[]) => void;  // Reorder grid items after drag
  setViewMode: (mode: 'single' | 'multi') => void;

  // --- Per-game state updates (called from WebSocket events, keyed by gameId) ---
  setGamePlayers: (gameId: string, white: PublicUser, black: PublicUser) => void;
  updateGameState: (gameId: string, fen: string, whiteTime: number, blackTime: number) => void;
  updateGameOdds: (gameId: string, whiteOdds: number, blackOdds: number) => void;
  setGameEnded: (gameId: string) => void;
  setGameSpectatorCount: (gameId: string, count: number) => void;

  // --- Helpers ---
  getGameCount: () => number;
  hasGame: (gameId: string) => boolean;
}

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const useMultiSpectatorStore = create<MultiSpectatorState>((set, get) => ({
  games: {},
  viewMode: 'single',
  focusedGameId: null,
  gridGameIds: [],

  // --- Navigation Actions ---

  addGame: (gameId) => set((state) => {
    // Already spectating this game — just focus it
    if (state.games[gameId]) {
      return { focusedGameId: gameId, viewMode: 'single' };
    }

    // Enforce max 5 concurrent games
    const currentCount = Object.keys(state.games).length;
    if (currentCount >= MAX_GRID_GAMES) {
      return state; // Silently ignore — server will also reject
    }

    const newGame: SpectatedGameState = {
      gameId,
      whitePlayer: null,
      blackPlayer: null,
      currentFen: DEFAULT_FEN,
      whiteTimeRemaining: 0,
      blackTimeRemaining: 0,
      whiteOdds: 1,
      blackOdds: 1,
      spectatorCount: 0,
      status: 'active',
    };

    return {
      games: { ...state.games, [gameId]: newGame },
      focusedGameId: gameId,
      viewMode: 'single',
    };
  }),

  removeGame: (gameId) => set((state) => {
    const { [gameId]: _, ...remaining } = state.games;
    const newGridIds = state.gridGameIds.filter((id) => id !== gameId);
    const gameIds = Object.keys(remaining);

    // If we removed the focused game, focus the first remaining one (or null)
    let newFocusedId = state.focusedGameId;
    if (state.focusedGameId === gameId) {
      newFocusedId = gameIds[0] ?? null;
    }

    // If grid is now empty, switch back to single mode
    const newViewMode = newGridIds.length === 0 ? 'single' : state.viewMode;

    return {
      games: remaining,
      gridGameIds: newGridIds,
      focusedGameId: newFocusedId,
      viewMode: newViewMode,
    };
  }),

  removeAllGames: () => set({
    games: {},
    viewMode: 'single',
    focusedGameId: null,
    gridGameIds: [],
  }),

  setFocusedGame: (gameId) => set((state) => {
    if (!state.games[gameId]) return state;
    return { focusedGameId: gameId, viewMode: 'single' };
  }),

  addToGrid: (gameId) => set((state) => {
    if (!state.games[gameId]) return state;
    if (state.gridGameIds.includes(gameId)) return state;
    if (state.gridGameIds.length >= MAX_GRID_GAMES) return state;

    const newGridIds = [...state.gridGameIds, gameId];
    return {
      gridGameIds: newGridIds,
      viewMode: 'multi',
    };
  }),

  removeFromGrid: (gameId) => set((state) => {
    const newGridIds = state.gridGameIds.filter((id) => id !== gameId);
    return {
      gridGameIds: newGridIds,
      viewMode: newGridIds.length === 0 ? 'single' : state.viewMode,
    };
  }),

  reorderGrid: (gameIds) => set({ gridGameIds: gameIds }),

  setViewMode: (mode) => set({ viewMode: mode }),

  // --- Per-game state updates ---

  setGamePlayers: (gameId, white, black) => set((state) => {
    const game = state.games[gameId];
    if (!game) return state;
    return {
      games: {
        ...state.games,
        [gameId]: { ...game, whitePlayer: white, blackPlayer: black },
      },
    };
  }),

  updateGameState: (gameId, fen, whiteTime, blackTime) => set((state) => {
    const game = state.games[gameId];
    if (!game) return state;
    return {
      games: {
        ...state.games,
        [gameId]: {
          ...game,
          currentFen: fen,
          whiteTimeRemaining: whiteTime,
          blackTimeRemaining: blackTime,
        },
      },
    };
  }),

  updateGameOdds: (gameId, whiteOdds, blackOdds) => set((state) => {
    const game = state.games[gameId];
    if (!game) return state;
    return {
      games: {
        ...state.games,
        [gameId]: { ...game, whiteOdds, blackOdds },
      },
    };
  }),

  setGameEnded: (gameId) => set((state) => {
    const game = state.games[gameId];
    if (!game) return state;
    return {
      games: {
        ...state.games,
        [gameId]: { ...game, status: 'ended' },
      },
    };
  }),

  setGameSpectatorCount: (gameId, count) => set((state) => {
    const game = state.games[gameId];
    if (!game) return state;
    return {
      games: {
        ...state.games,
        [gameId]: { ...game, spectatorCount: count },
      },
    };
  }),

  // --- Helpers ---

  getGameCount: () => Object.keys(get().games).length,
  hasGame: (gameId) => gameId in get().games,
}));
