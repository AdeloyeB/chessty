'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

type CallbackState = 'loading' | 'success' | 'error';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setToken } = useAuthStore();

  const [state, setState] = useState<CallbackState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      // Extract params from URL
      const token = searchParams.get('token');
      const error = searchParams.get('error');
      const requiresMfa = searchParams.get('requires_mfa');

      // Handle MFA redirect
      if (requiresMfa === 'true') {
        const mfaToken = searchParams.get('mfa_token');
        router.replace(`/auth/verify-mfa${mfaToken ? `?mfa_token=${mfaToken}` : ''}`);
        return;
      }

      // Handle error
      if (error) {
        setState('error');
        // Wrap decodeURIComponent in try-catch to handle malformed URIs
        try {
          setErrorMessage(decodeURIComponent(error));
        } catch {
          setErrorMessage(error); // Fallback to raw error string
        }
        return;
      }

      // Handle missing token
      if (!token) {
        setState('error');
        setErrorMessage('authentication failed: no token received');
        return;
      }

      try {
        // Set the token first
        setToken(token);

        // Fetch user data with the new token
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (!data.success || !data.data) {
          throw new Error(data.error?.message || 'failed to fetch user data');
        }

        // Set user in store
        setUser(data.data);
        setState('success');

        // Short delay to show success state, then redirect
        setTimeout(() => {
          router.replace('/');
        }, 800);
      } catch (err) {
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'authentication failed');
        // Clear the invalid token
        setToken(null);
      }
    };

    handleCallback();
  }, [searchParams, router, setUser, setToken]);

  return (
    <div className="text-center">
      {/* Chess piece icon */}
      <div className="mb-8">
        <span
          className={`
            text-6xl inline-block
            ${state === 'loading' ? 'animate-pulse' : ''}
            ${state === 'success' ? 'text-white' : 'text-white/50'}
            ${state === 'error' ? 'text-white/30' : ''}
          `}
        >
          ♔
        </span>
      </div>

      {/* Loading state */}
      {state === 'loading' && (
        <div className="space-y-4">
          <p className="text-white font-mono text-sm lowercase tracking-wide">
            authenticating
            <span className="animate-blink">...</span>
          </p>
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-white/30 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Success state */}
      {state === 'success' && (
        <div className="space-y-4">
          <p className="text-white font-mono text-sm lowercase tracking-wide">
            authentication successful
          </p>
          <p className="text-white/50 font-mono text-xs lowercase">
            redirecting to dashboard...
          </p>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="space-y-6">
          <div className="p-4 border border-white/30 bg-black">
            <p className="text-white/70 font-mono text-sm lowercase">
              error: {errorMessage}
            </p>
          </div>
          <button
            onClick={() => router.replace('/')}
            className="
              w-full px-5 py-2.5 text-sm font-mono
              bg-black border border-white/15
              text-white/70
              hover:border-white hover:text-white
              transition-all duration-150
              lowercase tracking-wide
            "
          >
            return to login
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="text-center">
      <div className="mb-8">
        <span className="text-6xl inline-block text-white/50 animate-pulse">
          ♔
        </span>
      </div>
      <div className="space-y-4">
        <p className="text-white font-mono text-sm lowercase tracking-wide">
          loading
          <span className="animate-blink">...</span>
        </p>
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-white/30 animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <Suspense fallback={<LoadingFallback />}>
          <AuthCallbackContent />
        </Suspense>
      </div>
    </div>
  );
}
