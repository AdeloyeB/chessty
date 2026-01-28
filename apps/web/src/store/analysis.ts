/**
 * Analysis Store
 * ==============
 *
 * Zustand store for managing chess game analysis state.
 *
 * WHAT THIS DOES:
 * - Caches GameAnalysis results by game ID (avoid re-analyzing)
 * - Tracks which game is currently being analyzed
 * - Tracks analysis progress for UI feedback
 *
 * WHY WE CACHE:
 * Engine analysis is expensive (takes seconds to minutes).
 * Once we analyze a game, we cache the result so:
 * - Navigating away and back doesn't re-analyze
 * - Multiple components can access the same analysis
 * - Users don't wait multiple times for the same game
 *
 * USAGE:
 * ```tsx
 * import { useAnalysisStore } from '@/store/analysis';
 *
 * function AnalysisBoard() {
 *   const { getAnalysis, progress, isAnalyzing } = useAnalysisStore();
 *
 *   const analysis = getAnalysis('game-123');
 *
 *   if (isAnalyzing) {
 *     return <ProgressBar current={progress.current} total={progress.total} />;
 *   }
 *
 *   if (!analysis) {
 *     return <StartAnalysisButton />;
 *   }
 *
 *   return <AnalysisResults analysis={analysis} />;
 * }
 * ```
 */

import { create } from 'zustand';
import type { GameAnalysis } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Progress state during analysis.
 *
 * Used to show a progress bar to the user while analyzing.
 */
export interface AnalysisProgress {
  /** Current position being analyzed (1-indexed for display) */
  current: number;

  /** Total positions to analyze */
  total: number;
}

/**
 * Analysis store state and actions.
 */
interface AnalysisState {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /**
   * Cache of completed analyses, keyed by game ID.
   *
   * Once a game is analyzed, we store the result here so it doesn't
   * need to be re-analyzed if the user navigates away and back.
   */
  cache: Map<string, GameAnalysis>;

  /**
   * ID of the game currently being analyzed, or null if not analyzing.
   *
   * Used to:
   * - Show loading state in the UI
   * - Prevent starting multiple analyses simultaneously
   * - Associate progress updates with the correct game
   */
  analyzingGameId: string | null;

  /**
   * Current analysis progress.
   *
   * Updated as each position is analyzed.
   * Reset when analysis starts or completes.
   */
  progress: AnalysisProgress;

  // ---------------------------------------------------------------------------
  // Computed/Derived (technically getters in Zustand)
  // ---------------------------------------------------------------------------

  /**
   * Whether any analysis is currently in progress.
   * Convenience getter so components don't check analyzingGameId directly.
   */
  isAnalyzing: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Store a completed analysis in the cache.
   *
   * @param analysis - The completed GameAnalysis to cache
   */
  setAnalysis: (analysis: GameAnalysis) => void;

  /**
   * Get a cached analysis by game ID.
   *
   * @param gameId - ID of the game to look up
   * @returns The cached GameAnalysis, or null if not cached
   */
  getAnalysis: (gameId: string) => GameAnalysis | null;

  /**
   * Check if a game has been analyzed (exists in cache).
   *
   * @param gameId - ID of the game to check
   * @returns True if the game is in the cache
   */
  hasAnalysis: (gameId: string) => boolean;

  /**
   * Set the currently analyzing game ID.
   *
   * Call with the game ID when starting analysis.
   * Call with null when analysis completes (or fails).
   *
   * @param gameId - Game ID being analyzed, or null to clear
   */
  setAnalyzing: (gameId: string | null) => void;

  /**
   * Update analysis progress.
   *
   * Called during analysis as each position is processed.
   *
   * @param progress - Current progress state
   */
  setProgress: (progress: AnalysisProgress) => void;

  /**
   * Remove a specific game's analysis from the cache.
   *
   * Useful if you want to force re-analysis of a game.
   *
   * @param gameId - ID of the game to remove from cache
   */
  clearAnalysis: (gameId: string) => void;

