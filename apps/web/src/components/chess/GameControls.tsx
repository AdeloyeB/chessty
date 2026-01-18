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
    <div className="card">
      <p className="text-xs font-mono text-mid-light mb-6">actions</p>

      <div className="space-y-4">
        {/* Draw Offer */}
        {drawOffered && !drawOfferedByMe ? (
          <div className="p-4 bg-pure-black border border-light">
            <p className="text-pure-white font-mono mb-4">
              opponent offers a draw
            </p>
            <div className="flex gap-3">
              <button onClick={acceptDraw} className="flex-1 btn btn-primary">
                accept
              </button>
              <button onClick={declineDraw} className="flex-1 btn btn-secondary">
                decline
              </button>
            </div>
          </div>
        ) : drawOfferedByMe ? (
          <div className="p-4 bg-pure-black border border-mid/30 text-center">
            <p className="text-mid-light font-mono">draw offer sent</p>
            <p className="text-xs text-mid font-mono mt-1">waiting for opponent...</p>
          </div>
        ) : (
          <button
            onClick={offerDraw}
            className="w-full btn btn-secondary"
          >
            offer_draw
          </button>
        )}

        {/* Resign */}
        {showResignConfirm ? (
          <div className="p-4 bg-pure-black border border-mid">
            <p className="text-mid-light font-mono mb-4">
              are you sure you want to resign?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  resign();
                  setShowResignConfirm(false);
                }}
                className="flex-1 btn btn-danger"
              >
                confirm
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 btn btn-secondary"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResignConfirm(true)}
            className="w-full btn btn-danger"
          >
            resign
          </button>
        )}
      </div>

      {/* Tips */}
      <div className="mt-8 pt-6 border-t border-mid/30">
        <p className="text-xs font-mono text-mid-light mb-4">controls</p>
        <ul className="text-sm text-mid font-mono space-y-2">
          <li>click piece to select</li>
          <li>click destination to move</li>
          <li>or drag and drop</li>
          <li>right-click to draw arrows</li>
        </ul>
      </div>
    </div>
  );
}
