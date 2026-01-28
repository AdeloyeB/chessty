'use client';

/**
 * useEngineAnalysis Hook
 * ======================
 *
 * React hook for interacting with the Stockfish chess engine via Tauri IPC.
 *
 * HOW IT WORKS:
 * 1. Uses Tauri's invoke() to call Rust commands
 * 2. The Rust backend runs Stockfish and returns results
 * 3. Results are returned to React for display
 *
 * WHY TAURI IPC?
 * Stockfish is a native binary (compiled C++ code). It can't run directly
 * in JavaScript. The Rust backend spawns the Stockfish process and
 * communicates with it, then sends results to the web frontend via IPC.
 *
 * NOTE: This is a Tauri-only desktop app. No browser fallbacks exist.
 *
 * USAGE:
 * ```tsx
 * const { analyzePosition, isAnalyzing, error } = useEngineAnalysis();
 *
 * // Analyze a single position
 * const result = await analyzePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
 * console.log(result.scoreCp); // Evaluation in centipawns
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  EngineEvaluation,
  EngineInfo,
  AnalysisProgress,
} from '@chess-game/shared';

// Dynamic imports for Tauri APIs - required for SSR compatibility.
// Next.js renders on the server first where Tauri APIs don't exist.
// Dynamic imports ensure the code only loads on the client.
const getTauriCore = () => import('@tauri-apps/api/core');
const getTauriEvent = () => import('@tauri-apps/api/event');

// ---------------------------------------------------------------------------
// Hook Return Type
// ---------------------------------------------------------------------------

interface UseEngineAnalysisReturn {
  /**
   * Analyze a single chess position.
   *
   * @param fen - Position in FEN notation
   * @param depth - Search depth (default: 20). Higher = slower but more accurate.
   * @returns Engine evaluation with best move and score
   */
  analyzePosition: (fen: string, depth?: number) => Promise<EngineEvaluation>;

  /**
   * Analyze an entire game (all positions).
   *
   * @param fens - Array of FEN strings, one per position (including start)
   * @param depth - Search depth for each position (default: 20)
   * @returns Array of evaluations, one per position
   */
  analyzeGame: (fens: string[], depth?: number) => Promise<EngineEvaluation[]>;

  /**
   * Stop any running analysis.
   * Useful when user navigates away or cancels.
   */
  stopAnalysis: () => Promise<void>;

  /** Information about the engine (name, version, ready state) */
  engineInfo: EngineInfo | null;

  /** Whether analysis is currently running */
  isAnalyzing: boolean;

  /** Progress during game analysis (current position out of total) */
  progress: AnalysisProgress | null;

  /** Error message if something went wrong */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Default Values
// ---------------------------------------------------------------------------

const DEFAULT_DEPTH = 20;

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useEngineAnalysis(): UseEngineAnalysisReturn {
  // State
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref to track if analysis was cancelled
  const cancelledRef = useRef(false);

  // Ref to store unlisten function for progress events
  const unlistenRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Initialize Engine
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Initialize the engine when component mounts
    const initEngine = async () => {
      try {
        const { invoke } = await getTauriCore();
        // Call Rust to start the engine
        const info = await invoke<EngineInfo>('init_engine');
        setEngineInfo(info);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize engine';
        setError(message);
        console.error('Engine init error:', err);
      }
    };

    initEngine();

    // Cleanup: stop engine on unmount
    return () => {
      getTauriCore().then(({ invoke }) => {
        invoke('stop_analysis').catch(console.error);
      });

      // Cleanup progress listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Analyze Single Position
  // ---------------------------------------------------------------------------

  const analyzePosition = useCallback(async (
    fen: string,
    depth: number = DEFAULT_DEPTH
  ): Promise<EngineEvaluation> => {
    setIsAnalyzing(true);
    setError(null);
    cancelledRef.current = false;

    try {
      const { invoke } = await getTauriCore();
      // Call the Rust backend to analyze the position
      // The Rust side will:
      // 1. Send the position to Stockfish
      // 2. Wait for the engine to finish calculating
      // 3. Parse the output and return structured data
      const result = await invoke<EngineEvaluation>('analyze_position', {
        fen,
        depth,
      });

      if (cancelledRef.current) {
        throw new Error('Analysis was cancelled');
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Analyze Full Game
  // ---------------------------------------------------------------------------

  const analyzeGame = useCallback(async (
    fens: string[],
    depth: number = DEFAULT_DEPTH
  ): Promise<EngineEvaluation[]> => {
    if (fens.length === 0) {
      return [];
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress({ current: 0, total: fens.length });
    cancelledRef.current = false;

    try {
      const { invoke } = await getTauriCore();
      const { listen } = await getTauriEvent();

      // Set up listener for progress updates from Rust
      // The Rust backend emits 'analysis:progress' events as it processes
      // each position. This lets us update a progress bar in the UI.
      const unlisten = await listen<AnalysisProgress>('analysis:progress', (event) => {
        setProgress(event.payload);
      });
      unlistenRef.current = unlisten;

      // Call Rust to analyze all positions
      // This might take a while for long games (e.g., 40 moves = 80 positions)
      const results = await invoke<EngineEvaluation[]>('analyze_game', {
        fens,
        depth,
      });

      if (cancelledRef.current) {
        throw new Error('Analysis was cancelled');
      }

      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Game analysis failed';
      setError(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
      setProgress(null);

      // Clean up progress listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Stop Analysis
  // ---------------------------------------------------------------------------

  const stopAnalysis = useCallback(async (): Promise<void> => {
    cancelledRef.current = true;

    try {
      const { invoke } = await getTauriCore();
      await invoke('stop_analysis');
    } catch (err) {
      console.error('Failed to stop analysis:', err);
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Return Hook Interface
  // ---------------------------------------------------------------------------

  return {
    analyzePosition,
    analyzeGame,
    stopAnalysis,
    engineInfo,
    isAnalyzing,
    progress,
    error,
  };
}
