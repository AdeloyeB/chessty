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
    <div className="bg-retro-mid border border-retro-blue/20 p-4">
      <p className="text-xs font-mono text-retro-muted mb-6">actions</p>

      <div className="space-y-4">
        {/* Draw Offer */}
        {drawOffered && !drawOfferedByMe ? (
          <div className="p-4 bg-retro-dark border border-retro-cyan shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <p className="text-pure-white font-mono mb-4">
              opponent offers a draw
            </p>
            <div className="flex gap-3">
              <button onClick={acceptDraw} className="flex-1 px-4 py-2 bg-retro-blue text-pure-white border border-retro-blue font-mono hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all">
                accept
              </button>
              <button onClick={declineDraw} className="flex-1 px-4 py-2 bg-retro-dark text-retro-muted border border-retro-blue/30 font-mono hover:border-retro-blue hover:text-pure-white transition-all">
                decline
              </button>
            </div>
          </div>
        ) : drawOfferedByMe ? (
          <div className="p-4 bg-retro-dark border border-retro-blue/30 text-center">
            <p className="text-retro-glow font-mono">draw offer sent</p>
            <p className="text-xs text-retro-muted font-mono mt-1">waiting for opponent...</p>
          </div>
        ) : (
          <button
            onClick={offerDraw}
            className="w-full px-4 py-2 bg-retro-dark text-retro-muted border border-retro-blue/30 font-mono hover:border-retro-blue hover:text-pure-white hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all"
          >
            offer_draw
          </button>
        )}

        {/* Resign */}
        {showResignConfirm ? (
          <div className="p-4 bg-retro-dark border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <p className="text-retro-glow font-mono mb-4">
              are you sure you want to resign?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  resign();
                  setShowResignConfirm(false);
                }}
                className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 font-mono hover:bg-red-500 hover:text-pure-white hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all"
              >
                confirm
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 px-4 py-2 bg-retro-dark text-retro-muted border border-retro-blue/30 font-mono hover:border-retro-blue hover:text-pure-white transition-all"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResignConfirm(true)}
            className="w-full px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 font-mono hover:bg-red-500/20 hover:border-red-500/50 transition-all"
          >
            resign
          </button>
        )}
      </div>

      {/* Tips */}
      <div className="mt-8 pt-6 border-t border-retro-blue/20">
        <p className="text-xs font-mono text-retro-muted mb-4">controls</p>
        <ul className="text-sm text-retro-glow/70 font-mono space-y-2">
          <li>click piece to select</li>
          <li>click destination to move</li>
          <li>or drag and drop</li>
          <li>right-click to draw arrows</li>
        </ul>
      </div>
    </div>
  );
}
