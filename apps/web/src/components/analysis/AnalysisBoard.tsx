'use client';

/**
 * AnalysisBoard Component
 * =======================
 *
 * Full-screen modal for analyzing a chess game with engine evaluation.
 *
 * HOW IT WORKS:
 * 1. When opened, it triggers full game analysis via Tauri IPC
 * 2. The Rust backend runs Stockfish on each position
 * 3. Progress updates flow back via Tauri events ('analysis:progress')
 * 4. When complete, moves are classified (brilliant, blunder, etc.)
 * 5. Results are displayed alongside the board
 *
 * LAYOUT:
 * - Left column (80px): EvalBar showing current position evaluation
 * - Center: ChessBoard with move navigation controls
 * - Right column (400px): AnalyzedMoveList and EngineInfo panel
 *
 * KEYBOARD SHORTCUTS:
 * - Arrow Left/Right: Navigate moves
 * - Home/End: Jump to start/end
 * - Space: Play/pause auto-advance
 * - Escape: Close the analysis view
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { HistoryGame } from '@chess-game/shared';
import type {
  EngineEvaluation,
  AnalyzedMove,
  GameAnalysis,
  AnalysisProgress,
  AnalysisSummary,
} from '@chess-game/shared';
import { STARTING_FEN } from '@chess-game/shared';
import type { Square } from '@chess-game/shared/chess';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { useMoveViewer } from '@/hooks/useMoveViewer';
import { useEngineAnalysis } from '@/hooks/useEngineAnalysis';
import { isTauri } from '@/lib/desktop';
import {
  classifyMove,
  normalizeEvalForMover,
  isBestMove,
} from '@/lib/analysis';
import { calculateAccuracy } from '@/lib/analysis/accuracyCalculator';

// Import sub-components being built by other agents
import { EvalBar } from '@/components/analysis/EvalBar';
import { EngineInfo } from '@/components/analysis/EngineInfo';
import { AnalyzedMoveList } from '@/components/analysis/AnalyzedMoveList';
import { AnalysisHeader } from '@/components/analysis/AnalysisHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisBoardProps {
  /** The game to analyze, from history */
  game: HistoryGame;
  /** Callback when the modal should close */
  onClose: () => void;
}

