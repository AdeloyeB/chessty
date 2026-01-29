'use client';

/**
 * JuryCaseReview Component
 *
 * The main review interface for examining a suspected cheating case.
 * Integrates game replay, statistical analysis, and verdict submission.
 *
 * WHAT THIS COMPONENT DOES:
 * - Displays case header with player ratings and game info
 * - Provides game replay using the existing ChessBoard component
 * - Shows comprehensive statistical analysis in an organized panel
 * - Includes the verdict submission panel at the bottom
 *
 * HOW JURORS USE THIS:
 * 1. Review the statistical analysis to identify anomalies
 * 2. Watch the game replay, optionally viewing move-by-move analysis
 * 3. Consider all evidence before submitting a verdict
 */

import { useState, useCallback } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { useMoveViewer } from '@/hooks/useMoveViewer';
import { JuryVerdictPanel } from './JuryVerdictPanel';
import type { JuryCase, ChargeType, VerdictOption } from './mockJuryData';
import type { Square } from '@chess-game/shared/chess';

interface JuryCaseReviewProps {
  juryCase: JuryCase;
  onSubmitVerdict: (caseId: string, verdicts: Record<ChargeType, VerdictOption>) => void;
  onSkipCase: (caseId: string) => void;
  onBack: () => void;
}

