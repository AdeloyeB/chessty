'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

// Storage key for persisting the link token across login
const DISCORD_LINK_TOKEN_KEY = 'discord_link_token';

interface LinkResult {
  success: boolean;
  discordUsername?: string;
  error?: string;
}

interface AccountLinkScreenProps {
  /** The link token from the deep link URL */
  token: string;
}

function getErrorMessage(code?: string): string {
  switch (code) {
    case 'TOKEN_EXPIRED':
      return 'This link has expired. Please request a new link from Discord.';
    case 'TOKEN_INVALID':
      return 'This link is invalid. Please request a new link from Discord.';
    case 'ALREADY_LINKED':
      return 'Your account is already linked to a Discord account.';
    case 'DISCORD_ALREADY_LINKED':
      return 'This Discord account is already linked to another user.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * AccountLinkScreen handles the Discord account linking flow.
 *
 * Flow:
 * 1. User clicks deep link in Discord (chkmate://link/{token})
 * 2. If not logged in: show login prompt, store token in sessionStorage
 * 3. If logged in: call POST /api/discord/link with the token
 * 4. Show success/error based on API response
 */
export function AccountLinkScreen({ token }: AccountLinkScreenProps) {
  const router = useRouter();
  const { user, token: authToken } = useAuthStore();

  const [status, setStatus] = useState<'idle' | 'linking' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<LinkResult | null>(null);

  // Trigger linking when user is authenticated
  const shouldLink = Boolean(user && authToken && status === 'idle');

  // Check if user is logged in and attempt to link
  useEffect(() => {
    if (!user || !authToken) {
      // User not logged in - store token for after login
      sessionStorage.setItem(DISCORD_LINK_TOKEN_KEY, token);
      return;
    }

    if (!shouldLink) return;

    // Create abort controller for cleanup
    const abortController = new AbortController();

    async function performLink() {
      setStatus('linking');

      try {
        const response = await fetch('/api/discord/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token }),
          signal: abortController.signal,
        });

        const data = await response.json();

        if (abortController.signal.aborted) return;

        if (!response.ok || !data.success) {
          setStatus('error');
          setResult({
            success: false,
            error: data.error?.message || getErrorMessage(data.error?.code),
          });
          return;
        }

        // Success - clear stored token
        sessionStorage.removeItem(DISCORD_LINK_TOKEN_KEY);
        setStatus('success');
        setResult({
          success: true,
          discordUsername: data.data?.discordUsername,
        });
      } catch {
        if (abortController.signal.aborted) return;
        setStatus('error');
        setResult({
          success: false,
          error: 'Failed to connect to server. Please try again.',
        });
      }
    }

    performLink();

    return () => {
      abortController.abort();
    };
  }, [user, authToken, token, shouldLink]);

  function handleRetryLink() {
    setStatus('idle');
    setResult(null);
  }

  function handleLoginRedirect() {
    // Store token before redirecting to login
    sessionStorage.setItem(DISCORD_LINK_TOKEN_KEY, token);
    router.push('/');
  }

  function handleReturnToDashboard() {
    router.push('/dashboard');
  }

  // Not logged in - show login prompt
  if (!user || !authToken) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          {/* Header */}
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_link</p>
            <p className="text-lg font-mono text-pure-white">link your account</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Discord Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-[#5865F2]/10 border border-[#5865F2]/30 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-10 h-10 text-[#5865F2]"
                  fill="currentColor"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
              </div>
            </div>

            <p className="text-pure-white font-mono text-center mb-2">
              login required
            </p>
            <p className="text-mid-light text-sm font-mono text-center mb-6">
              please log in to link your Discord account to chkmate
            </p>

            <button
              onClick={handleLoginRedirect}
              className="w-full p-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Linking in progress
  if (status === 'idle' || status === 'linking') {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          {/* Header */}
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_link</p>
            <p className="text-lg font-mono text-pure-white">linking account</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Discord Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-[#5865F2]/10 border border-[#5865F2]/30 flex items-center justify-center animate-pulse">
                <svg
                  viewBox="0 0 24 24"
                  className="w-10 h-10 text-[#5865F2]"
                  fill="currentColor"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
              </div>
            </div>

            <p className="text-pure-white font-mono text-center mb-2">
              linking your account...
            </p>
            <p className="text-mid-light text-sm font-mono text-center">
              please wait
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
        <div className="bg-off-black border border-mid/30 max-w-md w-full">
          {/* Header */}
          <div className="p-4 border-b border-mid/30">
            <p className="text-xs font-mono text-mid-light">discord_link</p>
            <p className="text-lg font-mono text-pure-white">account linked</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Success Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-10 h-10 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <p className="text-green-400 font-mono text-center mb-2">
              discord account linked!
            </p>
            {result?.discordUsername && (
              <p className="text-mid-light text-sm font-mono text-center mb-6">
                linked as <span className="text-pure-white">{result.discordUsername}</span>
              </p>
            )}

            <button
              onClick={handleReturnToDashboard}
              className="w-full p-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              return to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error
  return (
    <div className="min-h-screen bg-pure-black flex items-center justify-center p-4">
      <div className="bg-off-black border border-mid/30 max-w-md w-full">
        {/* Header */}
        <div className="p-4 border-b border-mid/30">
          <p className="text-xs font-mono text-mid-light">discord_link</p>
          <p className="text-lg font-mono text-pure-white">link failed</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-10 h-10 text-red-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>

          <p className="text-red-400 font-mono text-center mb-2">
            unable to link account
          </p>
          <p className="text-mid-light text-sm font-mono text-center mb-6">
            {result?.error || 'An unexpected error occurred.'}
          </p>

          <div className="space-y-3">
            <button
              onClick={handleRetryLink}
              className="w-full p-4 bg-pure-black border border-mid/50 text-mid-light font-mono hover:border-pure-white hover:text-pure-white transition-colors"
            >
              try again
            </button>
            <button
              onClick={handleReturnToDashboard}
              className="w-full p-4 bg-pure-white text-pure-black font-mono hover:bg-white/90 transition-colors"
            >
              return to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the storage key for use in the login flow
export { DISCORD_LINK_TOKEN_KEY };
