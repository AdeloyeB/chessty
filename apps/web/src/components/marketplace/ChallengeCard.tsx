'use client';

import type { ChallengeWithCreator } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';

interface ChallengeCardProps {
  challenge: ChallengeWithCreator;
  onAccept: (challengeId: string) => void;
  isOwnChallenge: boolean;
  canAccept: boolean;
}

export function ChallengeCard({
  challenge,
  onAccept,
  isOwnChallenge,
  canAccept,
}: ChallengeCardProps) {
  const timeControl = CHALLENGE_TIME_CONTROLS[challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  const timeLabel = timeControl?.label || challenge.timeControlKey;

  return (
    <div
      className={`p-4 border transition-all ${
        isOwnChallenge
          ? 'bg-off-black border-usdc/30'
          : 'bg-pure-black border-mid/30 hover:border-light'
      }`}
    >
      {/* Header: Creator info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-pure-white font-mono text-sm">
            {challenge.creator.username}
          </span>
          <span className="text-xs font-mono text-mid-light">
            ({challenge.creator.eloRating})
          </span>
        </div>
        {challenge.gameMode === 'chess960' && (
          <span className="text-xs font-mono text-usdc bg-usdc/10 px-2 py-0.5">
            960
          </span>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-pure-black border border-mid/20">
          <p className="text-xs font-mono text-mid-light">time</p>
          <p className="text-pure-white font-mono text-sm">{timeLabel}</p>
        </div>
        <div className="p-2 bg-pure-black border border-mid/20">
          <p className="text-xs font-mono text-mid-light">stake</p>
          <USDCAmount amount={challenge.stakeAmount} size="sm" />
        </div>
      </div>

      {/* ELO range if set */}
      {(challenge.minElo || challenge.maxElo) && (
        <p className="text-xs font-mono text-mid-light mb-3">
          elo: {challenge.minElo || '?'} - {challenge.maxElo || '?'}
        </p>
      )}

      {/* Action button */}
      {isOwnChallenge ? (
        <div className="text-center text-xs font-mono text-mid-light">
          your challenge
        </div>
      ) : (
        <button
          onClick={() => onAccept(challenge.id)}
          disabled={!canAccept}
          className={`w-full btn text-sm ${
            canAccept
              ? 'btn-primary'
              : 'bg-off-black text-mid/30 cursor-not-allowed border border-mid/20'
          }`}
        >
          accept
        </button>
      )}
    </div>
  );
}
