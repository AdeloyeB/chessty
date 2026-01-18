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
            ? 'bg-pure-white text-pure-black border-pure-white animate-pulse'
            : isLow
            ? 'bg-pure-white/80 text-pure-black border-pure-white/80'
            : 'bg-pure-white text-pure-black border-pure-white'
          : 'bg-pure-black text-mid-light border-mid/50'
      }`}
    >
      {formatTime(time)}
    </div>
  );
}
