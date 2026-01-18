'use client';

import { useGameStore } from '@/store/game';
import { useAuthStore } from '@/store/auth';
import { USDCAmount } from '../wallet/USDCAmount';

export function GameEndDialog() {
  const { result, eloChange, game, whitePlayer, blackPlayer, playerColor, reset } =
    useGameStore();
  const { user } = useAuthStore();

  const winnerId = game?.winnerId;
  const isWinner = winnerId === user?.id;
  const isDraw = !winnerId;

  const resultText = isDraw
    ? 'draw'
    : isWinner
    ? 'victory'
    : 'defeat';

  return (
    <div className="fixed inset-0 bg-pure-black/95 flex items-center justify-center z-50">
      <div className="card max-w-md w-full text-center">
        <p className="text-xs font-mono text-mid-light mb-4">game_over</p>

        <h2 className="text-3xl font-mono text-pure-white mb-2">
          {resultText}
        </h2>

        <p className="text-mid-light font-mono mb-8">
          {result?.replace('_', ' ')}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light mb-2">elo_change</p>
            <p className="text-2xl font-mono text-pure-white">
              {(eloChange || 0) >= 0 ? '+' : ''}
              {eloChange || 0}
            </p>
          </div>
          <div className="p-4 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light mb-2">
              {isDraw ? 'returned' : isWinner ? 'returns' : 'position'}
            </p>
            <USDCAmount
              amount={
                isDraw
                  ? Number(game?.stakeAmount ?? 0)
                  : isWinner
                  ? Number(game?.totalPot ?? 0)
                  : Number(game?.stakeAmount ?? 0)
              }
              size="lg"
              className="justify-center"
            />
          </div>
        </div>

        {/* Player Comparison */}
        <div className="flex items-center justify-center gap-6 mb-8 text-sm">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-pure-white flex items-center justify-center text-pure-black font-mono border border-mid">
              {whitePlayer?.username?.[0]?.toLowerCase()}
            </div>
            <div className="text-pure-white font-mono">{whitePlayer?.username}</div>
            <div className="text-light text-xs font-mono">{whitePlayer?.eloRating}</div>
          </div>
          <div className="text-mid font-mono">vs</div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-pure-black flex items-center justify-center text-pure-white font-mono border border-mid">
              {blackPlayer?.username?.[0]?.toLowerCase()}
            </div>
            <div className="text-pure-white font-mono">{blackPlayer?.username}</div>
            <div className="text-light text-xs font-mono">{blackPlayer?.eloRating}</div>
          </div>
        </div>

        <button onClick={reset} className="w-full btn btn-primary">
          back_to_lobby
        </button>
      </div>
    </div>
  );
}
