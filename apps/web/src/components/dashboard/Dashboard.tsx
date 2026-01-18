'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/game';
import { MatchmakingPanel } from '../matchmaking/MatchmakingPanel';
import { GameBoard } from '../chess/GameBoard';
import { LocalGame } from '../chess/LocalGame';
import { ActiveGamesLobby } from '../spectator/ActiveGamesLobby';
import { Leaderboard } from './Leaderboard';
import { GameHistory } from './GameHistory';

type Tab = 'practice' | 'play' | 'watch' | 'history' | 'leaderboard';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('practice');
  const { status } = useGameStore();

  // If in a game, show the game board
  if (status === 'playing' || status === 'matched' || status === 'queuing') {
    return <GameBoard />;
  }

  const tabs = [
    { id: 'practice', label: 'practice' },
    { id: 'play', label: 'find_game' },
    { id: 'watch', label: 'spectate' },
    { id: 'history', label: 'history' },
    { id: 'leaderboard', label: 'rankings' },
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-muted/20">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={activeTab === tab.id ? 'tab-active' : 'tab-inactive'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'practice' && <LocalGame />}
      {activeTab === 'play' && <MatchmakingPanel />}
      {activeTab === 'watch' && <ActiveGamesLobby />}
      {activeTab === 'history' && <GameHistory />}
      {activeTab === 'leaderboard' && <Leaderboard />}
    </div>
  );
}
