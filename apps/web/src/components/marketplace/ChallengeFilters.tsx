'use client';

import { useState } from 'react';
import type { GameMode } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';

interface ChallengeFiltersProps {
  onFilterChange: (filters: ChallengeFilters) => void;
}

export interface ChallengeFilters {
  gameMode: GameMode | 'all';
  timeControlKey: string | 'all';
  minStake: number | null;
  maxStake: number | null;
}

export function ChallengeFilters({ onFilterChange }: ChallengeFiltersProps) {
  const [gameMode, setGameMode] = useState<GameMode | 'all'>('all');
  const [timeControlKey, setTimeControlKey] = useState<string>('all');

  const handleGameModeChange = (mode: GameMode | 'all') => {
    setGameMode(mode);
    onFilterChange({
      gameMode: mode,
      timeControlKey,
      minStake: null,
      maxStake: null,
    });
  };

  const handleTimeControlChange = (key: string) => {
    setTimeControlKey(key);
    onFilterChange({
      gameMode,
      timeControlKey: key,
      minStake: null,
      maxStake: null,
    });
  };

  return (
    <div className="flex flex-wrap gap-4 mb-4">
      {/* Game Mode Filter */}
      <div className="flex">
        <button
          onClick={() => handleGameModeChange('all')}
          className={`px-3 py-1 text-xs font-mono border-y border-l border-r border-white/15 transition-all lowercase ${
            gameMode === 'all'
              ? 'bg-white text-black'
              : 'bg-black text-white/50 hover:text-white'
          }`}
        >
          all
        </button>
        <button
          onClick={() => handleGameModeChange('standard')}
          className={`px-3 py-1 text-xs font-mono border-y border-r border-white/15 transition-all lowercase ${
            gameMode === 'standard'
              ? 'bg-white text-black'
              : 'bg-black text-white/50 hover:text-white'
          }`}
        >
          standard
        </button>
        <button
          onClick={() => handleGameModeChange('chess960')}
          className={`px-3 py-1 text-xs font-mono border-y border-r border-white/15 transition-all lowercase ${
            gameMode === 'chess960'
              ? 'bg-white text-black'
              : 'bg-black text-white/50 hover:text-white'
          }`}
        >
          960
        </button>
      </div>

      {/* Time Control Filter */}
      <div className="flex">
        <button
          onClick={() => handleTimeControlChange('all')}
          className={`px-3 py-1 text-xs font-mono border-y border-l border-r border-white/15 transition-all lowercase ${
            timeControlKey === 'all'
              ? 'bg-white text-black'
              : 'bg-black text-white/50 hover:text-white'
          }`}
        >
          any time
        </button>
        {Object.entries(CHALLENGE_TIME_CONTROLS).map(([key, value]) => (
          <button
            key={key}
            onClick={() => handleTimeControlChange(key)}
            className={`px-3 py-1 text-xs font-mono border-y border-r border-white/15 transition-all lowercase ${
              timeControlKey === key
                ? 'bg-white text-black'
                : 'bg-black text-white/50 hover:text-white'
            }`}
          >
            {value.label}
          </button>
        ))}
      </div>
    </div>
  );
}
