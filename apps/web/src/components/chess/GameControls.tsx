'use client';

import { useState, useCallback } from 'react';
import { useGameStore } from '@/store/game';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTitleBar } from '@/hooks/useTitleBar';
import { overlay, mainWindow } from '@/lib/desktop';

export function GameControls() {
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const { status, drawOffered, drawOfferedByMe, game } = useGameStore();
  const { resign, offerDraw, acceptDraw, declineDraw } = useWebSocket();
  const { isTauriApp } = useTitleBar();

  /**
   * Opens the overlay window for the current game.
   * The overlay is a compact, always-on-top window that lets users
   * play chess while doing other things (coding, browsing, etc.).
   */
  const handleEnterOverlay = useCallback(async () => {
    if (!game?.id) return;

    try {
      // Open the overlay window with the current game
      await overlay.open(game.id);

      // Minimize the main window so user can focus on other apps
      await mainWindow.minimize();
    } catch (err) {
      console.error('Failed to open overlay:', err);
    }
  }, [game]);

  if (status !== 'playing') {
    return null;
  }

  return (
    <div className="bg-black h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/15">
        <p className="text-xs font-mono text-white/50 lowercase">actions</p>
      </div>

      <div className="p-3 space-y-3 flex-1">
        {/* Draw Offer */}
        {drawOffered && !drawOfferedByMe ? (
          <div className="p-3 bg-black border border-green-400/30">
            <p className="text-white font-mono text-sm mb-3 lowercase">
              opponent offers a draw
            </p>
            <div className="flex gap-2">
              <button
                onClick={acceptDraw}
                className="flex-1 px-3 py-1.5 bg-white text-black font-mono text-sm lowercase hover:bg-white/90 transition-all"
              >
                accept
              </button>
              <button
                onClick={declineDraw}
                className="flex-1 px-3 py-1.5 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all"
              >
                decline
              </button>
            </div>
          </div>
        ) : drawOfferedByMe ? (
          <div className="p-3 bg-black border border-white/15 text-center">
            <p className="text-white/70 font-mono text-sm lowercase">draw offer sent</p>
            <p className="text-xs text-white/30 font-mono mt-1 lowercase">waiting for opponent...</p>
          </div>
        ) : (
          <button
            onClick={offerDraw}
            className="w-full px-3 py-2 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all"
          >
            offer_draw
          </button>
        )}

        {/* Resign */}
        {showResignConfirm ? (
          <div className="p-3 bg-black border border-red-500/30">
            <p className="text-white/70 font-mono text-sm mb-3 lowercase">
              are you sure you want to resign?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  resign();
                  setShowResignConfirm(false);
                }}
                className="flex-1 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-sm lowercase hover:bg-red-500 hover:text-white transition-all"
              >
                confirm
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 px-3 py-1.5 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResignConfirm(true)}
            className="w-full px-3 py-2 bg-black text-red-400 border border-red-500/30 font-mono text-sm lowercase hover:border-red-500 transition-all"
          >
            resign
          </button>
        )}

        {/* Overlay Mode (Desktop only) */}
        {isTauriApp && (
          <button
            onClick={handleEnterOverlay}
            className="w-full px-3 py-2 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all flex items-center justify-center gap-2 group"
            title="Play in compact overlay while multitasking"
          >
            {/* Picture-in-Picture / Layered squares icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="group-hover:stroke-white transition-colors"
            >
              {/* Back rectangle (larger, slightly offset) */}
              <rect x="0.5" y="0.5" width="10" height="8" rx="1" />
              {/* Front rectangle (smaller, foreground) */}
              <rect x="5.5" y="5.5" width="8" height="6" rx="1" fill="black" />
            </svg>
            overlay_mode
          </button>
        )}
      </div>

      {/* Tips */}
      <div className="p-3 border-t border-white/15">
        <p className="text-xs font-mono text-white/30 mb-2 lowercase">controls</p>
        <ul className="text-xs text-white/50 font-mono space-y-1 lowercase">
          <li>click piece to select</li>
          <li>click destination to move</li>
          <li>or drag and drop</li>
          <li>right-click to draw arrows</li>
        </ul>
      </div>
    </div>
  );
}
