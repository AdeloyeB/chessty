'use client';

/**
 * useWalletAuth - Hook for SIWE (Sign-In with Ethereum) authentication
 *
 * This hook handles the complete wallet authentication flow:
 * 1. Request a nonce from the server (prevents replay attacks)
 * 2. Construct a SIWE message with the user's address and nonce
 * 3. Ask the user to sign the message with their wallet
 * 4. Send the signature to the server for verification
 * 5. Store the JWT token on success
 *
 * SIWE (Sign-In with Ethereum) is a standard (EIP-4361) that lets users
 * prove they own a wallet address by signing a message. Think of it like
 * a password, but instead of typing something you know, you prove you
 * control a wallet by signing with its private key.
 *
 * Why this pattern?
 * - No passwords to remember or leak
 * - Users control their own keys
 * - Same pattern used by Polymarket, OpenSea, and other crypto platforms
 * - Wallet = identity (perfect for a crypto betting platform)
 */

import { useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';

// ============================================================================
// Types
// ============================================================================

/**
 * The different states of the authentication flow.
 * This helps us show appropriate UI feedback at each step.
 */
type AuthStep =
  | 'idle'              // Waiting for user action
  | 'requesting_nonce'  // Fetching nonce from server
  | 'awaiting_signature' // Waiting for wallet signature
  | 'verifying'         // Sending signature to server
  | 'setting_display_name' // User needs to set display name
  | 'success';          // Authentication complete

interface WalletAuthResult {
  // The main sign-in function - call this when user clicks "Sign In"
  signIn: () => Promise<void>;

  // For linking a wallet to an existing account
  linkWallet: () => Promise<boolean>;

  // For setting display name (new users)
  setDisplayName: (name: string) => Promise<boolean>;

  // Check if a display name is available
  checkDisplayName: (name: string) => Promise<{ available: boolean; valid: boolean; error?: string }>;

  // Reset the auth state (e.g., if user cancels)
  reset: () => void;

  // Current state
  isLoading: boolean;
  error: string | null;
  step: AuthStep;
  needsDisplayName: boolean;

  // Wallet connection state (from wagmi)
  isConnected: boolean;
  address: `0x${string}` | undefined;
}

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// SIWE message template (EIP-4361 format)
// This is what the user sees in their wallet when signing
const DOMAIN = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

/**
 * Build a SIWE message that the user will sign.
 *
 * The message format follows EIP-4361 standard:
 * - Line 1: Domain + "wants you to sign in..."
 * - Line 2: The wallet address
 * - Line 3: Statement (what they're signing in to)
 * - Then: URI, Version, Chain ID, Nonce, Issued At
 *
 * @param address - The user's wallet address
 * @param nonce - The unique nonce from the server
 * @returns A formatted SIWE message string
 */
function buildSiweMessage(address: string, nonce: string): string {
  const issuedAt = new Date().toISOString();

  return `${DOMAIN} wants you to sign in with your Ethereum account:
${address}

Sign in to Chessty

URI: ${ORIGIN}
Version: 1
Chain ID: 137
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWalletAuth(): WalletAuthResult {
  const router = useRouter();

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Auth store for managing user state
  const { setUser, setToken, setMfaRequired } = useAuthStore();

  // Local state for the auth flow
  const [step, setStep] = useState<AuthStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);

  /**
   * Reset the auth flow state.
   * Called when the user cancels or wants to try again.
   */
  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setNeedsDisplayName(false);
  }, []);

  /**
   * Main sign-in function.
   *
   * This orchestrates the entire SIWE flow:
   * 1. Request nonce from server
   * 2. Build SIWE message
   * 3. Ask user to sign
   * 4. Verify signature with server
   * 5. Handle response (MFA, display name, or success)
   */
  const signIn = useCallback(async () => {
    // Ensure wallet is connected
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    setError(null);

    try {
      // Step 1: Request a nonce from the server
      setStep('requesting_nonce');

      const nonceResponse = await fetch(`${API_BASE_URL}/api/auth/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      if (!nonceResponse.ok) {
        const data = await nonceResponse.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to request nonce');
      }

      const { data: nonceData } = await nonceResponse.json();
      const nonce = nonceData.nonce;

      // Step 2: Build the SIWE message
      const message = buildSiweMessage(address, nonce);

      // Step 3: Ask user to sign the message
      setStep('awaiting_signature');

      let signature: `0x${string}`;
      try {
        signature = await signMessageAsync({ message });
      } catch (signError: unknown) {
        // User rejected the signature request
        if (signError instanceof Error && signError.message.includes('User rejected')) {
          setStep('idle');
          setError('Signature request was cancelled');
          return;
        }
        throw signError;
      }

      // Step 4: Verify the signature with the server
      setStep('verifying');

      const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature, address }),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Signature verification failed');
      }

      const { data: authData } = await verifyResponse.json();

      // Step 5: Handle the response
      if (authData.requiresMfa) {
        // User has MFA enabled - redirect to MFA verification
        setMfaRequired(true, authData.tempToken);
        setStep('success');
        router.push('/auth/verify-mfa');
        return;
      }

      if (authData.needsDisplayName) {
        // New user needs to set a display name
        setToken(authData.token);
        setNeedsDisplayName(true);
        setStep('setting_display_name');
        // Don't set user yet - they need to set display name first
        // The component using this hook should redirect to profile setup
        router.push('/auth/setup-profile');
        return;
      }

      // Success! Set user and token
      setUser(authData.user);
      setToken(authData.token);
      setStep('success');

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      setStep('idle');
      console.error('[WalletAuth] Sign in error:', err);
    }
  }, [isConnected, address, signMessageAsync, setUser, setToken, setMfaRequired, router]);

  /**
   * Link a wallet to an existing account.
   * Requires the user to be already authenticated.
   */
  const linkWallet = useCallback(async (): Promise<boolean> => {
    const token = useAuthStore.getState().token;

    if (!token) {
      setError('You must be logged in to link a wallet');
      return false;
    }

    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return false;
    }

    setError(null);

    try {
      // Request nonce
      setStep('requesting_nonce');

      const nonceResponse = await fetch(`${API_BASE_URL}/api/auth/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      if (!nonceResponse.ok) {
        throw new Error('Failed to request nonce');
      }

      const { data: nonceData } = await nonceResponse.json();
      const nonce = nonceData.nonce;

      // Build and sign message
      const message = buildSiweMessage(address, nonce);
      setStep('awaiting_signature');

      const signature = await signMessageAsync({ message });

      // Verify and link
      setStep('verifying');

      const linkResponse = await fetch(`${API_BASE_URL}/api/auth/wallet/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message, signature, address }),
      });

      if (!linkResponse.ok) {
        const data = await linkResponse.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to link wallet');
      }

      const { data } = await linkResponse.json();

      // Update user in store with new wallet address
      setUser(data.user);
      setStep('success');

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to link wallet';
      setError(errorMessage);
      setStep('idle');
      console.error('[WalletAuth] Link wallet error:', err);
      return false;
    }
  }, [isConnected, address, signMessageAsync, setUser]);

  /**
   * Set the display name for a new user.
   * Called after wallet authentication for users without a display name.
   */
  const setDisplayName = useCallback(async (displayName: string): Promise<boolean> => {
    const token = useAuthStore.getState().token;

    if (!token) {
      setError('Authentication token not found');
      return false;
    }

    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/wallet/display-name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to set display name');
      }

      const { data } = await response.json();

      // Update user in store with new display name
      setUser(data.user);
      setNeedsDisplayName(false);
      setStep('success');

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set display name';
      setError(errorMessage);
      console.error('[WalletAuth] Set display name error:', err);
      return false;
    }
  }, [setUser]);

  /**
   * Check if a display name is available.
   * Used for real-time validation in the profile setup form.
   */
  const checkDisplayName = useCallback(async (
    displayName: string
  ): Promise<{ available: boolean; valid: boolean; error?: string }> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/wallet/display-name/check?name=${encodeURIComponent(displayName)}`
      );

      if (!response.ok) {
        return { available: false, valid: false, error: 'Failed to check availability' };
      }

      const { data } = await response.json();
      return data;
    } catch (err) {
      console.error('[WalletAuth] Check display name error:', err);
      return { available: false, valid: false, error: 'Network error' };
    }
  }, []);

  // Derived loading state
  const isLoading = step !== 'idle' && step !== 'success' && step !== 'setting_display_name';

  return {
    signIn,
    linkWallet,
    setDisplayName,
    checkDisplayName,
    reset,
    isLoading,
    error,
    step,
    needsDisplayName,
    isConnected,
    address,
  };
}
