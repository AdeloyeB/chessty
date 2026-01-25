'use client';

import { formatTime } from '@/lib/utils';

interface GameClockProps {
  time: number; // Time remaining in seconds
  isActive: boolean;
  initialTime?: number; // Initial time for the game (to calculate percentage)
  showLabel?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Chess Clock Component
 *
 * Color coding based on time remaining:
 * - Green: Above 50% of initial time remaining
 * - Amber: Between 50% and 30 seconds
 * - Red: Below 30 seconds
 * - Red + Blinking: Below 10 seconds (time trouble / zeitnot)
 */
export function GameClock({
  time,
  isActive,
  initialTime = 180, // Default 3 minutes
  showLabel = false,
  label = 'clock',
  size = 'md',
}: GameClockProps) {
  // Calculate time thresholds
  const halfwayPoint = initialTime / 2;
  const lowTime = 30; // 30 seconds
  const criticalTime = 10; // 10 seconds - blinking

  // Determine time state
  const isHealthy = time > halfwayPoint;
  const isHalfway = time <= halfwayPoint && time > lowTime;
  const isLow = time <= lowTime && time > criticalTime;
  const isCritical = time <= criticalTime;

  // Get color classes based on state
  const getColorClasses = () => {
    if (!isActive) {
      return 'text-white/30 border-white/15';
    }

    if (isCritical) {
      return 'text-red-500 border-red-500/50 animate-pulse';
    }

    if (isLow) {
      return 'text-red-400 border-red-400/30';
    }

    if (isHalfway) {
      return 'text-amber-400 border-amber-400/30';
    }

    // Healthy - green
    return 'text-green-400 border-green-400/30';
  };

  // Size classes
  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-lg px-3 py-1.5',
    lg: 'text-2xl px-4 py-2',
  };

  return (
    <div className="flex flex-col items-center">
      {showLabel && (
        <div className="text-[10px] font-mono text-white/30 lowercase mb-1">
          {label}
        </div>
      )}
      <div
        className={`
          font-mono tracking-wider transition-all duration-150
          bg-black border
          ${sizeClasses[size]}
          ${getColorClasses()}
          ${isActive && isCritical ? 'shadow-[0_0_10px_rgba(239,68,68,0.5)]' : ''}
          ${isActive && isLow && !isCritical ? 'shadow-[0_0_8px_rgba(248,113,113,0.3)]' : ''}
          ${isActive && isHalfway ? 'shadow-[0_0_6px_rgba(251,191,36,0.2)]' : ''}
          ${isActive && isHealthy ? 'shadow-[0_0_6px_rgba(74,222,128,0.2)]' : ''}
        `}
      >
        {formatTime(time)}
      </div>
    </div>
  );
}

/**
 * Match Clock Component - Shows total elapsed time
 */
interface MatchClockProps {
  elapsedSeconds: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function MatchClock({
  elapsedSeconds,
  showLabel = true,
  size = 'sm',
}: MatchClockProps) {
  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className="flex flex-col items-center">
      {showLabel && (
        <div className="text-[10px] font-mono text-white/30 lowercase mb-1">
          match
        </div>
      )}
      <div className={`font-mono text-white/50 ${sizeClasses[size]}`}>
        {formatElapsed(elapsedSeconds)}
      </div>
    </div>
  );
}
