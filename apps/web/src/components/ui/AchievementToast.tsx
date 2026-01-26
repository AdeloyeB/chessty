'use client';

/**
 * AchievementToast
 *
 * Toast notification for achievement unlocks.
 * Displays with a celebratory animation when an achievement is earned.
 *
 * ★ Insight ─────────────────────────────────────
 * Toast notifications appear temporarily to inform users of events.
 * For achievements, we use a special design with:
 * - Icon display from the achievement
 * - Celebratory border/glow effect
 * - Dismissible with click
 * ─────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import type { AchievementCategory } from '@chess-game/shared';

interface AchievementToastProps {
  id: string;
  title: string;
  message?: string;
  icon?: string;
  category?: AchievementCategory;
  onDismiss: (id: string) => void;
}

// Category colors for different achievement types
const categoryColors: Record<AchievementCategory, string> = {
  games: 'border-blue-400/50 shadow-blue-400/20',
  elo: 'border-purple-400/50 shadow-purple-400/20',
  streaks: 'border-orange-400/50 shadow-orange-400/20',
  special_moves: 'border-green-400/50 shadow-green-400/20',
  milestones: 'border-yellow-400/50 shadow-yellow-400/20',
};

export function AchievementToast({
  id,
  title,
  message,
  icon = '🏆',
  category = 'milestones',
  onDismiss,
}: AchievementToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle dismiss with animation
  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(id), 200);
  };

  const colorClasses = categoryColors[category];

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={handleDismiss}
      className={`
        relative overflow-hidden
        bg-off-black border ${colorClasses}
        shadow-lg shadow-${category === 'milestones' ? 'yellow' : 'blue'}-400/10
        cursor-pointer
        transition-all duration-200 ease-out
        ${isVisible && !isLeaving
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-4'
        }
      `}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />

      <div className="relative flex items-center gap-4 p-4">
        {/* Achievement icon */}
        <div className="w-12 h-12 flex items-center justify-center bg-pure-black border border-mid/30 text-2xl shrink-0">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-mid-light uppercase tracking-wider">
              achievement unlocked
            </span>
          </div>
          <p className="text-pure-white font-mono text-sm truncate lowercase">
            {title}
          </p>
          {message && (
            <p className="text-xs text-mid-light font-mono truncate lowercase">
              {message}
            </p>
          )}
        </div>

        {/* Close hint */}
        <div className="text-mid/50 text-xs font-mono shrink-0">×</div>
      </div>
    </div>
  );
}

// Add shimmer animation to global styles or tailwind config
// @keyframes shimmer {
//   0% { transform: translateX(-100%); }
//   100% { transform: translateX(100%); }
// }
