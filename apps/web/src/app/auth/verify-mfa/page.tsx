'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { MFACodeInput } from '@/components/auth/MFACodeInput';

type VerifyMode = 'totp' | 'backup';

function VerifyMFAContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setToken } = useAuthStore();

  const [mode, setMode] = useState<VerifyMode>('totp');
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const tempToken = searchParams.get('temp_token');

  // Redirect if no temp token
  useEffect(() => {
    if (!tempToken) {
      router.push('/');
    }
  }, [tempToken, router]);

  const verifyCode = useCallback(async (code: string) => {
    if (!tempToken) return;

    setIsLoading(true);
    setError('');

    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/auth/mfa/verify', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ temp_token: tempToken, code }),
      // });
      // const data = await response.json();
      // if (!data.success) throw new Error(data.error?.message || 'Verification failed');

      // Mock verification for development
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate error for specific code
      if (code === '000000') {
        throw new Error('invalid code. please try again.');
      }

      // Mock successful response
      const mockUser = {
        id: 'user-1',
        username: 'player',
        displayName: 'Player',
        email: 'player@example.com',
        eloRating: 1200,
        peakEloRating: 1350,
        gamesPlayed: 47,
        gamesWon: 28,
        gamesLost: 15,
        gamesDraw: 4,
        balance: 0,
      };
      const mockToken = 'authenticated-token-' + Date.now();

      // Update auth store
      setUser(mockUser);
      setToken(mockToken);

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [tempToken, setUser, setToken, router]);

  const verifyBackupCode = useCallback(async () => {
    if (!tempToken || !backupCode.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/auth/mfa/verify-backup', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ temp_token: tempToken, backup_code: backupCode }),
      // });
      // const data = await response.json();
      // if (!data.success) throw new Error(data.error?.message || 'Verification failed');

      // Mock verification for development
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate error for specific code
      if (backupCode.toLowerCase() === 'invalid') {
        throw new Error('invalid backup code');
      }

      // Mock successful response
      const mockUser = {
        id: 'user-1',
        username: 'player',
        displayName: 'Player',
        email: 'player@example.com',
        eloRating: 1200,
        peakEloRating: 1350,
        gamesPlayed: 47,
        gamesWon: 28,
        gamesLost: 15,
        gamesDraw: 4,
        balance: 0,
      };
      const mockToken = 'authenticated-token-' + Date.now();

      // Update auth store
      setUser(mockUser);
      setToken(mockToken);

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [tempToken, backupCode, setUser, setToken, router]);

  const handleBackupCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyBackupCode();
  };

  // Format backup code input (XXXX-XXXX)
  const handleBackupCodeChange = (value: string) => {
    // Remove non-alphanumeric characters except hyphen
    let cleaned = value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();

    // Auto-insert hyphen after 4 characters
    if (cleaned.length > 4 && !cleaned.includes('-')) {
      cleaned = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    }

    // Limit to 9 characters (XXXX-XXXX)
    setBackupCode(cleaned.slice(0, 9));
  };

  if (!tempToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      {/* Background Grid Pattern */}
      <div
        className="fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content Container */}
      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-5xl text-white/80 block mb-4">
            {mode === 'totp' ? String.fromCodePoint(0x2654) : String.fromCodePoint(0x2656)}
          </span>
          <h1 className="text-white font-mono text-xl lowercase mb-2">
            two-factor authentication
          </h1>
          <p className="text-white/50 font-mono text-sm lowercase">
            {mode === 'totp'
              ? 'enter the code from your authenticator app'
              : 'enter one of your backup codes'
            }
          </p>
        </div>

        {/* Main Card */}
        <div className="border border-white/15 bg-black p-6 sm:p-8">
          {mode === 'totp' ? (
            <MFACodeInput
              onComplete={verifyCode}
              onUseBackupCode={() => {
                setMode('backup');
                setError('');
              }}
              error={error}
              isLoading={isLoading}
            />
          ) : (
            <form onSubmit={handleBackupCodeSubmit} className="space-y-6">
              {/* Backup Code Input */}
              <div>
                <label className="block text-xs font-mono text-white/50 mb-2 lowercase">
                  backup code
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => handleBackupCodeChange(e.target.value)}
                  placeholder="XXXX-XXXX"
                  disabled={isLoading}
                  className="w-full px-3 py-3 bg-black border border-white/15 text-white placeholder-white/30 uppercase tracking-widest text-center focus:outline-none focus:border-white transition-colors duration-150 font-mono disabled:opacity-50"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-black border border-white/30 text-white/70 text-sm font-mono lowercase text-center">
                  error: {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || backupCode.length < 9}
                className={`
                  w-full px-5 py-2.5 text-sm font-mono lowercase tracking-wide
                  transition-all duration-150
                  ${isLoading || backupCode.length < 9
                    ? 'bg-black border border-white/15 text-white/30 cursor-not-allowed'
                    : 'bg-white text-black border border-white hover:bg-white/90'
                  }
                `}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-blink">_</span>
                    verifying...
                  </span>
                ) : (
                  'verify backup code'
                )}
              </button>

              {/* Back to TOTP Link */}
              <div className="pt-4 border-t border-white/15">
                <button
                  type="button"
                  onClick={() => {
                    setMode('totp');
                    setError('');
                    setBackupCode('');
                  }}
                  disabled={isLoading}
                  className="w-full text-white/50 text-sm font-mono lowercase hover:text-white transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  use authenticator app instead
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Help Link */}
        <div className="mt-6 text-center">
          <p className="text-white/30 text-xs font-mono lowercase">
            lost access to your authenticator?{' '}
            <a
              href="/support"
              className="text-white/50 hover:text-white transition-colors duration-150 underline underline-offset-2"
            >
              contact support
            </a>
          </p>
        </div>

        {/* Session Info */}
        <div className="mt-8 pt-4 border-t border-white/10 text-center">
          <p className="text-white/20 text-xs font-mono lowercase">
            session: {tempToken?.slice(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyMFAPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <span className="text-white/50 font-mono text-sm lowercase flex items-center gap-2">
            <span className="animate-blink">_</span>
            loading...
          </span>
        </div>
      }
    >
      <VerifyMFAContent />
    </Suspense>
  );
}
