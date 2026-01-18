'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuthStore } from '@/store/auth';
import { USDCAmount } from '../wallet/USDCAmount';

export function GameHistory() {
  const { getGameHistory } = useApi();
  const { user } = useAuthStore();

  const { data: games, isLoading } = useQuery({
    queryKey: ['gameHistory'],
    queryFn: () => getGameHistory(50, 0),
  });

  if (isLoading) {
    return (
      <div className="card flex justify-center py-8">
        <span className="animate-blink text-pure-white font-mono">_</span>
      </div>
    );
  }

  if (!games?.length) {
    return (
      <div className="card text-center py-8">
        <p className="text-mid-light font-mono text-sm">no games played yet</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-xs font-mono text-mid-light">recent</p>
      <p className="text-xl font-mono text-pure-white mb-6">game_history</p>

      <div className="space-y-2">
        {games.map((game: any) => {
          const isWhite = game.whitePlayerId === user?.id;
          const won = game.winnerId === user?.id;
          const draw = game.winnerId === null;

          return (
            <div
              key={game.id}
              className="flex items-center justify-between p-3 bg-pure-black border border-mid/30"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 flex items-center justify-center font-mono text-sm border ${
                    won
                      ? 'bg-pure-white text-pure-black border-pure-white'
                      : draw
                      ? 'bg-mid/20 text-light border-mid/50'
                      : 'bg-pure-black text-mid-light border-mid/50'
                  }`}
                >
                  {won ? 'w' : draw ? 'd' : 'l'}
                </div>
                <div>
                  <div className="text-pure-white font-mono text-sm">
                    <span className={isWhite ? 'text-pure-white' : 'text-mid-light'}>
                      {isWhite ? 'you' : 'opponent'}
                    </span>
                    <span className="text-mid mx-2">vs</span>
                    <span className={!isWhite ? 'text-pure-white' : 'text-mid-light'}>
                      {!isWhite ? 'you' : 'opponent'}
                    </span>
                  </div>
                  <div className="text-xs text-mid-light font-mono">
                    {game.result?.replace('_', ' ')} • {new Date(game.endedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`font-mono ${
                    game.eloChange > 0 ? 'text-pure-white' : 'text-mid-light'
                  }`}
                >
                  {game.eloChange > 0 ? '+' : ''}{game.eloChange}
                </div>
                <div className="text-xs font-mono text-mid-light flex items-center gap-1">
                  <USDCAmount amount={game.stakeAmount} size="sm" /> position
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