interface AnalysisState {
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Analysis progress (current position / total positions) */
  progress: AnalysisProgress | null;
  /** Analyzed moves with classifications */
  analyzedMoves: AnalyzedMove[];
  /** Complete game analysis results */
  gameAnalysis: GameAnalysis | null;
  /** Error message if analysis failed */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalysisBoard({ game, onClose }: AnalysisBoardProps) {
  // -------------------------------------------------------------------------
  // Move Navigation
  // -------------------------------------------------------------------------
  // useMoveViewer handles stepping through the game's moves
  // It provides currentFen, navigation functions, and keyboard shortcuts
  const moveViewer = useMoveViewer({
    moves: game.moves,
    startingFen: game.startingFen || STARTING_FEN,
  });

  // -------------------------------------------------------------------------
  // Engine Analysis
  // -------------------------------------------------------------------------
  // useEngineAnalysis provides the interface to Stockfish via Tauri IPC
  const {
    analyzeGame,
    stopAnalysis,
    engineInfo,
    isAnalyzing: engineBusy,
    progress: engineProgress,
    error: _engineError,
  } = useEngineAnalysis();

  // -------------------------------------------------------------------------
  // Analysis State
  // -------------------------------------------------------------------------
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    isAnalyzing: false,
    progress: null,
    analyzedMoves: [],
    gameAnalysis: null,
    error: null,
  });

  // -------------------------------------------------------------------------
  // Derived Values
  // -------------------------------------------------------------------------

  // Get the current position's analyzed move data
  const currentAnalyzedMove = useMemo(() => {
    if (moveViewer.currentMoveIndex < 0) return null;
    return analysisState.analyzedMoves[moveViewer.currentMoveIndex] || null;
  }, [moveViewer.currentMoveIndex, analysisState.analyzedMoves]);

  // Get the current evaluation as EngineEvaluation for the EvalBar component
  const currentEvaluation: EngineEvaluation | null = useMemo(() => {
    return currentAnalyzedMove?.evaluation || null;
  }, [currentAnalyzedMove]);

  // -------------------------------------------------------------------------
  // Process Engine Results into Analyzed Moves
  // -------------------------------------------------------------------------

  /**
   * Classify all moves based on engine evaluations.
   *
   * HOW CLASSIFICATION WORKS:
   * 1. For each move, we have the eval BEFORE (from prior position)
   *    and AFTER (from this position's analysis).
   * 2. We compare: did the move match the engine's best recommendation?
   * 3. We calculate how much evaluation was gained/lost.
   * 4. Based on these factors, we assign a classification (best, blunder, etc.)
   */
  const processAnalysisResults = useCallback(
    (evaluations: EngineEvaluation[]): AnalyzedMove[] => {
      const analyzedMoves: AnalyzedMove[] = [];

      // We need at least one evaluation (starting position)
      if (evaluations.length === 0) return analyzedMoves;

      // Process each move
      for (let i = 0; i < game.moves.length; i++) {
        const move = game.moves[i];
        const isWhiteMove = i % 2 === 0;

        // Get evaluations before and after this move
        // evaluations[0] is the starting position
        // evaluations[i+1] is the position AFTER move i
        const evalBefore = evaluations[i];
        const evalAfter = evaluations[i + 1];

        if (!evalBefore || !evalAfter) {
          // Missing evaluation data - shouldn't happen but handle gracefully
          continue;
        }

        // Normalize evaluations to the mover's perspective
        // Engine evals are from white's POV, so flip for black
        const normalizedBefore = normalizeEvalForMover(evalBefore.scoreCp, isWhiteMove);
        const normalizedAfter = normalizeEvalForMover(evalAfter.scoreCp, isWhiteMove);

        // Calculate eval delta (positive = good for mover)
        const evalDelta = normalizedAfter - normalizedBefore;

        // Check if the played move matches the engine's best move
        // Construct UCI from the move's from/to squares (Move type doesn't have uci field)
        const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
        const wasBestMove = isBestMove(playedUci, evalBefore.bestMove);

        // Classify the move
        const classification = classifyMove(
          normalizedBefore,
          normalizedAfter,
          wasBestMove,
          isWhiteMove,
          false // TODO: check opening book
        );

        analyzedMoves.push({
          moveIndex: i,
          san: move.san,
          uci: playedUci,
          fen: move.fen,
          evaluation: evalAfter,
          classification,
          evalDelta,
          bestMove: evalBefore.bestMove,
          bestMoveSan: evalBefore.bestMoveSan,
        });
      }

      return analyzedMoves;
    },
    [game.moves]
  );

  /**
   * Calculate the analysis summary (counts of each classification by player).
   */
  const calculateSummary = useCallback((moves: AnalyzedMove[]): AnalysisSummary => {
    const summary: AnalysisSummary = {
      whiteBrilliant: 0,
      whiteGreat: 0,
      whiteBest: 0,
      whiteExcellent: 0,
      whiteGood: 0,
      whiteInaccuracy: 0,
      whiteMistake: 0,
      whiteBlunder: 0,
      blackBrilliant: 0,
      blackGreat: 0,
      blackBest: 0,
      blackExcellent: 0,
      blackGood: 0,
      blackInaccuracy: 0,
      blackMistake: 0,
      blackBlunder: 0,
    };

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const prefix = i % 2 === 0 ? 'white' : 'black';

      // Dynamically construct the key based on classification
      // e.g., 'whiteBrilliant', 'blackBlunder'
      const key = `${prefix}${move.classification.charAt(0).toUpperCase()}${move.classification.slice(1)}` as keyof AnalysisSummary;

      if (key in summary) {
        summary[key]++;
      }
    }

    return summary;
  }, []);

  // -------------------------------------------------------------------------
  // Analysis Depth State
  // -------------------------------------------------------------------------
  const [analysisDepth, setAnalysisDepth] = useState(20);

  // -------------------------------------------------------------------------
  // Start Analysis
  // -------------------------------------------------------------------------

  const startAnalysis = useCallback(async (depth: number = analysisDepth) => {
    // Prevent starting if not in Tauri or already analyzing
    if (!isTauri() || analysisState.isAnalyzing) {
      return;
    }

    setAnalysisDepth(depth);
    setAnalysisState((prev) => ({
      ...prev,
      isAnalyzing: true,
      progress: { current: 0, total: game.moves.length + 1 },
      error: null,
    }));

    try {
      // Build array of FENs for all positions
      // Start with the starting position, then add each position after a move
      const fens: string[] = [game.startingFen || STARTING_FEN];
      for (const move of game.moves) {
        fens.push(move.fen);
      }

      // Call the engine to analyze all positions
      // This might take a while for long games
      const evaluations = await analyzeGame(fens, depth);

      // Process results into analyzed moves with classifications
      const analyzedMoves = processAnalysisResults(evaluations);

      // Calculate accuracy for both players
      const accuracy = calculateAccuracy(analyzedMoves);

      // Calculate summary statistics
      const summary = calculateSummary(analyzedMoves);

      // Build complete game analysis
      const gameAnalysis: GameAnalysis = {
        gameId: game.id,
        moves: analyzedMoves,
        whiteAccuracy: accuracy.white,
        blackAccuracy: accuracy.black,
        summary,
        engineName: engineInfo?.name || 'Stockfish',
        engineDepth: depth,
        analyzedAt: new Date(),
      };

      setAnalysisState({
        isAnalyzing: false,
        progress: null,
        analyzedMoves,
        gameAnalysis,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setAnalysisState((prev) => ({
        ...prev,
        isAnalyzing: false,
        progress: null,
        error: message,
      }));
    }
  }, [
    game,
    analyzeGame,
    engineInfo,
    analysisState.isAnalyzing,
    analysisDepth,
    processAnalysisResults,
    calculateSummary,
  ]);

  // -------------------------------------------------------------------------
  // Header Callbacks
  // -------------------------------------------------------------------------

  /**
   * Handle start analysis request from header with specific depth.
   */
  const handleStartAnalysis = useCallback((depth: number) => {
    startAnalysis(depth);
  }, [startAnalysis]);

  /**
   * Handle cancel analysis request from header.
   */
  const handleCancelAnalysis = useCallback(() => {
    stopAnalysis();
    setAnalysisState((prev) => ({
      ...prev,
      isAnalyzing: false,
      progress: null,
    }));
  }, [stopAnalysis]);

  // -------------------------------------------------------------------------
  // Listen for Tauri Progress Events
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isTauri()) return;

    // Listen for progress events from the Rust backend
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      unlistenFn = await listen<AnalysisProgress>('analysis:progress', (event) => {
        setAnalysisState((prev) => ({
          ...prev,
          progress: event.payload,
        }));
      });
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Auto-start Analysis on Mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Automatically start analysis when the component mounts
    // Only if we're in Tauri and don't already have results
    if (isTauri() && !analysisState.gameAnalysis && !analysisState.isAnalyzing) {
      startAnalysis(20); // Default depth
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run on mount
  }, []);

  // -------------------------------------------------------------------------
  // Close on Escape Key
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Stop any running analysis before closing
        stopAnalysis();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, stopAnalysis]);

  // -------------------------------------------------------------------------
  // Prevent Body Scroll When Open
  // -------------------------------------------------------------------------

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // -------------------------------------------------------------------------
  // Cleanup on Unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      // Stop analysis if the component unmounts
      stopAnalysis();
    };
  }, [stopAnalysis]);

  // -------------------------------------------------------------------------
  // Handle Move Click in the Analyzed Move List
  // -------------------------------------------------------------------------

  const handleMoveClick = useCallback(
    (moveIndex: number) => {
      moveViewer.goToMove(moveIndex);
    },
    [moveViewer]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop - clicking closes the modal */}
      <div
        className="absolute inset-0 bg-pure-black/80"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Panel */}
      <div className="absolute inset-4 bg-off-black border border-mid/30 overflow-hidden flex flex-col">
        {/* Header */}
        <AnalysisHeader
          onClose={onClose}
          onStartAnalysis={handleStartAnalysis}
          onCancelAnalysis={handleCancelAnalysis}
          isAnalyzing={analysisState.isAnalyzing || engineBusy}
          hasAnalysis={!!analysisState.gameAnalysis}
        />

        {/* Main Content - 3 Column Layout */}
        <div className="grid grid-cols-[80px_1fr_400px] gap-4 p-4 h-[calc(100%-64px)] min-h-0">
          {/* Left Column: Evaluation Bar */}
          <div className="flex flex-col">
            <EvalBar
              evaluation={currentEvaluation}
              orientation={game.playerColor}
            />
          </div>

          {/* Center Column: Chess Board and Navigation */}
          <div className="flex flex-col gap-4 min-h-0">
            {/* Chess Board Container */}
            <div className="flex-1 min-h-0">
              <div className="h-full aspect-square mx-auto bg-pure-black border border-mid/30">
                <ChessBoard
                  position={moveViewer.currentFen}
                  orientation={game.playerColor}
                  lastMove={
                    moveViewer.currentMove
                      ? {
                          from: moveViewer.currentMove.from as Square,
                          to: moveViewer.currentMove.to as Square,
                        }
                      : null
                  }
                />
              </div>
            </div>

            {/* Move Navigator */}
            <div className="bg-pure-black border border-mid/30 p-4 space-y-3">
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="h-1 bg-mid/30 overflow-hidden">
                  <div
                    className="h-full bg-pure-white transition-all duration-150"
                    style={{
                      width: `${
                        moveViewer.totalMoves > 0
                          ? ((moveViewer.currentMoveIndex + 1) / moveViewer.totalMoves) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono text-mid-light">
                  <span>
                    Move {moveViewer.currentMoveIndex < 0 ? '-' : moveViewer.currentMoveIndex + 1}
                  </span>
                  <span>/ {moveViewer.totalMoves}</span>
                </div>
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-center gap-2">
                <NavButton onClick={moveViewer.goToStart} title="Go to start (Home)">
                  <span className="text-lg">&#x23EE;</span>
                </NavButton>
                <NavButton onClick={moveViewer.goBack} title="Previous move (Arrow Left)">
                  <span className="text-lg">&#x23EA;</span>
                </NavButton>
                <button
                  onClick={moveViewer.togglePlayback}
                  className="w-12 h-12 flex items-center justify-center bg-pure-white text-pure-black hover:bg-light transition-colors"
                  title={moveViewer.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {moveViewer.isPlaying ? (
                    <span className="text-xl">&#x23F8;</span>
                  ) : (
                    <span className="text-xl">&#x25B6;</span>
                  )}
                </button>
                <NavButton onClick={moveViewer.goForward} title="Next move (Arrow Right)">
                  <span className="text-lg">&#x23E9;</span>
                </NavButton>
                <NavButton onClick={moveViewer.goToEnd} title="Go to end (End)">
                  <span className="text-lg">&#x23ED;</span>
                </NavButton>
              </div>

              {/* Speed Control */}
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs font-mono text-mid-light">speed:</span>
                {[0.5, 1, 2, 3].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => moveViewer.setPlaybackSpeed(speed)}
                    className={`px-2 py-0.5 text-xs font-mono border transition-colors ${
                      moveViewer.playbackSpeed === speed
                        ? 'bg-pure-white text-pure-black border-pure-white'
                        : 'text-mid-light border-mid/30 hover:border-pure-white hover:text-pure-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Move List and Engine Info */}
          <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
            {/* Analyzed Move List */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnalyzedMoveList
                moves={analysisState.analyzedMoves}
                currentIndex={moveViewer.currentMoveIndex}
                onMoveClick={handleMoveClick}
              />
            </div>

            {/* Engine Info Panel */}
            <EngineInfo
              engineInfo={engineInfo}
              currentEval={currentEvaluation}
              progress={analysisState.progress || engineProgress}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Navigation button with consistent styling.
 */
function NavButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-10 h-10 flex items-center justify-center bg-off-black border border-mid/30 text-mid-light hover:text-pure-white hover:border-pure-white transition-colors"
    >
      {children}
    </button>
  );
}

export default AnalysisBoard;
