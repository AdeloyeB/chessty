/**
 * OverlayBoard — Main container for the chess overlay window
 * ===========================================================
 *
 * This is the root component for the overlay window. It orchestrates:
 *   - Header with opponent info, settings, and close button
 *   - Opponent clock
 *   - Interactive chessboard
 *   - Player clock
 *   - Player info with expandable stats panel
 *   - Drag handle for repositioning
 *
 * LAYOUT STRUCTURE:
 * ┌─────────────────────────┐
 * │ opponent_name  │ ⚙️ │ ✕ │  <- header with settings/close
 * ├─────────────────────────┤
 * │      ⏱ 3:42            │  <- opponent clock
 * ├─────────────────────────┤
 * │                         │
 * │    [COMPACT BOARD]      │  <- chessboard (square)
 * │                         │
 * ├─────────────────────────┤
 * │      ⏱ 4:15            │  <- your clock
 * ├─────────────────────────┤
 * │ you (1923)     │ ▼ exp │  <- your info + expand button
 * ├─────────────────────────┤  <- EXPANDED SECTION (toggleable)
 * │ stake: $25  pot: $50   │
 * │ 1.e4 e5 2.Nf3 Nc6...   │
 * │ eval: +0.3             │
 * ├─────────────────────────┤
 * │        ≡ drag          │  <- drag handle
 * └─────────────────────────┘
 *
 * INTERACTIONS:
 * - Clicking squares or dragging pieces makes moves
 * - Settings dropdown controls opacity, size, visibility
 * - Close button closes the overlay window
 * - Drag handle repositions the window
 * - Stats panel expands/collapses on click
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import type { PublicUser, Move } from '@chess-game/shared';
import type { Square, Move as ChessMove } from '@chess-game/shared/chess';
import { Chess } from '@chess-game/shared/chess';
import { useOverlaySettings, OVERLAY_SIZES } from '@/hooks/useOverlaySettings';
// NOTE: Native macOS styling (rounded corners, traffic lights) is now applied
// by Rust when the overlay window is created. See commands/overlay.rs.
// This eliminates the race condition where React would try to style the window
// before it was fully ready, and makes startup faster.
import { OverlayChessboard } from './OverlayChessboard';
import { OverlayClock } from './OverlayClock';
import { OverlayStats } from './OverlayStats';
import { OverlaySettings } from './OverlaySettings';
import { OverlayDragHandle } from './OverlayDragHandle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlayBoardProps {
  /** Current board position in FEN format */
  fen: string;
  /** Move history */
  moves: Move[];
  /** White player info */
  whitePlayer: PublicUser | null;
  /** Black player info */
  blackPlayer: PublicUser | null;
  /** Which color the local player is */
  playerColor: 'white' | 'black';
  /** White's remaining time in seconds */
  whiteTime: number;
  /** Black's remaining time in seconds */
  blackTime: number;
  /** Initial time for clock percentage calculation */
  initialTime?: number;
  /** Is it the local player's turn? */
  isMyTurn: boolean;
  /** Wager amount for this game */
  stake?: number;
  /** Total pot */
  pot?: number;
  /** Engine evaluation string (e.g., "+0.3") */
  evaluation?: string;
  /** Last move for highlighting */
  lastMove?: { from: Square; to: Square } | null;
  /** Make a move callback */
  onMove?: (from: Square, to: Square, promotion?: string) => void;
  /** Close the overlay */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlayBoard({
  fen,
  moves,
  whitePlayer,
  blackPlayer,
  playerColor,
  whiteTime,
  blackTime,
  initialTime = 180,
  isMyTurn,
  stake = 0,
  pot = 0,
  evaluation,
  lastMove,
  onMove,
  onClose,
}: OverlayBoardProps) {
  // Settings hook
  const {
    settings,
    themeColors,
    setOpacity,
    setSize,
    setTheme,
    toggleClocks,
    toggleOpponentInfo,
    toggleEval,
    toggleExpanded,
  } = useOverlaySettings();

  // Determine opponent based on player color
  const opponent = playerColor === 'white' ? blackPlayer : whitePlayer;
  const player = playerColor === 'white' ? whitePlayer : blackPlayer;

  // Determine whose turn it is
  const turn = useMemo(() => {
    const fenParts = fen.split(' ');
    return fenParts[1] === 'w' ? 'white' : 'black';
  }, [fen]);

  const isWhiteTurn = turn === 'white';

  // Chess instance for move validation
  const chess = useMemo(() => new Chess(fen), [fen]);

  // Selected square state for click-to-move
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  // Get legal moves from selected square
  const legalMoves = useMemo((): Square[] => {
    if (!selectedSquare) return [];
    const moves = chess.moves({ square: selectedSquare, verbose: true }) as ChessMove[];
    return moves.map((m) => m.to as Square);
  }, [chess, selectedSquare]);

  // Check if king is in check
  const checkSquare = useMemo((): Square | null => {
    if (!chess.isCheck()) return null;
    const turn = chess.turn();
    const board = chess.board().flat();
    const king = board.find((p) => p?.type === 'k' && p.color === turn);
    return king?.square as Square | null;
  }, [chess]);

  // Handle square click
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!isMyTurn || !onMove) return;

      // If we have a selected square, try to move
      if (selectedSquare) {
        const moves = chess.moves({ square: selectedSquare, verbose: true }) as ChessMove[];
        const move = moves.find((m) => m.to === square);

        if (move) {
          // Check for promotion
          const piece = chess.get(selectedSquare);
          const isPromotion =
            piece?.type === 'p' &&
            ((piece.color === 'w' && square[1] === '8') ||
              (piece.color === 'b' && square[1] === '1'));

          onMove(selectedSquare, square, isPromotion ? 'q' : undefined);
        }

        setSelectedSquare(null);
        return;
      }

      // Select a piece if it's the player's piece
      const piece = chess.get(square);
      if (piece && piece.color === (playerColor === 'white' ? 'w' : 'b')) {
        setSelectedSquare(square);
      }
    },
    [chess, selectedSquare, isMyTurn, playerColor, onMove]
  );

  // Handle drag and drop
  const handlePieceDrop = useCallback(
    (from: Square, to: Square): boolean => {
      if (!isMyTurn || !onMove) return false;

      const moves = chess.moves({ square: from, verbose: true }) as ChessMove[];
      const move = moves.find((m) => m.to === to);

      if (!move) return false;

      // Check for promotion
      const piece = chess.get(from);
      const isPromotion =
        piece?.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

      onMove(from, to, isPromotion ? 'q' : undefined);
      setSelectedSquare(null);
      return true;
    },
    [chess, isMyTurn, onMove]
  );

  // Close overlay window via Rust command.
  // This closes the Tauri window and restores the main window.
  const handleClose = useCallback(async () => {
    // Notify parent component first (if provided)
    if (onClose) {
      onClose();
    }

    // Close the overlay window via Rust
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('close_overlay');
    } catch (error) {
      // Not in Tauri context (dev browser) - just log
      console.debug('[Overlay] Close failed:', error);
    }
  }, [onClose]);

  // Get board size from settings
  const boardSize = OVERLAY_SIZES[settings.size].board;

  return (
    <div
      className="flex flex-col overflow-hidden select-none rounded-xl"
      style={{
        width: OVERLAY_SIZES[settings.size].width,
        opacity: settings.opacity,
        backgroundColor: themeColors.surface,
        border: `1px solid ${themeColors.border}`,
      }}
    >
      {/* Header - drag region with close button, opponent info, and settings */}
      {/* Using a React close button for cross-platform consistency instead of
          native macOS traffic lights. This simplifies the UI and works on all platforms. */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-xl"
        style={{
          backgroundColor: themeColors.surface,
          borderBottom: `1px solid ${themeColors.border}`,
        }}
        data-tauri-drag-region
      >
        {/* Close button - returns to main app */}
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/80 transition-colors group"
          style={{
            backgroundColor: themeColors.surfaceHover,
            border: `1px solid ${themeColors.border}`,
          }}
          title="Close overlay and return to main window"
        >
          <svg
            className="w-3 h-3 group-hover:text-white transition-colors"
            style={{ color: themeColors.textPrimary }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Opponent info (conditionally shown) - centered in remaining space */}
        {settings.showOpponentInfo && opponent && (
          <div
            className="flex items-center gap-2 min-w-0 flex-1 justify-center"
            data-tauri-drag-region
          >
            <span
              className="text-xs font-mono truncate pointer-events-none"
              style={{ color: themeColors.textPrimary }}
            >
              {opponent.displayName || opponent.username}
            </span>
            <span
              className="text-[10px] font-mono pointer-events-none"
              style={{ color: themeColors.textSecondary }}
            >
              ({opponent.eloRating})
            </span>
          </div>
        )}

        {/* Spacer when opponent info is hidden */}
        {!settings.showOpponentInfo && <div className="flex-1" data-tauri-drag-region />}

        {/* Settings button */}
        <OverlaySettings
          settings={settings}
          themeColors={themeColors}
          onOpacityChange={setOpacity}
          onSizeChange={setSize}
          onThemeChange={setTheme}
          onToggleClocks={toggleClocks}
          onToggleOpponentInfo={toggleOpponentInfo}
          onToggleEval={toggleEval}
        />
      </div>

      {/* Opponent clock */}
      {settings.showClocks && (
        <div
          className="flex justify-center py-1.5"
          style={{
            backgroundColor: themeColors.surface,
            borderBottom: `1px solid ${themeColors.borderSubtle}`,
          }}
        >
          <OverlayClock
            time={playerColor === 'white' ? blackTime : whiteTime}
            isActive={playerColor === 'white' ? !isWhiteTurn : isWhiteTurn}
            initialTime={initialTime}
            themeColors={themeColors}
          />
        </div>
      )}

      {/* Chessboard */}
      <div
        className="flex justify-center p-2"
        style={{ backgroundColor: themeColors.background }}
      >
        <OverlayChessboard
          position={fen}
          size={boardSize}
          orientation={playerColor}
          selectedSquare={selectedSquare}
          legalMoves={legalMoves}
          lastMove={lastMove}
          checkSquare={checkSquare}
          isMyTurn={isMyTurn}
          onSquareClick={handleSquareClick}
          onPieceDrop={handlePieceDrop}
          themeColors={themeColors}
        />
      </div>

      {/* Player clock */}
      {settings.showClocks && (
        <div
          className="flex justify-center py-1.5"
          style={{
            backgroundColor: themeColors.surface,
            borderTop: `1px solid ${themeColors.borderSubtle}`,
          }}
        >
          <OverlayClock
            time={playerColor === 'white' ? whiteTime : blackTime}
            isActive={playerColor === 'white' ? isWhiteTurn : !isWhiteTurn}
            initialTime={initialTime}
            themeColors={themeColors}
          />
        </div>
      )}

      {/* Player info and expandable stats */}
      <OverlayStats
        expanded={settings.expanded}
        onToggle={toggleExpanded}
        stake={stake}
        pot={pot}
        moves={moves}
        evaluation={settings.showEval ? evaluation : undefined}
        showEval={settings.showEval}
        playerName={player?.displayName || player?.username || 'You'}
        playerRating={player?.eloRating}
        themeColors={themeColors}
      />

      {/* Drag handle */}
      <OverlayDragHandle themeColors={themeColors} />
    </div>
  );
}

export default OverlayBoard;
