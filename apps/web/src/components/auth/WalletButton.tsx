'use client';

/**
 * WalletButton - Connect wallet and authenticate via SIWE
 *
 * This button handles the complete wallet authentication flow:
 * 1. Click → Connect wallet (via wagmi/RainbowKit)
 * 2. Once connected → Automatically trigger SIWE sign-in
 * 3. User signs message in wallet
 * 4. Server verifies → User authenticated
 *
 * The component supports three wallet providers:
 * - WalletConnect: Works with most mobile wallets
 * - Coinbase Wallet: Coinbase's official wallet
 * - Phantom: Popular Solana wallet (also supports EVM)
 *
 * Why separate buttons instead of one "Connect" button?
 * - Users often have a preferred wallet
 * - Clicking directly on their wallet icon is faster
 * - Matches the UX pattern on Polymarket and other crypto apps
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { useWalletAuth } from '@/hooks/useWalletAuth';

type WalletProvider = 'walletconnect' | 'coinbase' | 'phantom';

interface WalletButtonProps {
  provider: WalletProvider;
  disabled?: boolean;
}

/**
 * Wallet provider icons as inline SVGs.
 * These match the official brand guidelines for each wallet.
 */
const WalletIcon = ({ provider }: { provider: WalletProvider }) => {
  if (provider === 'walletconnect') {
    // WalletConnect logo - the distinctive "W" bridge icon
    return (
      <svg
        className="w-5 h-5"
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M9.58 11.58c3.54-3.47 9.28-3.47 12.82 0l.43.42a.44.44 0 0 1 0 .63l-1.46 1.43a.23.23 0 0 1-.32 0l-.59-.58a6.67 6.67 0 0 0-9.28 0l-.63.62a.23.23 0 0 1-.32 0l-1.46-1.43a.44.44 0 0 1 0-.63l.81-.46zm15.84 2.95 1.3 1.27a.44.44 0 0 1 0 .63l-5.85 5.73a.46.46 0 0 1-.64 0l-4.15-4.07a.11.11 0 0 0-.16 0l-4.15 4.07a.46.46 0 0 1-.64 0l-5.85-5.73a.44.44 0 0 1 0-.63l1.3-1.27a.46.46 0 0 1 .64 0l4.15 4.07a.11.11 0 0 0 .16 0l4.15-4.07a.46.46 0 0 1 .64 0l4.15 4.07a.11.11 0 0 0 .16 0l4.15-4.07a.46.46 0 0 1 .64 0z" />
      </svg>
    );
  }

  if (provider === 'coinbase') {
    // Coinbase Wallet logo - the "C" in a circle
    return (
      <svg
        className="w-5 h-5"
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 4c6.627 0 12 5.373 12 12s-5.373 12-12 12S4 22.627 4 16 9.373 4 16 4z" />
        <rect x="10" y="10" width="12" height="12" rx="2" />
      </svg>
    );
  }

  // Phantom logo - the ghost icon
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 40 40"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M33.24 18.67a15.14 15.14 0 0 0-14.74-12c-7.6.23-13.7 6.6-13.58 14.2.03 1.68.34 3.34.9 4.92.33.9 1.12 1.53 2.07 1.62a2.2 2.2 0 0 0 2.31-1.42c.52-1.36.8-2.8.83-4.26a7.16 7.16 0 0 1 7.6-6.86 7.22 7.22 0 0 1 6.8 7.17v.51c0 1.1.82 2.02 1.91 2.15a2.1 2.1 0 0 0 2.29-2.1v-.51c.04-1.2-.08-2.4-.35-3.57zM11.5 22a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5zm8 0a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5z" />
      <path d="M34.37 25.03a13.86 13.86 0 0 1-9.1 8.07c-4.17 1.15-8.6.5-12.3-1.8a2.15 2.15 0 0 0-2.95.6 2.1 2.1 0 0 0 .5 2.88 18.1 18.1 0 0 0 16.53 2.36c5.04-1.72 9.1-5.6 11.05-10.55a2.1 2.1 0 0 0-1.15-2.73 2.15 2.15 0 0 0-2.58 1.17z" />
    </svg>
  );
};

const WALLET_NAMES: Record<WalletProvider, string> = {
  walletconnect: 'WalletConnect',
  coinbase: 'Coinbase Wallet',
  phantom: 'Phantom',
};

