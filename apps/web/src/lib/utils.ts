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
