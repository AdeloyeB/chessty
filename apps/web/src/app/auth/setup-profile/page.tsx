'use client';

/**
 * Profile Setup Page
 *
 * This page is shown to new wallet users who need to set a display name
 * before they can access the dashboard. Display names must be unique
 * and are used to identify players in games and leaderboards.
 *
 * Flow:
 * 1. User signs in with wallet (no display name yet)
 * 2. Redirected here to set their display name
 * 3. Real-time validation checks availability
 * 4. On success, redirected to dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useWalletAuth } from '@/hooks/useWalletAuth';

// Debounce hook for input validation
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

type ValidationState = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken';

export default function SetupProfilePage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { setDisplayName, checkDisplayName } = useWalletAuth();

  // Form state
  const [displayName, setDisplayNameInput] = useState('');
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounce the display name for validation
  const debouncedDisplayName = useDebounce(displayName, 500);

  // Redirect if already has display name or not authenticated
  useEffect(() => {
    if (!token) {
      router.replace('/');
      return;
    }

    if (user?.displayName) {
      router.replace('/');
    }
  }, [token, user, router]);

  // Check display name availability when debounced value changes
  useEffect(() => {
    const checkAvailability = async () => {
      if (!debouncedDisplayName || debouncedDisplayName.length < 3) {
        setValidationState('idle');
        setValidationError(null);
        return;
      }

      setValidationState('checking');

      const result = await checkDisplayName(debouncedDisplayName);

      if (!result.valid) {
        setValidationState('invalid');
        setValidationError(result.error || 'Invalid display name');
      } else if (!result.available) {
        setValidationState('taken');
        setValidationError('This display name is already taken');
      } else {
        setValidationState('valid');
        setValidationError(null);
      }
    };

    checkAvailability();
  }, [debouncedDisplayName, checkDisplayName]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (validationState !== 'valid') {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const success = await setDisplayName(displayName);

    if (success) {
      // Redirect to dashboard
      router.push('/');
    } else {
      setSubmitError('Failed to set display name. Please try again.');
      setIsSubmitting(false);
    }
  }, [displayName, validationState, setDisplayName, router]);

  // Validation indicator component
  const ValidationIndicator = () => {
    if (displayName.length < 3) {
      return null;
    }

    switch (validationState) {
      case 'checking':
        return (
          <span className="text-white/50 animate-pulse">checking...</span>
        );
      case 'valid':
        return (
          <span className="text-green-400">available</span>
        );
      case 'taken':
        return (
          <span className="text-red-400">taken</span>
        );
      case 'invalid':
        return (
          <span className="text-red-400">invalid</span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-6xl text-white/80 block mb-6">♔</span>
          <h1 className="text-xl font-mono text-white lowercase tracking-wide mb-2">
            choose your display name
          </h1>
          <p className="text-sm font-mono text-white/50 lowercase">
            this is how other players will see you
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-mono text-white/50 mb-2 lowercase">
              display name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                className="w-full px-3 py-3 bg-black border border-white/15 text-white placeholder-white/30 lowercase tracking-wide focus:outline-none focus:border-white transition-colors duration-150 font-mono pr-24"
                placeholder="your_name"
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_-]+"
                required
                autoFocus
                disabled={isSubmitting}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono">
                <ValidationIndicator />
              </div>
            </div>

            {/* Validation error message */}
            {validationError && displayName.length >= 3 && (
              <p className="mt-2 text-xs font-mono text-red-400 lowercase">
                {validationError}
              </p>
            )}

            {/* Character count */}
            <div className="mt-2 flex justify-between text-xs font-mono text-white/30">
              <span>letters, numbers, _ and - only</span>
              <span>{displayName.length}/20</span>
            </div>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-black border border-white/30 text-white/70 text-sm font-mono lowercase">
              error: {submitError}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || validationState !== 'valid'}
            className="
              w-full px-5 py-3 text-sm font-mono
              bg-white text-black border border-white
              hover:bg-white/90
              transition-all duration-150
              lowercase tracking-wide
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-blink">_</span>
                saving...
              </span>
            ) : (
              'continue'
            )}
          </button>
        </form>

        {/* Info box */}
        <div className="mt-8 p-4 border border-white/10 bg-white/5">
          <p className="text-xs font-mono text-white/40 lowercase leading-relaxed">
            your display name is unique and will be shown in games, leaderboards,
            and when challenging other players. you can change it later in settings.
          </p>
        </div>

        {/* Wallet address preview */}
        {user?.walletAddress && (
          <div className="mt-6 text-center">
            <p className="text-xs font-mono text-white/30 lowercase">
              connected wallet: {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
