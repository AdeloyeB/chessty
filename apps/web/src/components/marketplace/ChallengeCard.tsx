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
          ? 'bg-black border-usdc/30'
          : 'bg-black border-white/15 hover:border-white/30'
      }`}
    >
      {/* Header: Creator info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-mono text-sm">
            {challenge.creator.username}
          </span>
          <span className="text-xs font-mono text-white/50">
            ({challenge.creator.eloRating})
          </span>
        </div>
        {challenge.gameMode === 'chess960' && (
          <span className="text-xs font-mono text-usdc bg-usdc/10 px-2 py-0.5">
            960
          </span>
        )}
      </div>

      {/* Details grid - bento style */}
      <div className="grid grid-cols-2 mb-3 border border-white/15">
        <div className="p-2 bg-black border-r border-white/15">
          <p className="text-xs font-mono text-white/50 lowercase">time</p>
          <p className="text-white font-mono text-sm lowercase">{timeLabel}</p>
        </div>
        <div className="p-2 bg-black">
          <p className="text-xs font-mono text-white/50 lowercase">stake</p>
          <USDCAmount amount={challenge.stakeAmount} size="sm" />
        </div>
      </div>

      {/* ELO range if set */}
      {(challenge.minElo || challenge.maxElo) && (
        <p className="text-xs font-mono text-white/50 mb-3 lowercase">
          elo: {challenge.minElo || '?'} - {challenge.maxElo || '?'}
        </p>
      )}

      {/* Action button */}
      {isOwnChallenge ? (
        <div className="text-center text-xs font-mono text-white/50 lowercase">
          your challenge
        </div>
      ) : (
        <button
          onClick={() => onAccept(challenge.id)}
          disabled={!canAccept}
          className={`w-full py-2 text-sm font-mono border transition-all lowercase ${
            canAccept
              ? 'bg-white text-black border-white hover:bg-white/90'
              : 'bg-black text-white/20 cursor-not-allowed border-white/10'
          }`}
        >
          accept
        </button>
      )}
    </div>
  );
}
