'use client';

import { useEffect, useState } from 'react';
import type { ChallengeWithCreator } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';
import { formatTime } from '@/lib/utils';

interface MyChallengePanelProps {
  challenge: ChallengeWithCreator;
  currentUserId: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDecline: () => void;
}

export function MyChallengePanel({
  challenge,
  currentUserId,
  onCancel,
  onConfirm,
  onDecline,
}: MyChallengePanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  const isCreator = challenge.creatorId === currentUserId;
  const isAccepted = challenge.status === 'accepted';
  const timeControl =
    CHALLENGE_TIME_CONTROLS[challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  const timeLabel = timeControl?.label || challenge.timeControlKey;

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - new Date(challenge.createdAt).getTime()) / 1000
      );
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [challenge.createdAt]);

  // Show waiting state for creator who posted the challenge
  if (challenge.status === 'open' && isCreator) {
    return (
      <div className="card max-w-md mx-auto text-center">
        <div className="mb-6">
          <div className="w-12 h-12 mx-auto mb-4 border border-pure-white flex items-center justify-center">
            <span className="animate-blink text-pure-white font-mono text-xl">_</span>
          </div>
          <p className="text-xs font-mono text-mid-light">waiting...</p>
          <p className="text-pure-white font-mono">finding opponent</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">mode</p>
            <p className="text-pure-white font-mono text-sm">
              {challenge.gameMode === 'chess960' ? '960' : 'std'}
            </p>
          </div>
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">time</p>
            <p className="text-pure-white font-mono text-sm">{timeLabel}</p>
          </div>
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">stake</p>
            <USDCAmount amount={challenge.stakeAmount} size="sm" />
          </div>
        </div>

        <p className="text-sm text-mid-light mb-4 font-mono">
          {formatTime(elapsedTime)}
        </p>

        <button onClick={onCancel} className="btn btn-secondary w-full">
          cancel
        </button>
      </div>
    );
  }

  // Show confirmation state when challenge is accepted
  if (isAccepted) {
    const opponent = isCreator ? challenge.acceptedBy : challenge.creator;

    return (
      <div className="card max-w-md mx-auto text-center">
        <div className="mb-6">
          <p className="text-xs font-mono text-usdc mb-1">challenge accepted!</p>
          <p className="text-pure-white font-mono text-lg">
            {isCreator ? 'opponent found' : 'confirm to play'}
          </p>
        </div>

        {/* Opponent info */}
        <div className="p-4 bg-pure-black border border-usdc/30 mb-6">
          <p className="text-xs font-mono text-mid-light mb-2">opponent</p>
          <p className="text-pure-white font-mono text-lg">{opponent?.username}</p>
          <p className="text-mid-light font-mono text-sm">
            {opponent?.eloRating} elo
          </p>
        </div>

        {/* Game details */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">mode</p>
            <p className="text-pure-white font-mono text-sm">
              {challenge.gameMode === 'chess960' ? '960' : 'std'}
            </p>
          </div>
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">time</p>
            <p className="text-pure-white font-mono text-sm">{timeLabel}</p>
          </div>
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">stake</p>
            <USDCAmount amount={challenge.stakeAmount} size="sm" />
          </div>
        </div>

        {/* Confirmation countdown */}
        <p className="text-xs font-mono text-mid-light mb-4">
          confirm within 60 seconds
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={onDecline} className="btn btn-secondary flex-1">
            decline
          </button>
          <button onClick={onConfirm} className="btn btn-primary flex-1">
            confirm
          </button>
        </div>
      </div>
    );
  }

  // Default state (shouldn't normally be reached)
  return null;
}
