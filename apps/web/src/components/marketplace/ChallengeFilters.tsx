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
    <div className="flex flex-wrap gap-2 mb-4">
      {/* Game Mode Filter */}
      <div className="flex gap-1">
        <button
          onClick={() => handleGameModeChange('all')}
          className={`px-3 py-1 text-xs font-mono border transition-all ${
            gameMode === 'all'
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          all
        </button>
        <button
          onClick={() => handleGameModeChange('standard')}
          className={`px-3 py-1 text-xs font-mono border transition-all ${
            gameMode === 'standard'
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          standard
        </button>
        <button
          onClick={() => handleGameModeChange('chess960')}
          className={`px-3 py-1 text-xs font-mono border transition-all ${
            gameMode === 'chess960'
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          960
        </button>
      </div>

      {/* Time Control Filter */}
      <div className="flex gap-1">
        <button
          onClick={() => handleTimeControlChange('all')}
          className={`px-3 py-1 text-xs font-mono border transition-all ${
            timeControlKey === 'all'
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          any time
        </button>
        {Object.entries(CHALLENGE_TIME_CONTROLS).map(([key, value]) => (
          <button
            key={key}
            onClick={() => handleTimeControlChange(key)}
            className={`px-3 py-1 text-xs font-mono border transition-all ${
              timeControlKey === key
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
            }`}
          >
            {value.label}
          </button>
        ))}
      </div>
    </div>
  );
}
