import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBalance(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

export function formatUSDC(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatProbability(odds: number): string {
  // Convert decimal odds to percentage probability
  // odds of 2.0 = 50%, odds of 1.5 = 66.7%, etc.
  const probability = (1 / odds) * 100;
  return `${probability.toFixed(0)}%`;
}

/**
 * Address formatting utilities for wallet display
 */
export function truncateAddress(address: string | null | undefined): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function maskAddress(address: string | null | undefined): string {
  if (!address) return '';
  // Show first 6 and last 4 chars with dots in between
  return `${address.slice(0, 6)}${'•'.repeat(8)}${address.slice(-4)}`;
}

export function maskTruncatedAddress(truncatedAddress: string | null | undefined): string {
  if (!truncatedAddress) return '';
  // For already truncated addresses (0x1234...5678), mask the middle
  return `${truncatedAddress.slice(0, 4)}••••${truncatedAddress.slice(-2)}`;
}
