'use client';

import type { HistoryGame } from '@chess-game/shared';
import { USDCAmount } from '@/components/wallet/USDCAmount';

interface GameInfoProps {
  game: HistoryGame;
}

export function GameInfo({ game }: GameInfoProps) {
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-pure-black border border-mid/30 p-4">
      <p className="text-xs font-mono text-mid-light mb-3">game_info</p>

      <div className="space-y-3">
        {/* Players */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-mono text-mid-light mb-1">you</p>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 border ${game.playerColor === 'white' ? 'bg-white' : 'bg-black border-mid/50'}`} />
              <span className="font-mono text-pure-white">{game.eloAtStart}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-mono text-mid-light mb-1">opponent</p>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 border ${game.playerColor === 'black' ? 'bg-white' : 'bg-black border-mid/50'}`} />
              <span className="font-mono text-pure-white">{game.opponent.username}</span>
              <span className="font-mono text-mid-light text-sm">({game.opponentEloAtStart})</span>
            </div>
          </div>
        </div>

        {/* Game Details */}
        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
          <InfoRow label="mode" value={game.gameMode === 'chess960' ? 'Chess960' : 'Standard'} />
          <InfoRow label="time" value={game.timeControlLabel} />
          <InfoRow label="opening" value={game.opening || 'Unknown'} />
          <InfoRow label="moves" value={game.moveCount.toString()} />
        </div>

        {/* Stakes */}
        <div className="pt-3 border-t border-mid/30">
          <div className="grid grid-cols-3 gap-4 text-sm font-mono">
            <div>
              <p className="text-xs text-mid-light mb-1">stake</p>
              <USDCAmount amount={game.stakeAmount} size="sm" />
            </div>
            <div>
              <p className="text-xs text-mid-light mb-1">pot</p>
              <USDCAmount amount={game.totalPot} size="sm" />
            </div>
            <div>
              <p className="text-xs text-mid-light mb-1">elo change</p>
              <span className={game.eloChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                {game.eloChange > 0 ? '+' : ''}{game.eloChange}
              </span>
            </div>
          </div>
        </div>

        {/* Date */}
        <div className="pt-3 border-t border-mid/30">
          <p className="text-xs font-mono text-mid-light">
            played: {formatDate(game.endedAt)}
          </p>
          <p className="text-xs font-mono text-mid-light mt-1">
            game id: <span className="text-mid">{game.id}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-mid-light">{label}: </span>
      <span className="text-pure-white">{value}</span>
    </div>
  );
}
