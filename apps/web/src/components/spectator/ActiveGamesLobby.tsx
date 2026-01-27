'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSpectatorStore } from '@/store/spectator';
import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { useFeatureFlag } from '@/store/flags';
import { SpectatorView } from './SpectatorView';
import { formatTime } from '@/lib/utils';
import { USDCAmount } from '../wallet/USDCAmount';

export function ActiveGamesLobby() {
  const { getActiveGames } = useApi();
  const { spectateGame, spectateMultiGame } = useWebSocket();
  const { isSpectating } = useSpectatorStore();
  const multiGameEnabled = useFeatureFlag('spectator_multi_game');
  const multiGameCount = useMultiSpectatorStore((s) => Object.keys(s.games).length);

  const { data: games, isLoading, refetch } = useQuery({
    queryKey: ['activeGames'],
    queryFn: getActiveGames,
    refetchInterval: 5000,
  });

  // Legacy single-game flow: show SpectatorView directly
  // Multi-game flow: the SpectatorViewManager handles view switching, so lobby just stays as lobby
  if (!multiGameEnabled && isSpectating) {
    return <SpectatorView />;
  }

  if (isLoading) {
    return (
      <div className="border border-white/15 bg-black flex justify-center py-12">
        <span className="text-white font-mono animate-blink">_</span>
      </div>
    );
  }

  if (!games?.length) {
    return (
      <div className="border border-white/15 bg-black text-center py-12">
        <p className="text-white/50 font-mono mb-2 lowercase">no active games</p>
        <p className="text-xs text-white/30 font-mono mb-6 lowercase">check back later to watch some chess</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 font-mono text-sm border border-white/15 text-white/50 hover:text-white hover:border-white transition-colors lowercase"
        >
          refresh
        </button>
      </div>
    );
  }

  return (
    <div className="border border-white/15">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/15">
        <div>
          <p className="text-xs font-mono text-white/50 lowercase">live</p>
          <h2 className="text-xl font-mono text-white lowercase">active_games</h2>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 font-mono text-xs border border-white/15 text-white/50 hover:text-white hover:border-white transition-colors lowercase"
        >
          refresh
        </button>
      </div>

      {/* Games Grid - bento style */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {games.map((game: any, index: number) => {
          const isRightColumn = index % 2 === 1;
          const isNotLastRow = index < games.length - 2 || (games.length % 2 === 1 && index < games.length - 1);
          return (
            <button
              type="button"
              key={game.id}
              className={`w-full text-left p-4 bg-black cursor-pointer hover:bg-white/5 transition-colors focus:outline-none focus:ring-1 focus:ring-white/50 ${
                !isRightColumn ? 'md:border-r md:border-white/15' : ''
              } ${isNotLastRow ? 'border-b border-white/15' : ''}`}
              onClick={() => multiGameEnabled ? spectateMultiGame(game.id) : spectateGame(game.id)}
              aria-label={`Watch ${game.whitePlayer.username} vs ${game.blackPlayer.username}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-white border border-white/50" />
                    <span className="text-white font-mono">
                      {game.whitePlayer.username}
                    </span>
                    <span className="text-xs text-white/30 font-mono">
                      {game.whitePlayer.eloRating}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-black border border-white/50" />
                    <span className="text-white font-mono">
                      {game.blackPlayer.username}
                    </span>
                    <span className="text-xs text-white/30 font-mono">
                      {game.blackPlayer.eloRating}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <USDCAmount amount={game.totalPot} size="sm" />
                  <div className="text-xs text-white/30 font-mono lowercase">pool</div>
                </div>
              </div>

              <div className="flex justify-between text-sm pt-4 border-t border-white/15">
                <div className="flex gap-4 font-mono text-xs">
                  <div>
                    <span className="text-white/30">w </span>
                    <span className="text-white">{formatTime(game.whiteTimeRemaining)}</span>
                  </div>
                  <div>
                    <span className="text-white/30">b </span>
                    <span className="text-white">{formatTime(game.blackTimeRemaining)}</span>
                  </div>
                </div>
                <div className="text-white/50 font-mono text-xs lowercase">
                  move {game.moveCount}
                </div>
              </div>

              <div className="mt-4 text-center">
                <span className="text-white text-xs font-mono border-b border-white/50 lowercase">watch</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
