'use client';

import { useState, useRef } from 'react';

interface OAuthButtonProps {
  provider: 'google' | 'twitter';
  isLoading?: boolean;
  disabled?: boolean;
}

/**
 * Provider-specific icons as inline SVGs.
 *
 * Note: Twitter rebranded to "X" in 2023, so we use the X logo instead of
 * the old Twitter bird. The button text also says "X" instead of "Twitter".
 */
const ProviderIcon = ({ provider }: { provider: 'google' | 'twitter' }) => {
  if (provider === 'google') {
    return (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
  }

  // X (formerly Twitter) icon - the simple "X" mark
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function OAuthButton({ provider, isLoading = false, disabled = false }: OAuthButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };

  const handleClick = () => {
    if (disabled || isLoading || isRedirecting) return;

    setIsRedirecting(true);
    // Redirect to OAuth endpoint
    window.location.href = `${API_URL}/api/auth/${provider}`;
  };

  const isDisabled = disabled || isLoading || isRedirecting;
  const showLoading = isLoading || isRedirecting;

  // Display name for accessibility and tooltip
  const displayName = provider === 'twitter' ? 'X' : provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={`Sign in with ${displayName}`}
        className={`
          w-11 h-11
          bg-black border border-white/15
          text-white/70
          transition-all duration-150
          flex items-center justify-center
          group
          ${isDisabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-white hover:text-white hover:bg-white/5'
          }
        `}
      >
        {showLoading ? (
          <span className="animate-blink text-sm">_</span>
        ) : (
          <span className="transition-transform duration-150 group-hover:scale-110">
            <ProviderIcon provider={provider} />
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <div className="px-2 py-1 bg-black border border-white/20 text-[10px] font-mono text-white/70 lowercase">
            {displayName.toLowerCase()}
          </div>
          <div className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-black border-r border-b border-white/20 rotate-45" />
        </div>
      )}
    </div>
  );
}
