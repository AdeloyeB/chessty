/**
 * Overlay Page — Compact chess overlay window
 * ============================================
 *
 * This Next.js page is loaded inside the Tauri overlay window.
 * It renders a compact, frameless chess interface that:
 *   - Shows an interactive chessboard
 *   - Displays both players' clocks
 *   - Allows making moves via click or drag
 *   - Can be repositioned via the drag handle
 *   - Floats above other windows (always-on-top)
 *
 * WINDOW SETUP:
 * The overlay window is created by Rust/Tauri with:
 *   - decorations: false (no titlebar)
 *   - always_on_top: true
 *   - transparent: true (for rounded corners)
 *   - skip_taskbar: true (doesn't show in taskbar)
 *
 * GAME STATE:
 * The overlay connects to the same game as the main window using
 * the gameId from the URL query param. It shares state via:
 *   - useGameStore (Zustand) for local state
 *   - useWebSocket for server sync
 *
 * URL: /overlay?id={gameId}
 */

'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Square } from '@chess-game/shared/chess';
import type { Game, Move, PublicUser } from '@chess-game/shared';
import { useGameStore } from '@/store/game';
import { useWebSocket } from '@/hooks/useWebSocket';
import { OverlayBoard } from '@/components/overlay';

// ============================================================================
// DEV MODE MOCK DATA
// ============================================================================
// When the overlay is opened with a "dev-" prefixed game ID, we load mock data
// directly instead of waiting for WebSocket sync. This allows testing the
// overlay UI without a real game running.

const DEV_MODE_PREFIX = 'overlay-test-';

const MOCK_WHITE_PLAYER: PublicUser = {
  id: 'dev-white-001',
  username: 'TestWhite',
  displayName: 'TestWhite',
  eloRating: 1850,
  peakEloRating: 1920,
  gamesPlayed: 142,
  gamesWon: 78,
  gamesLost: 52,
  gamesDraw: 12,
};

const MOCK_BLACK_PLAYER: PublicUser = {
  id: 'dev-black-001',
  username: 'TestBlack',
  displayName: 'TestBlack',
  eloRating: 1920,
  peakEloRating: 2010,
  gamesPlayed: 256,
  gamesWon: 145,
  gamesLost: 89,
  gamesDraw: 22,
};

