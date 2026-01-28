'use client';

/**
 * AnalysisBoard Component - Integrated Tab View
 * ==============================================
 *
 * Displays game analysis as an integrated content view (not a modal).
 * Fits within the normal app layout - below TitleBar, above TickerBar.
 * Has floating control buttons instead of a dedicated header bar.
 *
 * The main TitleBar remains visible for navigation. When user clicks
 * another tab, this component simply unmounts (temporary tab behavior).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { HistoryGame } from '@chess-game/shared';
import type {
  EngineEvaluation,
  AnalyzedMove,
  GameAnalysis,
  AnalysisProgress,
  AnalysisSummary,
  MoveClassification,
} from '@chess-game/shared';
import { STARTING_FEN } from '@chess-game/shared';
import type { Square } from '@chess-game/shared/chess';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { useMoveViewer } from '@/hooks/useMoveViewer';
import { useEngineAnalysis } from '@/hooks/useEngineAnalysis';
import {
  classifyMove,
  normalizeEvalForMover,
  isBestMove,
} from '@/lib/analysis';
import { calculateAccuracy } from '@/lib/analysis/accuracyCalculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisBoardProps {
  game: HistoryGame;
  onClose: () => void;
}

interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  analyzedMoves: AnalyzedMove[];
  gameAnalysis: GameAnalysis | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Classification Config
// ---------------------------------------------------------------------------

const CLASSIFICATION_CONFIG: Record<MoveClassification, { icon: string; color: string; bg: string; label: string }> = {
  brilliant: { icon: '!!', color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Brilliant' },
  great: { icon: '!', color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Great' },
  best: { icon: '✓', color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Best' },
  excellent: { icon: '○', color: 'text-emerald-300/80', bg: 'bg-emerald-500/5', label: 'Excellent' },
  good: { icon: '·', color: 'text-zinc-400', bg: 'transparent', label: 'Good' },
  book: { icon: '📖', color: 'text-zinc-500', bg: 'transparent', label: 'Book' },
  inaccuracy: { icon: '?!', color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Inaccuracy' },
  mistake: { icon: '?', color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Mistake' },
  blunder: { icon: '??', color: 'text-red-400', bg: 'bg-red-500/20', label: 'Blunder' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AnalysisBoard({ game, onClose }: AnalysisBoardProps) {
  const moveViewer = useMoveViewer({
    moves: game.moves,
    startingFen: game.startingFen || STARTING_FEN,
  });

  const {
    analyzeGame,
    stopAnalysis,
    engineInfo,
    isAnalyzing: engineBusy,
    progress: engineProgress,
    error: _engineError,
  } = useEngineAnalysis();

  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    isAnalyzing: false,
    progress: null,
    analyzedMoves: [],
    gameAnalysis: null,
    error: null,
  });

  const [analysisDepth, setAnalysisDepth] = useState(20);
  const [showDepthMenu, setShowDepthMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDepthMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Derived values
  const currentAnalyzedMove = useMemo(() => {
    if (moveViewer.currentMoveIndex < 0) return null;
    return analysisState.analyzedMoves[moveViewer.currentMoveIndex] || null;
  }, [moveViewer.currentMoveIndex, analysisState.analyzedMoves]);

  const currentEvaluation: EngineEvaluation | null = useMemo(() => {
    return currentAnalyzedMove?.evaluation || null;
  }, [currentAnalyzedMove]);

  // Process results
  const processAnalysisResults = useCallback(
    (evaluations: EngineEvaluation[]): AnalyzedMove[] => {
      const analyzedMoves: AnalyzedMove[] = [];
      if (evaluations.length === 0) return analyzedMoves;

      for (let i = 0; i < game.moves.length; i++) {
        const move = game.moves[i];
        const isWhiteMove = i % 2 === 0;
        const evalBefore = evaluations[i];
        const evalAfter = evaluations[i + 1];

        if (!evalBefore || !evalAfter) continue;

        const normalizedBefore = normalizeEvalForMover(evalBefore.scoreCp, isWhiteMove);
        const normalizedAfter = normalizeEvalForMover(evalAfter.scoreCp, isWhiteMove);
        const evalDelta = normalizedAfter - normalizedBefore;

        const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
        const wasBestMove = isBestMove(playedUci, evalBefore.bestMove);

        const classification = classifyMove(
          normalizedBefore,
          normalizedAfter,
          wasBestMove,
          isWhiteMove,
          false
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

  const calculateSummary = useCallback((moves: AnalyzedMove[]): AnalysisSummary => {
    const summary: AnalysisSummary = {
      whiteBrilliant: 0, whiteGreat: 0, whiteBest: 0, whiteExcellent: 0, whiteGood: 0,
      whiteInaccuracy: 0, whiteMistake: 0, whiteBlunder: 0,
      blackBrilliant: 0, blackGreat: 0, blackBest: 0, blackExcellent: 0, blackGood: 0,
      blackInaccuracy: 0, blackMistake: 0, blackBlunder: 0,
    };

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const prefix = i % 2 === 0 ? 'white' : 'black';
      const key = `${prefix}${move.classification.charAt(0).toUpperCase()}${move.classification.slice(1)}` as keyof AnalysisSummary;
      if (key in summary) summary[key]++;
    }

    return summary;
  }, []);

  const startAnalysis = useCallback(async (depth: number = analysisDepth) => {
    if (analysisState.isAnalyzing) return;

    setAnalysisDepth(depth);
    setAnalysisState((prev) => ({
      ...prev,
      isAnalyzing: true,
      progress: { current: 0, total: game.moves.length + 1 },
      error: null,
    }));

    try {
      const fens: string[] = [game.startingFen || STARTING_FEN];
      for (const move of game.moves) fens.push(move.fen);

      const evaluations = await analyzeGame(fens, depth);
      const analyzedMoves = processAnalysisResults(evaluations);
      const accuracy = calculateAccuracy(analyzedMoves);
      const summary = calculateSummary(analyzedMoves);

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
  }, [game, analyzeGame, engineInfo, analysisState.isAnalyzing, analysisDepth, processAnalysisResults, calculateSummary]);

  const handleCancelAnalysis = useCallback(() => {
    stopAnalysis();
    setAnalysisState((prev) => ({ ...prev, isAnalyzing: false, progress: null }));
  }, [stopAnalysis]);

  // Effects
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenFn = await listen<AnalysisProgress>('analysis:progress', (event) => {
        setAnalysisState((prev) => ({ ...prev, progress: event.payload }));
      });
    };

    setupListener();
    return () => { if (unlistenFn) unlistenFn(); };
  }, []);

  useEffect(() => {
    if (!analysisState.gameAnalysis && !analysisState.isAnalyzing) {
      startAnalysis(20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stopAnalysis(); onClose(); }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, stopAnalysis]);

  useEffect(() => {
    return () => { stopAnalysis(); };
  }, [stopAnalysis]);

  // Eval bar calculation
  const evalPercent = useMemo(() => {
    if (!currentEvaluation) return 50;
    if (currentEvaluation.scoreMate !== null) {
      return currentEvaluation.scoreMate > 0 ? 98 : 2;
    }
    const clamped = Math.max(-1000, Math.min(1000, currentEvaluation.scoreCp));
    return 50 + (clamped / 1000) * 48;
  }, [currentEvaluation]);

  const evalText = useMemo(() => {
    if (!currentEvaluation) return '0.0';
    if (currentEvaluation.scoreMate !== null) {
      return `M${Math.abs(currentEvaluation.scoreMate)}`;
    }
    const score = currentEvaluation.scoreCp / 100;
    return score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
  }, [currentEvaluation]);

  const progress = analysisState.progress || engineProgress;
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0;
  const isAnalyzingNow = analysisState.isAnalyzing || engineBusy;

  // Use game.moves for display when no analysis yet
  const displayMoves = analysisState.analyzedMoves.length > 0
    ? analysisState.analyzedMoves
    : null;

  return (
    <div className="h-full w-full bg-black relative">
      {/* ═══ FLOATING CONTROLS - Top bar with Back, Title, Depth, Analyze ═══ */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Left: Back button + Game info */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-sm border border-white/20 rounded-full text-[#888] hover:text-white hover:border-white/40 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back</span>
          </button>

          <div className="px-4 py-2 bg-black/80 backdrop-blur-sm border border-white/10 rounded-full">
            <span className="text-white text-sm font-medium">vs {game.opponent.username}</span>
            <span className="text-[#666] text-xs ml-2">• {game.opening || 'Analysis'}</span>
          </div>
        </div>

        {/* Right: Depth selector + Analyze button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Depth Selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setShowDepthMenu(!showDepthMenu)}
              disabled={isAnalyzingNow}
              className="px-4 py-2 bg-black/80 backdrop-blur-sm border border-white/20 rounded-full text-[#ccc] hover:text-white hover:border-white/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            >
              Depth {analysisDepth}
              <span className="ml-1 text-[#666]">{showDepthMenu ? '▲' : '▼'}</span>
            </button>

            {showDepthMenu && !isAnalyzingNow && (
              <div className="absolute right-0 top-full mt-2 py-1 bg-black/95 backdrop-blur-sm border border-white/20 shadow-2xl z-[200] rounded-lg min-w-[100px] overflow-hidden">
                {[15, 18, 20].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setAnalysisDepth(d); setShowDepthMenu(false); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                      d === analysisDepth
                        ? 'bg-white text-black'
                        : 'text-[#888] hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Analyze / Cancel Button */}
          {isAnalyzingNow ? (
            <button
              onClick={handleCancelAnalysis}
              className="px-5 py-2 bg-red-500/20 backdrop-blur-sm border border-red-500/40 rounded-full text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => startAnalysis(analysisDepth)}
              className="px-5 py-2 bg-white rounded-full text-black hover:bg-[#eee] transition-all text-sm font-medium"
            >
              {analysisState.gameAnalysis ? 'Re-analyze' : 'Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* ═══ PROGRESS BAR - Subtle top edge indicator ═══ */}
      {isAnalyzingNow && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black z-10">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* ═══ MAIN CONTENT - Full height grid layout ═══ */}
      <div className="h-full grid grid-cols-[1fr_360px] gap-4 p-4 pt-20">

        {/* ─── LEFT: Board + Eval Bar ─── */}
        <div className="flex gap-3 min-h-0">

          {/* Evaluation Bar */}
          <div className="w-6 flex flex-col bg-[#111] border border-white/10 overflow-hidden rounded-lg">
            <div
              className="bg-[#333] transition-all duration-500 ease-out relative"
              style={{ height: `${100 - evalPercent}%` }}
            >
              {evalPercent < 50 && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold text-white whitespace-nowrap">
                  {evalText}
                </span>
              )}
            </div>
            <div className="bg-[#ddd] transition-all duration-500 ease-out relative flex-1">
              {evalPercent >= 50 && (
                <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold text-black whitespace-nowrap">
                  {evalText}
                </span>
              )}
            </div>
          </div>

          {/* Board + Playback Controls */}
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Chess Board */}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="h-full max-h-full aspect-square bg-[#111] border border-white/10 p-1 rounded-lg">
                <ChessBoard
                  position={moveViewer.currentFen}
                  orientation={game.playerColor}
                  lastMove={
                    moveViewer.currentMove
                      ? { from: moveViewer.currentMove.from as Square, to: moveViewer.currentMove.to as Square }
                      : null
                  }
                />
              </div>
            </div>

            {/* ═══ PLAYBACK CONTROLS - Compact Spotify-style ═══ */}
            <div className="bg-[#111] border border-white/10 p-4 rounded-lg">
              {/* Progress Scrubber */}
              <div className="mb-4">
                <div className="h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer group">
                  <div
                    className="h-full bg-white group-hover:bg-emerald-400 transition-colors rounded-full"
                    style={{ width: `${moveViewer.totalMoves > 0 ? ((moveViewer.currentMoveIndex + 1) / moveViewer.totalMoves) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-[#666] font-mono">
                  <span>{moveViewer.currentMoveIndex < 0 ? '0' : moveViewer.currentMoveIndex + 1}</span>
                  <span>{moveViewer.totalMoves}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-center gap-2">
                <button onClick={moveViewer.goToStart} className="w-9 h-9 rounded-full flex items-center justify-center text-[#888] hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button onClick={moveViewer.goBack} className="w-9 h-9 rounded-full flex items-center justify-center text-[#888] hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button onClick={moveViewer.togglePlayback} className="w-12 h-12 rounded-full bg-white text-black hover:scale-105 hover:bg-[#eee] transition-all flex items-center justify-center shadow-lg">
                  {moveViewer.isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>
                <button onClick={moveViewer.goForward} className="w-9 h-9 rounded-full flex items-center justify-center text-[#888] hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-4 h-4 rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button onClick={moveViewer.goToEnd} className="w-9 h-9 rounded-full flex items-center justify-center text-[#888] hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-3.5 h-3.5 rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
              </div>

              {/* Speed Control */}
              <div className="flex items-center justify-center gap-1 mt-3">
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => moveViewer.setPlaybackSpeed(s)}
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-all ${
                      moveViewer.playbackSpeed === s
                        ? 'bg-white text-black'
                        : 'text-[#666] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Analysis Panel ─── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* Accuracy Cards */}
          {analysisState.gameAnalysis && (
            <div className="grid grid-cols-2 gap-2">
              <AccuracyCard
                label="White"
                value={analysisState.gameAnalysis.whiteAccuracy}
                isPlayer={game.playerColor === 'white'}
              />
              <AccuracyCard
                label="Black"
                value={analysisState.gameAnalysis.blackAccuracy}
                isPlayer={game.playerColor === 'black'}
              />
            </div>
          )}

          {/* Current Move Info */}
          {currentAnalyzedMove && (
            <div className={`p-3 rounded-lg border border-white/10 ${CLASSIFICATION_CONFIG[currentAnalyzedMove.classification].bg} bg-[#111]`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${CLASSIFICATION_CONFIG[currentAnalyzedMove.classification].color}`}>
                    {CLASSIFICATION_CONFIG[currentAnalyzedMove.classification].icon}
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${CLASSIFICATION_CONFIG[currentAnalyzedMove.classification].color}`}>
                      {CLASSIFICATION_CONFIG[currentAnalyzedMove.classification].label}
                    </p>
                    <p className="text-lg text-white font-mono">{currentAnalyzedMove.san}</p>
                  </div>
                </div>
                {currentAnalyzedMove.bestMoveSan && currentAnalyzedMove.bestMoveSan !== currentAnalyzedMove.san && (
                  <div className="text-right">
                    <p className="text-[10px] text-[#666]">Best was</p>
                    <p className="text-base text-emerald-400 font-mono">{currentAnalyzedMove.bestMoveSan}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Move List */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#111] border border-white/10 rounded-lg flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex-shrink-0">
              <h3 className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                Moves {game.moves.length > 0 && `(${game.moves.length})`}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MoveList
                gameMoves={game.moves}
                analyzedMoves={displayMoves}
                currentIndex={moveViewer.currentMoveIndex}
                onMoveClick={(i) => moveViewer.goToMove(i)}
                isAnalyzing={isAnalyzingNow}
              />
            </div>
          </div>

          {/* Engine Info - Compact */}
          <div className="bg-[#111] border border-white/10 p-3 rounded-lg flex-shrink-0">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#666]">Engine</span>
              <span className="text-[#ccc]">{engineInfo?.name || 'Stockfish'}</span>
            </div>
            {currentEvaluation && (
              <div className="flex items-center justify-between text-xs mt-1.5">
                <span className="text-[#666]">Depth</span>
                <span className="text-[#ccc]">{currentEvaluation.depth}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function AccuracyCard({ label, value, isPlayer }: { label: string; value: number; isPlayer: boolean }) {
  const color = value >= 90 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className={`p-3 bg-[#111] rounded-lg border ${isPlayer ? 'border-white/20' : 'border-white/10'}`}>
      <p className="text-[10px] text-[#666] mb-0.5">{label} {isPlayer && <span className="text-[#888]">(You)</span>}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toFixed(1)}%</p>
    </div>
  );
}

function MoveList({
  gameMoves,
  analyzedMoves,
  currentIndex,
  onMoveClick,
  isAnalyzing
}: {
  gameMoves: { san: string; from: string; to: string }[];
  analyzedMoves: AnalyzedMove[] | null;
  currentIndex: number;
  onMoveClick: (i: number) => void;
  isAnalyzing: boolean;
}) {
  if (gameMoves.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#666] text-sm p-4">
        No moves in this game
      </div>
    );
  }

  const pairs: {
    num: number;
    w: { san: string; analysis?: AnalyzedMove } | null;
    b: { san: string; analysis?: AnalyzedMove } | null;
    wi: number;
    bi: number;
  }[] = [];

  for (let i = 0; i < gameMoves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      w: gameMoves[i] ? { san: gameMoves[i].san, analysis: analyzedMoves?.[i] } : null,
      b: gameMoves[i + 1] ? { san: gameMoves[i + 1].san, analysis: analyzedMoves?.[i + 1] } : null,
      wi: i,
      bi: i + 1,
    });
  }

  return (
    <div className="divide-y divide-white/5">
      {isAnalyzing && !analyzedMoves && (
        <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs">
          Analyzing positions...
        </div>
      )}
      {pairs.map((p) => (
        <div key={p.num} className="flex items-stretch text-sm">
          <span className="w-8 py-2 text-center text-[#444] border-r border-white/5 flex-shrink-0 font-mono text-xs">
            {p.num}
          </span>
          {p.w && (
            <MoveCell
              san={p.w.san}
              analysis={p.w.analysis}
              isActive={currentIndex === p.wi}
              onClick={() => onMoveClick(p.wi)}
            />
          )}
          {p.b && (
            <MoveCell
              san={p.b.san}
              analysis={p.b.analysis}
              isActive={currentIndex === p.bi}
              onClick={() => onMoveClick(p.bi)}
            />
          )}
          {!p.b && p.w && <div className="flex-1" />}
        </div>
      ))}
    </div>
  );
}

function MoveCell({
  san,
  analysis,
  isActive,
  onClick
}: {
  san: string;
  analysis?: AnalyzedMove;
  isActive: boolean;
  onClick: () => void;
}) {
  const cfg = analysis ? CLASSIFICATION_CONFIG[analysis.classification] : null;

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-1.5 px-2 py-2 transition-colors text-left ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      {cfg ? (
        <span className={`w-4 text-center font-bold text-[10px] ${cfg.color}`}>{cfg.icon}</span>
      ) : (
        <span className="w-4" />
      )}
      <span className="flex-1 font-mono text-white text-sm">{san}</span>
      {analysis && (
        <span className="text-[9px] text-[#666] tabular-nums font-mono">
          {analysis.evaluation.scoreMate !== null
            ? `M${Math.abs(analysis.evaluation.scoreMate)}`
            : (analysis.evaluation.scoreCp >= 0 ? '+' : '') + (analysis.evaluation.scoreCp / 100).toFixed(1)
          }
        </span>
      )}
    </button>
  );
}

export default AnalysisBoard;
