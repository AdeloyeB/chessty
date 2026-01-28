/**
 * TickerBar — Persistent bottom status bar (Spotify Now Playing style)
 * =====================================================================
 *
 * A 40px bar anchored to the bottom of the window, always visible
 * regardless of which page/tab the user is on. Inspired by:
 *   - Spotify's "Now Playing" bar
 *   - Discord's voice status bar
 *   - Trading platform ticker tapes
 *
 * SECTIONS:
 *   Left:   Active bet summary (game, side, amount, odds)
 *   Center: Scrolling ticker of live platform activity
 *   Right:  Wallet balance + connection status
 *
 * WHY THIS EXISTS:
 * In a betting platform, users need persistent context about:
 *   1. What they have money on (active bets)
 *   2. What's happening across the platform (live odds, notable games)
 *   3. Their financial state (wallet balance)
 *
 * Without this bar, users would need to navigate to different pages
 * to check each of these things. The ticker keeps them informed at
 * a glance — even while playing a game or reviewing history.
 *
 * NOTE: This is currently scaffolded with placeholder content.
 * Real data will be wired up when the betting system is connected.
 */

'use client';

import { isTauri } from '@/lib/desktop';
import { useState, useEffect } from 'react';

interface TickerBarProps {
  /** User's wallet balance in USDC */
  balance?: number;
  /** Whether the WebSocket connection is active */
  isConnected?: boolean;
  /** Active bet info (null if no active bet) */
  activeBet?: {
    gameId: string;
    side: 'white' | 'black';
    amount: number;
    odds: number;
  } | null;
}

export function TickerBar({ balance = 0, isConnected = false, activeBet = null }: TickerBarProps) {
  const [isTauriApp, setIsTauriApp] = useState(false);

  useEffect(() => {
    setIsTauriApp(isTauri());
  }, []);

  // Only render in desktop app
  if (!isTauriApp) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] select-none">
      <div className="h-10 bg-black border-t border-white/15 flex items-center px-4 font-mono text-xs">
        {/* === LEFT: Active Bet === */}
        <div className="flex items-center gap-3 shrink-0">
          {activeBet ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-white/70">
                bet: {activeBet.side} — {activeBet.amount} usdc — {activeBet.odds.toFixed(2)}x
              </span>
            </>
          ) : (
            <span className="text-white/30">no active bets</span>
          )}
        </div>

        {/* === CENTER: Scrolling Ticker === */}
        <div className="flex-1 overflow-hidden mx-6">
          <div className="ticker-scroll flex items-center gap-8 text-white/25 whitespace-nowrap">
            <span>♔ platform live — 12 games in progress</span>
            <span>·</span>
            <span>top match: player_1 vs player_2 — 24 moves</span>
            <span>·</span>
            <span>odds shifting: game #4421 white 1.8x → 2.1x</span>
            <span>·</span>
            <span>new challenge: 5+0 blitz — 50 usdc</span>
          </div>
        </div>

        {/* === RIGHT: Wallet + Connection === */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-white/50">
            {balance.toLocaleString()} usdc
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-white/30">
              {isConnected ? 'live' : 'offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
