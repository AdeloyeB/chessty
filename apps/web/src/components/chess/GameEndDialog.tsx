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
    <div className="fixed inset-0 bg-retro-dark/95 flex items-center justify-center z-50">
      <div className="bg-retro-mid border border-retro-blue/30 p-6 max-w-md w-full text-center shadow-[0_0_40px_rgba(59,130,246,0.3)]">
        <p className="text-xs font-mono text-retro-muted mb-4">game_over</p>

        <h2 className={`text-3xl font-mono mb-2 ${
          isWinner ? 'text-retro-cyan shadow-[0_0_20px_rgba(6,182,212,0.5)]' : isDraw ? 'text-retro-glow' : 'text-red-400'
        }`}>
          {resultText}
        </h2>

        <p className="text-retro-glow font-mono mb-8">
          {result?.replace('_', ' ')}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-retro-dark border border-retro-blue/30">
            <p className="text-xs font-mono text-retro-muted mb-2">elo_change</p>
            <p className={`text-2xl font-mono ${(eloChange || 0) >= 0 ? 'text-retro-cyan' : 'text-red-400'}`}>
              {(eloChange || 0) >= 0 ? '+' : ''}
              {eloChange || 0}
            </p>
          </div>
          <div className="p-4 bg-retro-dark border border-retro-blue/30">
            <p className="text-xs font-mono text-retro-muted mb-2">
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
            <div className="w-12 h-12 mx-auto mb-2 bg-pure-white flex items-center justify-center text-pure-black font-mono border border-retro-blue/50">
              {whitePlayer?.username?.[0]?.toLowerCase()}
            </div>
            <div className="text-pure-white font-mono">{whitePlayer?.username}</div>
            <div className="text-retro-muted text-xs font-mono">{whitePlayer?.eloRating}</div>
          </div>
          <div className="text-retro-blue font-mono">vs</div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-board-dark flex items-center justify-center text-pure-white font-mono border border-retro-blue/50">
              {blackPlayer?.username?.[0]?.toLowerCase()}
            </div>
            <div className="text-pure-white font-mono">{blackPlayer?.username}</div>
            <div className="text-retro-muted text-xs font-mono">{blackPlayer?.eloRating}</div>
          </div>
        </div>

        <button onClick={reset} className="w-full px-4 py-3 bg-retro-blue text-pure-white border border-retro-blue font-mono hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all">
          back_to_lobby
        </button>
      </div>
    </div>
  );
}