/**
 * Maps our provider names to wagmi connector IDs.
 *
 * Wagmi connectors have specific IDs that we need to match.
 * These IDs come from the @rainbow-me/rainbowkit configuration.
 */
const CONNECTOR_IDS: Record<WalletProvider, string[]> = {
  walletconnect: ['walletConnect', 'walletConnectLegacy'],
  coinbase: ['coinbaseWallet', 'coinbaseWalletSDK'],
  phantom: ['phantom', 'app.phantom'],
};

export function WalletButton({
  provider,
  disabled = false,
}: WalletButtonProps) {
  // Wagmi hooks for wallet connection
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();

  // Our SIWE authentication hook
  const { signIn, isLoading: isAuthenticating, error: authError, step, reset } = useWalletAuth();

  // Local state
  const [showTooltip, setShowTooltip] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredSignIn = useRef(false);

  // Find the connector for this provider
  const connector = connectors.find((c) =>
    CONNECTOR_IDS[provider].some(
      (id) => c.id.toLowerCase().includes(id.toLowerCase()) || c.name.toLowerCase().includes(id.toLowerCase())
    )
  );

  // Clean up tooltip timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };

  /**
   * Handle button click
   *
   * If wallet is not connected: Connect the wallet
   * If wallet is connected: Trigger SIWE sign-in
   */
  const handleClick = useCallback(() => {
    if (disabled || isConnecting || isAuthenticating) return;

    setLocalError(null);
    reset();

    if (!isConnected) {
      // Step 1: Connect wallet
      if (connector) {
        connect({ connector });
      } else {
        // Fallback: If specific connector not found, try any available
        const fallbackConnector = connectors[0];
        if (fallbackConnector) {
          connect({ connector: fallbackConnector });
        } else {
          setLocalError('No wallet connector available');
        }
      }
    } else {
      // Wallet already connected, trigger sign-in
      signIn();
    }
  }, [disabled, isConnecting, isAuthenticating, isConnected, connector, connectors, connect, signIn, reset]);

  /**
   * Auto-trigger SIWE sign-in after wallet connection
   *
   * When the wallet connects, we automatically start the SIWE flow.
   * This provides a seamless experience - one click to connect AND authenticate.
   */
  useEffect(() => {
    // Only trigger if:
    // 1. Wallet just connected (isConnected becomes true)
    // 2. We haven't already triggered sign-in
    // 3. We're not already authenticating
    // 4. We have an address
    if (isConnected && address && !hasTriggeredSignIn.current && !isAuthenticating && step === 'idle') {
      // Small delay to ensure connection is fully established
      const timer = setTimeout(() => {
        if (!hasTriggeredSignIn.current) {
          hasTriggeredSignIn.current = true;
          signIn();
        }
      }, 500);

      return () => clearTimeout(timer);
    }

    // Reset the flag when disconnected
    if (!isConnected) {
      hasTriggeredSignIn.current = false;
    }
  }, [isConnected, address, isAuthenticating, step, signIn]);

  // Determine loading state
  const isLoading = isConnecting || isAuthenticating;
  const isDisabled = disabled || isLoading;

  // Error display
  const displayError = localError || authError;

  // Tooltip text based on state
  const getTooltipText = () => {
    if (displayError) return displayError.toLowerCase();
    if (isConnecting) return 'connecting...';
    if (isAuthenticating) {
      switch (step) {
        case 'requesting_nonce':
          return 'preparing...';
        case 'awaiting_signature':
          return 'sign in wallet';
        case 'verifying':
          return 'verifying...';
        default:
          return 'authenticating...';
      }
    }
    return WALLET_NAMES[provider].toLowerCase();
  };

  const displayName = WALLET_NAMES[provider];

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
        aria-label={`Connect with ${displayName}`}
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
          ${displayError ? 'border-red-500/50' : ''}
        `}
      >
        {isLoading ? (
          <span className="animate-blink text-sm">_</span>
        ) : (
          <span className="transition-transform duration-150 group-hover:scale-110">
            <WalletIcon provider={provider} />
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <div className={`
            px-2 py-1 bg-black border text-[10px] font-mono lowercase
            ${displayError ? 'border-red-500/50 text-red-400' : 'border-white/20 text-white/70'}
          `}>
            {getTooltipText()}
          </div>
          <div className={`
            absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-black border-r border-b rotate-45
            ${displayError ? 'border-red-500/50' : 'border-white/20'}
          `} />
        </div>
      )}
    </div>
  );
}
