'use client';

import { formatTime } from '@/lib/utils';

interface GameClockProps {
  time: number;
  isActive: boolean;
}

export function GameClock({ time, isActive }: GameClockProps) {
  const isLow = time < 30;
  const isCritical = time < 10;

  return (
    <div
      className={`px-4 py-2 font-mono text-lg tracking-wider transition-all duration-150 border ${
        isActive
          ? isCritical
            ? 'bg-red-500 text-pure-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse'
            : isLow
            ? 'bg-retro-blue/80 text-pure-white border-retro-blue/80 shadow-[0_0_10px_rgba(59,130,246,0.5)]'
            : 'bg-retro-blue text-pure-white border-retro-blue shadow-[0_0_15px_rgba(59,130,246,0.5)]'
          : 'bg-retro-dark text-retro-muted border-retro-blue/30'
      }`}
    >
      {formatTime(time)}
    </div>
  );
}
