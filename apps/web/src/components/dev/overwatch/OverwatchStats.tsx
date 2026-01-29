'use client';

/**
 * OverwatchStats Component
 *
 * Displays the current arbiter's personal statistics and ranking.
 *
 * WHAT THIS COMPONENT DOES:
 * - Shows investigator score as a visual progress bar (0-1 scale)
 * - Displays cases reviewed, correct verdicts, and accuracy rate
 * - Shows rank among all arbiters
 *
 * WHY THESE METRICS MATTER:
 * - Investigator Score: Determines weight of verdicts in final decisions
 * - Accuracy Rate: How often the arbiter agrees with consensus verdicts
 * - Rank: Competitive element to encourage careful review
 */

import type { ArbiterStats } from './mockOverwatchData';

interface OverwatchStatsProps {
  stats: ArbiterStats;
}

export function OverwatchStats({ stats }: OverwatchStatsProps) {
  // Score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 0.85) return 'text-emerald-400';
    if (score >= 0.70) return 'text-amber-400';
    if (score >= 0.50) return 'text-orange-400';
    return 'text-red-400';
  };

  // Rank badge color
  const getRankColor = (rank: number, total: number) => {
    const percentile = (rank / total) * 100;
    if (percentile <= 10) return 'text-amber-400 border-amber-400/30 bg-amber-500/10'; // Top 10%
    if (percentile <= 25) return 'text-white border-white/30 bg-white/5'; // Top 25%
    return 'text-[#888] border-[#666]/30'; // Everyone else
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-mono text-white">arbiter_statistics</h3>
        <p className="text-xs font-mono text-[#666] mt-0.5">
          your performance as an Arbiter Overwatch member
        </p>
      </div>

      {/* Investigator Score - Main metric */}
      <div className="bg-[#0a0a0a] border border-[#666]/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-mono text-[#666] uppercase">investigator score</p>
            <p className={`text-2xl font-mono font-semibold mt-1 ${getScoreColor(stats.investigatorScore)}`}>
              {(stats.investigatorScore * 100).toFixed(1)}%
            </p>
          </div>
          <div className={`px-3 py-1 text-xs font-mono border ${getRankColor(stats.rank, stats.totalArbiters)}`}>
            #{stats.rank} of {stats.totalArbiters}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-black border border-[#666]/30">
          <div
            className={`h-full transition-all duration-500 ${
              stats.investigatorScore >= 0.85 ? 'bg-emerald-500' :
              stats.investigatorScore >= 0.70 ? 'bg-amber-500' :
              stats.investigatorScore >= 0.50 ? 'bg-orange-500' :
              'bg-red-500'
            }`}
            style={{ width: `${stats.investigatorScore * 100}%` }}
          />
        </div>

        <p className="text-[10px] font-mono text-[#666] mt-2">
          higher scores give more weight to your verdicts in final decisions
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox
          label="cases reviewed"
          value={stats.casesReviewed}
          sublabel={`${stats.correctVerdicts} correct`}
        />
        <StatBox
          label="accuracy rate"
          value={`${stats.accuracyRate}%`}
          sublabel="vs consensus"
          highlight={stats.accuracyRate >= 75}
        />
        <StatBox
          label="rank"
          value={`#${stats.rank}`}
          sublabel={`top ${Math.round((stats.rank / stats.totalArbiters) * 100)}%`}
          highlight={stats.rank <= 10}
        />
      </div>

      {/* Accuracy Breakdown */}
      <div className="bg-[#0a0a0a] border border-[#666]/30 p-4">
        <p className="text-xs font-mono text-[#666] uppercase mb-3">accuracy breakdown</p>

        <div className="space-y-2">
          <AccuracyBar
            label="Correct guilty verdicts"
            value={Math.round(stats.correctVerdicts * 0.4)}
            total={Math.round(stats.casesReviewed * 0.35)}
          />
          <AccuracyBar
            label="Correct innocent verdicts"
            value={Math.round(stats.correctVerdicts * 0.6)}
            total={Math.round(stats.casesReviewed * 0.65)}
          />
        </div>
      </div>

      {/* Tips */}
      <div className="bg-[#0a0a0a] border border-[#666]/30 p-4">
        <p className="text-xs font-mono text-[#666] uppercase mb-2">tips to improve</p>
        <ul className="space-y-1 text-xs font-mono text-[#888]">
          <li>- Look for patterns across multiple metrics, not single indicators</li>
          <li>- Critical position accuracy is weighted heavily</li>
          <li>- Consider the player&apos;s rating when evaluating statistics</li>
          <li>- Timing consistency can indicate automation</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Small stat box with label, value, and sublabel.
 */
function StatBox({
  label,
  value,
  sublabel,
  highlight = false,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#666]/30 p-3">
      <p className="text-[10px] font-mono text-[#666] uppercase">{label}</p>
      <p className={`text-lg font-mono font-semibold mt-1 ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-[10px] font-mono text-[#666] mt-0.5">{sublabel}</p>
    </div>
  );
}

/**
 * Horizontal accuracy bar with label and ratio.
 */
function AccuracyBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-[#888]">{label}</span>
        <span className="text-xs font-mono text-[#666]">{value}/{total}</span>
      </div>
      <div className="h-1 bg-black border border-[#666]/30">
        <div
          className={`h-full ${percentage >= 80 ? 'bg-emerald-500' : percentage >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default OverwatchStats;
