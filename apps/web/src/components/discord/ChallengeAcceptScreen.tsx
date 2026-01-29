'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { USDCAmount } from '@/components/wallet/USDCAmount';

// Time control options for the challenge
const TIME_CONTROLS = [
  { key: 'bullet-1+0', label: '1+0', category: 'Bullet' },
  { key: 'bullet-2+1', label: '2+1', category: 'Bullet' },
  { key: 'blitz-3+0', label: '3+0', category: 'Blitz' },
  { key: 'blitz-5+0', label: '5+0', category: 'Blitz' },
  { key: 'rapid-10+0', label: '10+0', category: 'Rapid' },
] as const;

// Wager preset amounts
const WAGER_PRESETS = [5, 10, 25, 50, 100] as const;

// Minimum wager amount
const MIN_WAGER = 5;

function getErrorMessage(code?: string): string {
  switch (code) {
    case 'CHALLENGE_NOT_FOUND':
      return 'This challenge does not exist or has been removed.';
    case 'CHALLENGE_EXPIRED':
      return 'This challenge has expired.';
    case 'CHALLENGE_ALREADY_ACCEPTED':
      return 'This challenge has already been accepted.';
    case 'CHALLENGE_ALREADY_DECLINED':
      return 'This challenge has already been declined.';
    case 'INSUFFICIENT_BALANCE':
      return 'You do not have enough balance for this wager.';
    case 'SELF_CHALLENGE':
      return 'You cannot accept your own challenge.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

interface ChallengerInfo {
  id: string;
  username: string;
  displayName?: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
}

interface ChallengeDetails {
  id: string;
  challenger: ChallengerInfo;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  message?: string;
}

interface ChallengeAcceptScreenProps {
  /** The challenge ID from the deep link URL */
  challengeId: string;
}

/**
 * ChallengeAcceptScreen handles the Discord challenge acceptance flow.
 *
 * Flow:
 * 1. User clicks deep link in Discord (chkmate://challenge/{id})
 * 2. Fetch challenge details from GET /api/discord/challenge/{id}
 * 3. Show challenger info and let user set time control + wager
 * 4. Accept: POST /api/discord/challenge/{id}/accept -> navigate to game
 * 5. Decline: POST /api/discord/challenge/{id}/decline -> show confirmation
 */
export function ChallengeAcceptScreen({ challengeId }: ChallengeAcceptScreenProps) {
  const router = useRouter();
  const { user, token: authToken } = useAuthStore();

  // Challenge state
  const [challenge, setChallenge] = useState<ChallengeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User selections
  const [selectedTimeControl, setSelectedTimeControl] = useState<string>('blitz-5+0');
  const [wagerAmount, setWagerAmount] = useState<number>(10);
  const [wagerInput, setWagerInput] = useState<string>('10');

  // Action states
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [actionResult, setActionResult] = useState<'accepted' | 'declined' | null>(null);

  // Fetch challenge details on mount
  useEffect(() => {
    if (!authToken) return;

    const abortController = new AbortController();

    async function fetchChallengeDetails() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/discord/challenge/${challengeId}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          signal: abortController.signal,
        });

        const data = await response.json();

        if (abortController.signal.aborted) return;

        if (!response.ok || !data.success) {
          setError(data.error?.message || getErrorMessage(data.error?.code));
          setLoading(false);
          return;
        }

        setChallenge(data.data);
      } catch {
        if (abortController.signal.aborted) return;
        setError('Failed to load challenge details. Please try again.');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchChallengeDetails();

    return () => {
      abortController.abort();
    };
  }, [authToken, challengeId]);

  async function handleAccept() {
    if (!challenge || isAccepting) return;

    setIsAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/discord/challenge/${challengeId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          timeControlKey: selectedTimeControl,
          wagerAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || 'Failed to accept challenge.');
        setIsAccepting(false);
        return;
      }

      // Navigate to the game
      setActionResult('accepted');
      setTimeout(() => {
        router.push(`/game/${data.data.gameId}`);
      }, 1500);
    } catch {
      setError('Failed to accept challenge. Please try again.');
      setIsAccepting(false);
    }
  }

  async function handleDecline() {
    if (!challenge || isDeclining) return;

    setIsDeclining(true);
    setError(null);

    try {
      const response = await fetch(`/api/discord/challenge/${challengeId}/decline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || 'Failed to decline challenge.');
        setIsDeclining(false);
        return;
      }

      setActionResult('declined');
    } catch {
      setError('Failed to decline challenge. Please try again.');
      setIsDeclining(false);
    }
  }

  function handleWagerInputChange(value: string) {
    setWagerInput(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= MIN_WAGER) {
      setWagerAmount(numValue);
    }
  }

  function handleWagerPresetClick(amount: number) {
    setWagerAmount(amount);
    setWagerInput(amount.toString());
  }

  // Get user balance (default to 0 if not available)
  const userBalance = user?.balance ?? 0;
  const canAfford = userBalance >= wagerAmount;
  const isValidWager = wagerAmount >= MIN_WAGER && wagerAmount <= userBalance;

  // Calculate win probability based on ELO difference
  function calculateWinProbability(yourElo: number, opponentElo: number): number {
    const eloDiff = opponentElo - yourElo;
    const probability = 1 / (1 + Math.pow(10, eloDiff / 400));
    return Math.round(probability * 100);
  }

  // Not logged in - redirect to login
  if (!user || !authToken) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_challenge</p>
            <p className="text-lg font-mono text-pure-white">login required</p>
          </div>
          <div className="p-6">
            <p className="text-mid-light text-sm font-mono text-center mb-6">
              please log in to view and accept this challenge
            </p>
            <button
              onClick={() => router.push('/')}
              className="w-full p-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_challenge</p>
            <p className="text-lg font-mono text-pure-white">loading challenge</p>
          </div>
          <div className="p-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-mid/20 animate-pulse" />
            </div>
            <p className="text-mid-light text-sm font-mono text-center mt-4">
              fetching challenge details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state (no challenge)
  if (error && !challenge) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_challenge</p>
            <p className="text-lg font-mono text-pure-white">challenge unavailable</p>
          </div>
          <div className="p-6">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <p className="text-red-400 font-mono text-center mb-2">
              {error}
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full p-4 mt-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              return to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Action completed states
  if (actionResult === 'accepted') {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_challenge</p>
            <p className="text-lg font-mono text-pure-white">challenge accepted</p>
          </div>
          <div className="p-6">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <p className="text-green-400 font-mono text-center mb-2">
              game starting...
            </p>
            <p className="text-mid-light text-sm font-mono text-center">
              redirecting to game board
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (actionResult === 'declined') {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_challenge</p>
            <p className="text-lg font-mono text-pure-white">challenge declined</p>
          </div>
          <div className="p-6">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-mid/20 border border-mid/30 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-8 h-8 text-mid-light"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <p className="text-mid-light font-mono text-center mb-6">
              you have declined this challenge
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full p-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              return to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main challenge screen
  const winProb = challenge ? calculateWinProbability(user.eloRating, challenge.challenger.eloRating) : 50;
  const eloDiff = challenge ? challenge.challenger.eloRating - user.eloRating : 0;
  const opponentWinRate = challenge && challenge.challenger.gamesPlayed > 0
    ? Math.round((challenge.challenger.gamesWon / challenge.challenger.gamesPlayed) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
      <div className="bg-off-black border border-mid/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-mid/30">
          <p className="text-xs font-mono text-mid-light">discord_challenge</p>
          <p className="text-lg font-mono text-pure-white">incoming challenge</p>
        </div>

        <div className="p-6">
          {/* Challenger vs You */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Challenger */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-[#5865F2]/10 border border-[#5865F2]/30 flex items-center justify-center text-2xl font-mono text-[#5865F2] mb-2">
                {challenge?.challenger.username[0].toLowerCase() || '?'}
              </div>
              <p className="text-pure-white font-mono text-sm truncate">
                {challenge?.challenger.username || 'Unknown'}
              </p>
              <p className={`text-lg font-mono ${eloDiff > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {challenge?.challenger.eloRating || '---'}
              </p>
              <p className="text-xs font-mono text-mid-light">
                {opponentWinRate}% WR | {challenge?.challenger.gamesPlayed || 0} games
              </p>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-2xl font-mono text-mid-light mb-2">VS</p>
              <div className="text-xs font-mono text-mid-light">
                {eloDiff > 0 ? '+' : ''}{eloDiff} ELO diff
              </div>
            </div>

            {/* You */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-pure-white flex items-center justify-center text-2xl font-mono text-pure-black mb-2">
                you
              </div>
              <p className="text-pure-white font-mono text-sm">{user.username}</p>
              <p className={`text-lg font-mono ${eloDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {user.eloRating}
              </p>
              <p className="text-xs font-mono text-mid-light">
                <USDCAmount amount={userBalance} size="sm" className="inline" /> balance
              </p>
            </div>
          </div>

          {/* Win Probability Bar */}
          <div className="mb-6 p-4 bg-pure-black border border-mid/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-mid-light">your_win_probability</span>
              <span className={`text-lg font-mono font-medium ${
                winProb >= 50 ? 'text-green-400' : 'text-red-400'
              }`}>
                {winProb}%
              </span>
            </div>
            <div className="h-3 bg-off-black border border-mid/30 overflow-hidden flex">
              <div
                className={`h-full ${winProb >= 50 ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ width: `${winProb}%` }}
              />
              <div
                className="h-full bg-mid/30"
                style={{ width: `${100 - winProb}%` }}
              />
            </div>
          </div>

          {/* Challenge message (if any) */}
          {challenge?.message && (
            <div className="mb-6 p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-2">message</p>
              <p className="text-pure-white font-mono text-sm">&quot;{challenge.message}&quot;</p>
            </div>
          )}

          {/* Time Control Selection */}
          <div className="mb-6">
            <p className="text-xs font-mono text-mid-light mb-3">select_time_control</p>
            <div className="grid grid-cols-5 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.key}
                  onClick={() => setSelectedTimeControl(tc.key)}
                  className={`p-3 font-mono text-sm transition-all ${
                    selectedTimeControl === tc.key
                      ? 'bg-pure-white text-pure-black border border-pure-white'
                      : 'bg-pure-black border border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  }`}
                >
                  <div className="text-xs opacity-60 mb-0.5">{tc.category}</div>
                  <div>{tc.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Wager Selection */}
          <div className="mb-6">
            <p className="text-xs font-mono text-mid-light mb-3">set_wager_amount</p>

            {/* Preset buttons */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {WAGER_PRESETS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleWagerPresetClick(amount)}
                  disabled={amount > userBalance}
                  className={`p-3 font-mono text-sm transition-all ${
                    wagerAmount === amount
                      ? 'bg-pure-white text-pure-black border border-pure-white'
                      : amount > userBalance
                        ? 'bg-pure-black border border-mid/20 text-mid/40 cursor-not-allowed'
                        : 'bg-pure-black border border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  }`}
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-light font-mono">$</span>
                <input
                  type="number"
                  min={MIN_WAGER}
                  max={userBalance}
                  step="1"
                  value={wagerInput}
                  onChange={(e) => handleWagerInputChange(e.target.value)}
                  className="w-full pl-7 pr-3 py-3 bg-pure-black border border-mid/30 text-pure-white font-mono focus:outline-none focus:border-pure-white"
                  placeholder="Custom amount"
                />
              </div>
              <div className="text-sm font-mono text-mid-light">
                min ${MIN_WAGER}
              </div>
            </div>
          </div>

          {/* Stakes summary */}
          <div className="mb-6 p-4 bg-pure-black border border-mid/30">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono text-mid-light">your_wager</span>
              <USDCAmount amount={wagerAmount} size="md" />
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm font-mono text-mid-light">total_pot</span>
              <USDCAmount amount={wagerAmount * 2} size="md" />
            </div>
          </div>

          {/* Insufficient balance warning */}
          {!canAfford && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 mb-6">
              <p className="text-sm font-mono text-red-400">
                insufficient balance - you need{' '}
                <USDCAmount amount={wagerAmount - userBalance} size="sm" className="inline" />{' '}
                more to accept
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 mb-6">
              <p className="text-sm font-mono text-red-400">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDecline}
              disabled={isDeclining || isAccepting}
              className="flex-1 p-4 bg-pure-black border border-mid/50 text-mid-light font-mono hover:border-red-400 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {isDeclining ? 'declining...' : 'decline'}
            </button>
            <button
              onClick={handleAccept}
              disabled={!isValidWager || isAccepting || isDeclining}
              className={`flex-1 p-4 font-mono transition-all ${
                isValidWager && !isAccepting
                  ? 'bg-pure-white text-pure-black hover:bg-white/90'
                  : 'bg-off-black text-mid/30 border border-mid/20 cursor-not-allowed'
              }`}
            >
              {isAccepting ? 'accepting...' : isValidWager ? 'accept challenge' : 'insufficient balance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