const MOCK_MOVES: Move[] = [
  { from: 'e2', to: 'e4', san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', timestamp: 1 },
  { from: 'e7', to: 'e5', san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', timestamp: 2 },
  { from: 'g1', to: 'f3', san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', timestamp: 3 },
  { from: 'b8', to: 'c6', san: 'Nc6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', timestamp: 4 },
  { from: 'f1', to: 'c4', san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', timestamp: 5 },
  { from: 'g8', to: 'f6', san: 'Nf6', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', timestamp: 6 },
];

const MOCK_GAME: Game = {
  id: 'overlay-test-game-001',
  whitePlayerId: MOCK_WHITE_PLAYER.id,
  blackPlayerId: MOCK_BLACK_PLAYER.id,
  winnerId: null,
  status: 'active',
  result: null,
  currentFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6',
  moves: MOCK_MOVES,
  timeControl: { initial: 300, increment: 0 },
  whiteTimeRemaining: 267,
  blackTimeRemaining: 243,
  wagerAmount: 50,
  totalPot: 100,
  whiteEloAtStart: 1850,
  blackEloAtStart: 1920,
  eloChange: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: new Date(),
  endedAt: null,
};

/**
 * Loading fallback shown while the page content loads
 */
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-pure-black flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}

/**
 * Error state shown when the game ID is missing from the URL
 */
function MissingGameError() {
  return (
    <div className="min-h-screen bg-pure-black flex flex-col items-center justify-center gap-3">
      <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <p className="text-xs font-mono text-red-400">no game specified</p>
      <p className="text-[10px] font-mono text-mid">close this window</p>
    </div>
  );
}

/**
 * Main overlay content component
 */
function OverlayContent() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('id');

  // Check if this is a dev mode test game
  const isDevMode = gameId?.startsWith(DEV_MODE_PREFIX) ?? false;

  // Client-side mounting guard (SSR compatibility)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // This setState is intentional for SSR hydration guard
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (isDevMode) {
      console.log('[Overlay] Dev mode enabled for game:', gameId);
    }
  }, [isDevMode, gameId]);

  // Game state from Zustand store (used in production)
  const storeState = useGameStore();

  // WebSocket for making moves (not used in dev mode)
  const { makeMove, isConnected: wsConnected } = useWebSocket();

  // In dev mode, use mock data; otherwise use store data
  const currentFen = isDevMode ? MOCK_GAME.currentFen : storeState.currentFen;
  const moves = isDevMode ? MOCK_MOVES : storeState.moves;
  const whitePlayer = isDevMode ? MOCK_WHITE_PLAYER : storeState.whitePlayer;
  const blackPlayer = isDevMode ? MOCK_BLACK_PLAYER : storeState.blackPlayer;
  const playerColor = isDevMode ? 'white' : storeState.playerColor;
  const whiteTimeRemaining = isDevMode ? MOCK_GAME.whiteTimeRemaining : storeState.whiteTimeRemaining;
  const blackTimeRemaining = isDevMode ? MOCK_GAME.blackTimeRemaining : storeState.blackTimeRemaining;
  const isMyTurn = isDevMode ? true : storeState.isMyTurn;
  const game = isDevMode ? MOCK_GAME : storeState.game;
  const isConnected = isDevMode ? true : wsConnected; // Pretend connected in dev mode

  // Calculate last move for board highlighting
  const lastMove = useMemo(() => {
    if (moves.length === 0) return null;
    const last = moves[moves.length - 1];
    return {
      from: last.from as Square,
      to: last.to as Square,
    };
  }, [moves]);

  // Handle move from overlay
  const handleMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      if (isDevMode) {
        // In dev mode, just log the move attempt
        console.log('[Overlay Dev] Move attempted:', from, '->', to, promotion);
        return;
      }
      if (!game || !isConnected) return;
      makeMove(game.id, from, to, promotion);
    },
    [game, isConnected, makeMove, isDevMode]
  );

  // Handle overlay close
  const handleClose = useCallback(() => {
    console.debug('Overlay closing for game:', gameId);
  }, [gameId]);

  // Initial time from game's time control
  const initialTime = useMemo(() => {
    return game?.timeControl?.initial ?? 180;
  }, [game]);

  // Guard: game ID is required
  if (!gameId) {
    return <MissingGameError />;
  }

  // Don't render until mounted (SSR guard)
  if (!mounted) {
    return <LoadingFallback />;
  }

  // Show loading state while waiting for game data
  if (!game || !currentFen) {
    return (
      <div className="min-h-screen bg-pure-black flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-xs font-mono text-mid">connecting...</p>
      </div>
    );
  }

  // Show connection error if WebSocket disconnected
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-pure-black flex flex-col items-center justify-center gap-3">
        <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-xs font-mono text-amber-400">disconnected</p>
        <p className="text-[10px] font-mono text-mid">reconnecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <OverlayBoard
        fen={currentFen}
        moves={moves}
        whitePlayer={whitePlayer}
        blackPlayer={blackPlayer}
        playerColor={playerColor || 'white'}
        whiteTime={whiteTimeRemaining}
        blackTime={blackTimeRemaining}
        initialTime={initialTime}
        isMyTurn={isMyTurn}
        stake={game.wagerAmount}
        pot={game.totalPot}
        lastMove={lastMove}
        onMove={handleMove}
        onClose={handleClose}
      />
    </div>
  );
}

/**
 * Page component with Suspense boundary
 * Next.js App Router requires this pattern for useSearchParams()
 */
export default function OverlayPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OverlayContent />
    </Suspense>
  );
}
