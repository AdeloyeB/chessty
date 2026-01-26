'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ChallengeWithCreator } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';
import { formatTime } from '@/lib/utils';
import { useChallengeStore } from '@/store/challenge';

interface MyChallengePanelProps {
  challenge: ChallengeWithCreator;
  currentUserId: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDecline: () => void;
}

// Confirmation timeout in seconds
const CONFIRMATION_TIMEOUT = 60;

export function MyChallengePanel({
  challenge,
  currentUserId,
  onCancel,
  onConfirm,
  onDecline,
}: MyChallengePanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [confirmationTimeLeft, setConfirmationTimeLeft] = useState(CONFIRMATION_TIMEOUT);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const uiState = useChallengeStore((state) => state.uiState);
  const error = useChallengeStore((state) => state.error);
  const setError = useChallengeStore((state) => state.setError);
  const setUIState = useChallengeStore((state) => state.setUIState);

  const isCreator = challenge.creatorId === currentUserId;
  const isAccepted = challenge.status === 'accepted';
  const timeControl =
    CHALLENGE_TIME_CONTROLS[challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  const timeLabel = timeControl?.label || challenge.timeControlKey;

  // Elapsed time counter for waiting state
  useEffect(() => {
    if (challenge.status !== 'open') return;

    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - new Date(challenge.createdAt).getTime()) / 1000
      );
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [challenge.createdAt, challenge.status]);

  // Confirmation countdown for accepted/confirming state
  useEffect(() => {
    if (uiState !== 'accepted' && uiState !== 'confirming') {
      setConfirmationTimeLeft(CONFIRMATION_TIMEOUT);
      return;
    }

    const interval = setInterval(() => {
      setConfirmationTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [uiState]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (!error) return;

    const timeout = setTimeout(() => {
      setError(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [error, setError]);

  const handleCancelClick = useCallback(() => {
    setShowCancelDialog(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    setShowCancelDialog(false);
    setUIState('canceling');
    onCancel();
  }, [onCancel, setUIState]);

  const handleCancelDismiss = useCallback(() => {
    setShowCancelDialog(false);
  }, []);

  // Calculate confirmation progress percentage
  const confirmationProgress = (confirmationTimeLeft / CONFIRMATION_TIMEOUT) * 100;

  // Show canceling state
  if (uiState === 'canceling') {
    return (
      <div className="bg-black border border-white/15 max-w-md mx-auto text-center p-6">
        <div className="mb-6">
          <div className="w-12 h-12 mx-auto mb-4 border border-white/30 flex items-center justify-center">
            <span className="animate-spin text-white/50 font-mono text-xl">...</span>
          </div>
          <p className="text-xs font-mono text-white/50 lowercase">canceling...</p>
          <p className="text-white font-mono lowercase">please wait</p>
        </div>
      </div>
    );
  }

  // Show starting state when both players have confirmed
  if (uiState === 'starting') {
    return (
      <div className="bg-black border border-white/15 max-w-md mx-auto text-center p-6">
        <div className="mb-6">
          {/* Animated loading indicator */}
          <div className="w-16 h-16 mx-auto mb-4 border border-green-400/50 flex items-center justify-center relative">
            <div className="absolute inset-0 border border-green-400 animate-ping opacity-30" />
            <span className="text-green-400 font-mono text-2xl">&#9812;</span>
          </div>
          <p className="text-xs font-mono text-green-400 lowercase mb-1">both players confirmed</p>
          <p className="text-white font-mono text-lg lowercase">game starting...</p>
        </div>

        {/* Loading bar animation */}
        <div className="h-1 bg-white/10 overflow-hidden mb-6">
          <div className="h-full bg-green-400 animate-pulse w-full" />
        </div>

        {/* Game details */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">mode</p>
            <p className="text-white font-mono text-sm lowercase">
              {challenge.gameMode === 'chess960' ? '960' : 'std'}
            </p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">time</p>
            <p className="text-white font-mono text-sm lowercase">{timeLabel}</p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">wager</p>
            <USDCAmount amount={challenge.wagerAmount} size="sm" />
          </div>
        </div>
      </div>
    );
  }

  // Show waiting state for creator who posted the challenge
  if (challenge.status === 'open' && isCreator) {
    return (
      <div className="bg-black border border-white/15 max-w-md mx-auto text-center p-6">
        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 border border-red-500/30 bg-red-500/10">
            <p className="text-xs font-mono text-red-400 lowercase">{error}</p>
          </div>
        )}

        <div className="mb-6">
          <div className="w-12 h-12 mx-auto mb-4 border border-white flex items-center justify-center">
            <span className="animate-blink text-white font-mono text-xl">_</span>
          </div>
          <p className="text-xs font-mono text-white/50 lowercase">waiting...</p>
          <p className="text-white font-mono lowercase">finding opponent</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">mode</p>
            <p className="text-white font-mono text-sm lowercase">
              {challenge.gameMode === 'chess960' ? '960' : 'std'}
            </p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">time</p>
            <p className="text-white font-mono text-sm lowercase">{timeLabel}</p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">wager</p>
            <USDCAmount amount={challenge.wagerAmount} size="sm" />
          </div>
        </div>

        <p className="text-sm text-white/50 mb-4 font-mono lowercase">
          {formatTime(elapsedTime)}
        </p>

        <button
          onClick={handleCancelClick}
          className="w-full p-3 bg-black border border-white/15 text-white/50 font-mono hover:text-white hover:border-white transition-colors lowercase"
        >
          cancel
        </button>

        {/* Cancel confirmation dialog */}
        {showCancelDialog && (
          <CancelConfirmDialog
            onConfirm={handleCancelConfirm}
            onDismiss={handleCancelDismiss}
          />
        )}
      </div>
    );
  }

  // Show confirmation state when challenge is accepted
  if (isAccepted) {
    const opponent = isCreator ? challenge.acceptedBy : challenge.creator;

    return (
      <div className="bg-black border border-white/15 max-w-md mx-auto text-center p-6">
        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 border border-red-500/30 bg-red-500/10">
            <p className="text-xs font-mono text-red-400 lowercase">{error}</p>
          </div>
        )}

        <div className="mb-6">
          <p className="text-xs font-mono text-green-400 lowercase mb-1">challenge accepted!</p>
          <p className="text-white font-mono text-lg lowercase">
            {isCreator ? 'opponent found' : 'confirm to play'}
          </p>
        </div>

        {/* Opponent info */}
        <div className="p-4 bg-black border border-green-400/30 mb-6">
          <p className="text-xs font-mono text-white/50 lowercase mb-2">opponent</p>
          <p className="text-white font-mono text-lg lowercase">{opponent?.username}</p>
          <p className="text-white/50 font-mono text-sm lowercase">
            {opponent?.eloRating} elo
          </p>
        </div>

        {/* Game details */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">mode</p>
            <p className="text-white font-mono text-sm lowercase">
              {challenge.gameMode === 'chess960' ? '960' : 'std'}
            </p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">time</p>
            <p className="text-white font-mono text-sm lowercase">{timeLabel}</p>
          </div>
          <div className="p-3 bg-black border border-white/15">
            <p className="text-xs font-mono text-white/50 lowercase">wager</p>
            <USDCAmount amount={challenge.wagerAmount} size="sm" />
          </div>
        </div>

        {/* Confirmation countdown with progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono text-white/50 lowercase">
              confirm within
            </p>
            <p className={`text-sm font-mono lowercase ${
              confirmationTimeLeft <= 10 ? 'text-red-400' :
              confirmationTimeLeft <= 30 ? 'text-yellow-400' : 'text-white'
            }`}>
              {confirmationTimeLeft}s
            </p>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                confirmationTimeLeft <= 10 ? 'bg-red-400' :
                confirmationTimeLeft <= 30 ? 'bg-yellow-400' : 'bg-green-400'
              }`}
              style={{ width: `${confirmationProgress}%` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onDecline}
            className="flex-1 p-3 bg-black border border-white/15 text-white/50 font-mono hover:text-white hover:border-white transition-colors lowercase"
          >
            decline
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 p-3 bg-white text-black font-mono hover:bg-white/90 transition-colors lowercase"
          >
            confirm
          </button>
        </div>
      </div>
    );
  }

  // Default state (shouldn't normally be reached)
  return null;
}

// Cancel confirmation dialog component
function CancelConfirmDialog({
  onConfirm,
  onDismiss,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onDismiss}
      />

      {/* Dialog */}
      <div className="relative bg-black border border-white/15 p-6 max-w-sm w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 border border-red-400/50 flex items-center justify-center">
            <span className="text-red-400 font-mono text-xl">?</span>
          </div>
          <p className="text-white font-mono lowercase mb-2">cancel challenge?</p>
          <p className="text-xs font-mono text-white/50 lowercase">
            are you sure you want to cancel this challenge?
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 p-3 bg-black border border-white/15 text-white/50 font-mono hover:text-white hover:border-white transition-colors lowercase"
          >
            keep waiting
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 p-3 bg-red-500 text-white font-mono hover:bg-red-600 transition-colors lowercase"
          >
            cancel challenge
          </button>
        </div>
      </div>
    </div>
  );
}