  /**
   * Clear all cached analyses and reset state.
   *
   * Useful on logout or when you want a fresh start.
   */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const initialProgress: AnalysisProgress = {
  current: 0,
  total: 0,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Analysis store for managing game analysis state.
 *
 * This store handles:
 * - Caching analyzed games (so we don't re-analyze on navigation)
 * - Tracking analysis progress (for progress bar UI)
 * - Tracking which game is being analyzed (for loading states)
 *
 * @example
 * ```tsx
 * // In a component
 * const { getAnalysis, setAnalysis, isAnalyzing, progress } = useAnalysisStore();
 *
 * // Check cache first
 * const cached = getAnalysis(gameId);
 * if (cached) {
 *   // Use cached analysis
 *   return <AnalysisView analysis={cached} />;
 * }
 *
 * // Start new analysis
 * async function analyze() {
 *   setAnalyzing(gameId);
 *   try {
 *     const result = await runAnalysis(gameId, (current, total) => {
 *       setProgress({ current, total });
 *     });
 *     setAnalysis(result);
 *   } finally {
 *     setAnalyzing(null);
 *   }
 * }
 * ```
 */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------

  cache: new Map(),
  analyzingGameId: null,
  progress: initialProgress,

  // Computed property - derived from analyzingGameId
  get isAnalyzing() {
    return get().analyzingGameId !== null;
  },

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  setAnalysis: (analysis: GameAnalysis) => {
    set((state) => {
      // Create a new Map to trigger re-render
      const newCache = new Map(state.cache);
      newCache.set(analysis.gameId, analysis);
      return {
        cache: newCache,
        // Clear analyzing state if this was the game being analyzed
        analyzingGameId:
          state.analyzingGameId === analysis.gameId
            ? null
            : state.analyzingGameId,
        // Reset progress when analysis completes
        progress:
          state.analyzingGameId === analysis.gameId
            ? initialProgress
            : state.progress,
      };
    });
  },

  getAnalysis: (gameId: string) => {
    return get().cache.get(gameId) ?? null;
  },

  hasAnalysis: (gameId: string) => {
    return get().cache.has(gameId);
  },

  setAnalyzing: (gameId: string | null) => {
    set({
      analyzingGameId: gameId,
      // Reset progress when starting new analysis
      progress: gameId ? initialProgress : get().progress,
    });
  },

  setProgress: (progress: AnalysisProgress) => {
    set({ progress });
  },

  clearAnalysis: (gameId: string) => {
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.delete(gameId);
      return { cache: newCache };
    });
  },

  clearAll: () => {
    set({
      cache: new Map(),
      analyzingGameId: null,
      progress: initialProgress,
    });
  },
}));

// ---------------------------------------------------------------------------
// Selector Hooks (for performance optimization)
// ---------------------------------------------------------------------------

/**
 * Hook to get analysis for a specific game.
 *
 * Only re-renders when the analysis for this specific game changes.
 *
 * @param gameId - ID of the game to get analysis for
 * @returns The cached GameAnalysis or null
 *
 * @example
 * ```tsx
 * const analysis = useAnalysis('game-123');
 * ```
 */
export function useAnalysis(gameId: string): GameAnalysis | null {
  return useAnalysisStore((state) => state.cache.get(gameId) ?? null);
}

/**
 * Hook to check if a specific game is currently being analyzed.
 *
 * @param gameId - ID of the game to check
 * @returns True if this specific game is being analyzed
 *
 * @example
 * ```tsx
 * const isThisGameAnalyzing = useIsAnalyzingGame('game-123');
 * ```
 */
export function useIsAnalyzingGame(gameId: string): boolean {
  return useAnalysisStore((state) => state.analyzingGameId === gameId);
}

/**
 * Hook to get analysis progress.
 *
 * @returns Current progress state
 *
 * @example
 * ```tsx
 * const { current, total } = useAnalysisProgress();
 * const percent = total > 0 ? Math.round((current / total) * 100) : 0;
 * ```
 */
export function useAnalysisProgress(): AnalysisProgress {
  return useAnalysisStore((state) => state.progress);
}
