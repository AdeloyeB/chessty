'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/game';
import { useWebSocket } from '@/hooks/useWebSocket';

export function GameControls() {
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const { status, drawOffered, drawOfferedByMe } = useGameStore();
  const { resign, offerDraw, acceptDraw, declineDraw } = useWebSocket();

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