export function JuryCaseReview({
  juryCase,
  onSubmitVerdict,
  onSkipCase,
  onBack,
}: JuryCaseReviewProps) {
  const [showMoveAnalysis, setShowMoveAnalysis] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Move viewer for game replay
  const moveViewer = useMoveViewer({
    moves: juryCase.moves,
    startingFen: juryCase.startingFen,
  });

  const handleSubmit = useCallback(async (verdicts: Record<ChargeType, VerdictOption>) => {
    setIsSubmitting(true);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    onSubmitVerdict(juryCase.id, verdicts);
    setIsSubmitting(false);
  }, [juryCase.id, onSubmitVerdict]);

  const handleSkip = useCallback(() => {
    onSkipCase(juryCase.id);
  }, [juryCase.id, onSkipCase]);

  const stats = juryCase.statistics;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-[#666]/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-[#888] hover:text-white transition-colors font-mono text-sm"
            >
              back
            </button>
            <div className="h-4 w-px bg-[#666]/30" />
            <div>
              <span className="text-sm font-mono text-white">{juryCase.id.toUpperCase()}</span>
              <span className="text-xs font-mono text-[#666] ml-2">
                {juryCase.suspicionScore}% suspicion
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <div className="text-right">
              <span className="text-[#666]">suspect: </span>
              <span className={juryCase.suspectColor === 'white' ? 'text-white' : 'text-[#888]'}>
                {juryCase.suspectUsername}
              </span>
              <span className="text-[#666] ml-1">({juryCase.suspectRating})</span>
            </div>
            <span className="text-[#666]">vs</span>
            <div>
              <span className={juryCase.suspectColor === 'black' ? 'text-white' : 'text-[#888]'}>
                {juryCase.opponentUsername}
              </span>
              <span className="text-[#666] ml-1">({juryCase.opponentRating})</span>
            </div>
            <div className="text-[#666]">
              {juryCase.timeControl} / {juryCase.opening}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_400px] gap-4 p-4">
        {/* Left: Board + Playback */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Chess Board */}
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="h-full max-h-full aspect-square bg-black border border-[#666]/30">
              <ChessBoard
                position={moveViewer.currentFen}
                orientation={juryCase.suspectColor}
                lastMove={
                  moveViewer.currentMove
                    ? { from: moveViewer.currentMove.from as Square, to: moveViewer.currentMove.to as Square }
                    : null
                }
              />
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex-shrink-0 bg-[#0a0a0a] border border-[#666]/30 p-4">
            {/* Progress */}
            <div className="mb-3">
              <div className="h-1 bg-black border border-[#666]/30">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${moveViewer.totalMoves > 0 ? ((moveViewer.currentMoveIndex + 1) / moveViewer.totalMoves) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] font-mono text-[#666]">
                <span>{moveViewer.currentMoveIndex < 0 ? '-' : moveViewer.currentMoveIndex + 1}</span>
                <span>{moveViewer.totalMoves}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              <ControlButton onClick={moveViewer.goToStart} title="Start">
                |&lt;
              </ControlButton>
              <ControlButton onClick={moveViewer.goBack} title="Back">
                &lt;
              </ControlButton>
              <button
                onClick={moveViewer.togglePlayback}
                className="w-12 h-10 bg-white text-black font-mono text-sm hover:bg-[#ccc] transition-colors flex items-center justify-center"
              >
                {moveViewer.isPlaying ? '||' : '>'}
              </button>
              <ControlButton onClick={moveViewer.goForward} title="Forward">
                &gt;
              </ControlButton>
              <ControlButton onClick={moveViewer.goToEnd} title="End">
                &gt;|
              </ControlButton>
            </div>

            {/* Speed + Move Analysis Toggle */}
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1">
                {[0.5, 1, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => moveViewer.setPlaybackSpeed(speed)}
                    className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                      moveViewer.playbackSpeed === speed
                        ? 'bg-white text-black'
                        : 'text-[#666] hover:text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-[#666]/30" />

              <button
                onClick={() => setShowMoveAnalysis(!showMoveAnalysis)}
                className={`px-3 py-0.5 text-xs font-mono border transition-colors ${
                  showMoveAnalysis
                    ? 'bg-white text-black border-white'
                    : 'text-[#666] border-[#666]/30 hover:border-white hover:text-white'
                }`}
              >
                move analysis
              </button>
            </div>
          </div>
        </div>

        {/* Right: Analysis + Verdict */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
          {/* Statistical Analysis Panel */}
          <StatisticalAnalysis stats={stats} suspectRating={juryCase.suspectRating} />

          {/* Move-by-move analysis (when enabled) */}
          {showMoveAnalysis && (
            <div className="bg-[#0a0a0a] border border-[#666]/30 p-4">
              <p className="text-xs font-mono text-[#666] uppercase mb-2">move analysis</p>
              <p className="text-xs font-mono text-[#888]">
                Move {moveViewer.currentMoveIndex + 1}: {moveViewer.currentMove?.san || 'starting position'}
              </p>
              {/* Placeholder for detailed move analysis */}
              <div className="mt-2 p-2 bg-black border border-[#666]/30 text-xs font-mono text-[#666]">
                Engine correlation, timing data, and input metrics for this move would appear here.
              </div>
            </div>
          )}

          {/* Verdict Panel */}
          <JuryVerdictPanel
            caseId={juryCase.id}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Small control button for playback.
 */
function ControlButton({
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
      className="w-10 h-10 bg-black border border-[#666]/30 text-[#888] font-mono text-sm hover:text-white hover:border-white transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  );
}

/**
 * Statistical Analysis Panel
 * Shows all the metrics jurors need to evaluate the case.
 */
function StatisticalAnalysis({
  stats,
  suspectRating,
}: {
  stats: JuryCase['statistics'];
  suspectRating: number;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#666]/30">
      {/* Header */}
      <div className="p-3 border-b border-[#666]/30">
        <p className="text-xs font-mono text-[#666] uppercase">statistical analysis</p>
        <p className="text-[10px] font-mono text-[#666] mt-0.5">
          comparing to expected values for {suspectRating} rating
        </p>
      </div>

      {/* Metrics */}
      <div className="p-3 space-y-4">
        {/* Centipawn Loss */}
        <MetricSection title="centipawn loss">
          <MetricRow
            label="Average CPL"
            value={stats.avgCentipawnLoss.toFixed(1)}
            expected={stats.expectedCentipawnLossForRating.toFixed(1)}
            isAnomaly={stats.avgCentipawnLoss < stats.expectedCentipawnLossForRating * 0.6}
            lowerIsBetter
          />
          <MetricRow
            label="Critical Position CPL"
            value={stats.criticalPositionCPL.toFixed(1)}
            expected={stats.expectedCriticalCPL.toFixed(1)}
            isAnomaly={stats.criticalPositionCPL < stats.expectedCriticalCPL * 0.5}
            lowerIsBetter
          />
        </MetricSection>

        {/* Engine Correlation */}
        <MetricSection title="engine correlation">
          <MetricRow
            label="Top-1 Match Rate"
            value={`${(stats.top1EngineCorrelation * 100).toFixed(1)}%`}
            expected={`${(stats.expectedTop1ForRating * 100).toFixed(1)}%`}
            isAnomaly={stats.top1EngineCorrelation > stats.expectedTop1ForRating * 1.4}
          />
          <MetricRow
            label="Top-3 Match Rate"
            value={`${(stats.top3EngineCorrelation * 100).toFixed(1)}%`}
            expected={`${(stats.expectedTop3ForRating * 100).toFixed(1)}%`}
            isAnomaly={stats.top3EngineCorrelation > stats.expectedTop3ForRating * 1.3}
          />
        </MetricSection>

        {/* Critical Position Accuracy */}
        <MetricSection title="critical positions">
          <MetricRow
            label="Accuracy"
            value={`${(stats.criticalAccuracy * 100).toFixed(1)}%`}
            expected={`${(stats.expectedCriticalAccuracy * 100).toFixed(1)}%`}
            isAnomaly={stats.criticalAccuracy > stats.expectedCriticalAccuracy * 1.5}
          />
          <div className="text-[10px] font-mono text-[#666]">
            {stats.criticalPositionsCorrect} / {stats.criticalPositionCount} critical positions found correctly
          </div>
        </MetricSection>

        {/* Timing Analysis */}
        <MetricSection title="timing analysis">
          <MetricRow
            label="Avg Move Time"
            value={`${(stats.avgMoveTimeMs / 1000).toFixed(1)}s`}
            expected="-"
          />
          <MetricRow
            label="Time Variance"
            value={`${(stats.moveTimeVariance / 1000).toFixed(1)}s`}
            expected="-"
            isAnomaly={stats.moveTimeVariance < 1500}
            lowerIsBetter
          />
          <FlagRow
            label="Suspicious Timing Patterns"
            value={stats.suspiciousTimingPatterns}
            threshold={2}
          />
          <FlagRow
            label="Instant Moves After Think"
            value={stats.instantMovesAfterThink}
            threshold={1}
          />
        </MetricSection>

        {/* Input Analysis */}
        <MetricSection title="input analysis">
          <MetricRow
            label="Mouse Linearity"
            value={`${(stats.avgMouseLinearity * 100).toFixed(0)}%`}
            expected="30-60%"
            isAnomaly={stats.avgMouseLinearity > 0.70}
          />
          <MetricRow
            label="Micro-Corrections"
            value={stats.microCorrectionCount.toString()}
            expected="15+"
            isAnomaly={stats.microCorrectionCount < 10}
            lowerIsBetter
          />
          <MetricRow
            label="Synthetic Input Score"
            value={`${(stats.syntheticInputScore * 100).toFixed(0)}%`}
            expected="< 30%"
            isAnomaly={stats.syntheticInputScore > 0.45}
          />
          <FlagRow
            label="Physics Violations"
            value={stats.physicsViolations}
            threshold={1}
          />
        </MetricSection>

        {/* Environment Flags */}
        <MetricSection title="environment flags">
          <FlagRow
            label="Focus Lost Events"
            value={stats.focusLostCount}
            threshold={5}
          />
          <FlagRow
            label="Focus Lost Before Best Move"
            value={stats.focusLostBeforeBestMove}
            threshold={2}
          />
          <FlagRow
            label="Suspicious Network Requests"
            value={stats.suspiciousNetworkRequests}
            threshold={1}
          />
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#888]">Screen Share Detected</span>
            <span className={stats.screenShareDetected ? 'text-red-400' : 'text-emerald-400'}>
              {stats.screenShareDetected ? 'YES' : 'no'}
            </span>
          </div>
        </MetricSection>
      </div>
    </div>
  );
}

/**
 * Section wrapper for metrics.
 */
function MetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-[#666] uppercase mb-2 border-b border-[#666]/20 pb-1">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/**
 * Row showing a metric with value vs expected.
 */
function MetricRow({
  label,
  value,
  expected,
  isAnomaly = false,
  lowerIsBetter: _lowerIsBetter = false,
}: {
  label: string;
  value: string;
  expected: string;
  isAnomaly?: boolean;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="text-[#888]">{label}</span>
      <div className="flex items-center gap-2">
        <span className={isAnomaly ? 'text-red-400' : 'text-white'}>{value}</span>
        <span className="text-[#666]">/ {expected}</span>
      </div>
    </div>
  );
}

/**
 * Row showing a flag count with threshold-based coloring.
 */
function FlagRow({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number;
  threshold: number;
}) {
  const isAboveThreshold = value >= threshold;
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="text-[#888]">{label}</span>
      <span className={isAboveThreshold ? 'text-red-400' : value > 0 ? 'text-amber-400' : 'text-emerald-400'}>
        {value}
      </span>
    </div>
  );
}

export default JuryCaseReview;
