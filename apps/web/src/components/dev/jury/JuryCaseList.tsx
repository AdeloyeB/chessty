'use client';

/**
 * JuryCaseList Component
 *
 * Displays a paginated list of cases available for jury review.
 * Shows case ID, suspicion score, priority badge, and time remaining.
 *
 * WHAT THIS COMPONENT DOES:
 * - Lists all pending cases that need jury review
 * - Uses pagination (no scrolling) per project guidelines
 * - Color-codes priority levels for quick triage
 * - Shows countdown timer for case expiration
 */

import { useState, useEffect } from 'react';
import { PaginatedList } from '@/components/ui/PaginatedGrid';
import type { JuryCase, CasePriority } from './mockJuryData';

interface JuryCaseListProps {
  cases: JuryCase[];
  onSelectCase: (caseId: string) => void;
}

// Priority badge styling
const PRIORITY_STYLES: Record<CasePriority, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'CRITICAL' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'HIGH' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'MEDIUM' },
  low: { bg: 'bg-white/10', text: 'text-white/50', label: 'LOW' },
};

/**
 * Format time remaining until case expires.
 * Returns a human-readable string like "2h 15m" or "45m".
 */
function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) return 'expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

/**
 * Individual case row in the list.
 */
function CaseRow({
  juryCase,
  onSelect,
}: {
  juryCase: JuryCase;
  onSelect: () => void;
}) {
  const [timeRemaining, setTimeRemaining] = useState(formatTimeRemaining(juryCase.expiresAt));
  const priority = PRIORITY_STYLES[juryCase.priority];

  // Update time remaining every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(juryCase.expiresAt));
    }, 60000);

    return () => clearInterval(interval);
  }, [juryCase.expiresAt]);

  // Suspicion score color based on value
  const scoreColor = juryCase.suspicionScore >= 70
    ? 'text-red-400'
    : juryCase.suspicionScore >= 50
    ? 'text-orange-400'
    : juryCase.suspicionScore >= 30
    ? 'text-amber-400'
    : 'text-white/50';

  return (
    <div className="bg-[#0a0a0a] border border-[#666]/30 p-4 hover:border-white/30 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Case info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {/* Case ID */}
            <span className="font-mono text-sm text-white">
              {juryCase.id.toUpperCase()}
            </span>

            {/* Priority badge */}
            <span className={`px-2 py-0.5 text-[10px] font-mono font-semibold ${priority.bg} ${priority.text}`}>
              {priority.label}
            </span>
          </div>

          {/* Player info */}
          <div className="flex items-center gap-2 text-xs font-mono text-[#888]">
            <span className={scoreColor}>
              {juryCase.suspicionScore}% suspicious
            </span>
            <span className="text-[#666]">/</span>
            <span>{juryCase.suspectUsername}</span>
            <span className="text-[#666]">({juryCase.suspectRating})</span>
            <span className="text-[#666]">vs</span>
            <span>{juryCase.opponentUsername}</span>
          </div>

          {/* Game details */}
          <div className="flex items-center gap-2 mt-1 text-xs font-mono text-[#666]">
            <span>{juryCase.timeControl}</span>
            <span>/</span>
            <span>{juryCase.opening}</span>
            <span>/</span>
            <span>${juryCase.wagerAmount}</span>
          </div>
        </div>

        {/* Right: Time remaining + action */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Time remaining */}
          <div className="text-right">
            <p className="text-[10px] font-mono text-[#666] uppercase">expires</p>
            <p className={`text-sm font-mono ${
              timeRemaining === 'expired' ? 'text-red-400' :
              timeRemaining.includes('m') && !timeRemaining.includes('h') ? 'text-amber-400' :
              'text-white/70'
            }`}>
              {timeRemaining}
            </p>
          </div>

          {/* Review button */}
          <button
            onClick={onSelect}
            className="px-4 py-2 bg-black border border-[#666]/50 text-white/70 font-mono text-xs hover:border-white hover:text-white transition-colors"
          >
            review
          </button>
        </div>
      </div>
    </div>
  );
}

export function JuryCaseList({ cases, onSelectCase }: JuryCaseListProps) {
  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 flex items-center justify-center border border-[#666]/30 rounded-full">
          <span className="text-2xl text-[#666]">?</span>
        </div>
        <p className="text-sm font-mono text-[#888] mb-1">no cases available</p>
        <p className="text-xs font-mono text-[#666]">check back later for new cases to review</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-mono text-white">available_cases</h3>
          <p className="text-xs font-mono text-[#666] mt-0.5">
            {cases.length} case{cases.length !== 1 ? 's' : ''} pending review
          </p>
        </div>
      </div>

      {/* Case list with pagination */}
      <PaginatedList
        items={cases}
        itemsPerPage={5}
        renderItem={(juryCase) => (
          <CaseRow
            key={juryCase.id}
            juryCase={juryCase}
            onSelect={() => onSelectCase(juryCase.id)}
          />
        )}
        emptyMessage="no cases available"
        gap="sm"
      />
    </div>
  );
}

export default JuryCaseList;
