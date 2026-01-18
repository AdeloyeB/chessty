'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSpectatorStore } from '@/store/spectator';
import { SpectatorView } from './SpectatorView';
import { formatTime } from '@/lib/utils';
import { USDCAmount } from '../wallet/USDCAmount';

export function ActiveGamesLobby() {
  const { getActiveGames } = useApi();
  const { spectateGame } = useWebSocket();
  const { isSpectating } = useSpectatorStore();

  const { data: games, isLoading, refetch } = useQuery({
    queryKey: ['activeGames'],
    queryFn: getActiveGames,
    refetchInterval: 5000,
  });

  if (isSpectating) {
    return <SpectatorView />;
  }

  if (isLoading) {
    return (
      <div className="card flex justify-center py-12">
        <span className="text-pure-white font-mono animate-blink">_</span>
      </div>
    );
  }

  if (!games?.length) {
    return (
      <div className="card text-center py-12">
        <p className="text-mid-light font-mono mb-2">no active games</p>
        <p className="text-xs text-mid font-mono mb-6">check back later to watch some chess</p>
        <button onClick={() => refetch()} className="btn btn-secondary">
          refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-mono text-mid-light mb-1">live</p>
          <h2 className="text-xl font-mono text-pure-white">active_games</h2>
        </div>
        <button onClick={() => refetch()} className="btn btn-secondary text-sm">
          refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {games.map((game: any) => (
          <div
            key={game.id}
            className="card-hover cursor-pointer"
            onClick={() => spectateGame(game.id)}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-pure-white border border-mid" />
                  <span className="text-pure-white font-mono">
                    {game.whitePlayer.username}
                  </span>
                  <span className="text-xs text-light font-mono">
                    {game.whitePlayer.eloRating}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-pure-black border border-mid" />
                  <span className="text-pure-white font-mono">
                    {game.blackPlayer.username}
                  </span>
                  <span className="text-xs text-light font-mono">
                    {game.blackPlayer.eloRating}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <USDCAmount amount={game.totalPot} size="sm" />
                <div className="text-xs text-mid-light font-mono">pool</div>
              </div>
            </div>

            <div className="flex justify-between text-sm pt-4 border-t border-mid/30">
              <div className="flex gap-4 font-mono text-xs">
                <div>
                  <span className="text-mid">w </span>
                  <span className="text-pure-white">{formatTime(game.whiteTimeRemaining)}</span>
                </div>
                <div>
                  <span className="text-mid">b </span>
                  <span className="text-pure-white">{formatTime(game.blackTimeRemaining)}</span>
                </div>
              </div>
              <div className="text-mid-light font-mono text-xs">
                move {game.moveCount}
              </div>
            </div>

            <div className="mt-4 text-center">
              <span className="text-pure-white text-xs font-mono border-b border-pure-white/50">watch</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
