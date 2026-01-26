'use client';

import { useEffect } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import type { HistoryGame } from '@chess-game/shared';
import { useMoveViewer } from '@/hooks/useMoveViewer';
import { MoveNavigator } from './MoveNavigator';
import { MoveList } from './MoveList';
import { GameInfo } from './GameInfo';
import { USDCAmount } from '@/components/wallet/USDCAmount';

interface GameDetailDrawerProps {
  game: HistoryGame | null;
  onClose: () => void;
}

export function GameDetailDrawer({ game, onClose }: GameDetailDrawerProps) {
  const moveViewer = useMoveViewer({
    moves: game?.moves ?? [],
    startingFen: game?.startingFen,
  });

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (game) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [game]);

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-pure-black/80"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-4xl bg-off-black border-l border-mid/30 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-pure-black border-b border-mid/30">
          <div>
            <p className="text-xs font-mono text-mid-light">game_detail</p>
            <p className="text-lg font-mono text-pure-white">
              vs {game.opponent.username}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-mid-light hover:text-pure-white transition-colors"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Result Banner */}
          <ResultBanner game={game} />

          {/* Main Grid - Board and Move List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chess Board */}
            <div className="space-y-4">
              <div className="aspect-square bg-pure-black border border-mid/30 p-2">
                <ChessBoard
                  position={moveViewer.currentFen}
                  orientation={game.playerColor}
                />
              </div>

              {/* Move Navigator */}
              <MoveNavigator
                currentMove={moveViewer.currentMoveIndex}
                totalMoves={moveViewer.totalMoves}
                isPlaying={moveViewer.isPlaying}
                onGoToStart={moveViewer.goToStart}
                onGoBack={moveViewer.goBack}
                onGoForward={moveViewer.goForward}
                onGoToEnd={moveViewer.goToEnd}
                onTogglePlayback={moveViewer.togglePlayback}
                playbackSpeed={moveViewer.playbackSpeed}
                onSpeedChange={moveViewer.setPlaybackSpeed}
              />
            </div>

            {/* Move List */}
            <div className="space-y-4">
              <div className="bg-pure-black border border-mid/30 p-4 h-[400px] overflow-y-auto">
                <p className="text-xs font-mono text-mid-light mb-3">moves</p>
                <MoveList
                  moves={game.moves}
                  currentMoveIndex={moveViewer.currentMoveIndex}
                  onMoveClick={(index) => moveViewer.goToMove(index)}
                />
              </div>

              {/* Game Info */}
              <GameInfo game={game} />
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="text-xs font-mono text-mid-light text-center">
            <span className="border border-mid/30 px-2 py-0.5">←</span>
            {' '}prev move{' '}
            <span className="border border-mid/30 px-2 py-0.5 ml-2">→</span>
            {' '}next move{' '}
            <span className="border border-mid/30 px-2 py-0.5 ml-2">space</span>
            {' '}play/pause{' '}
            <span className="border border-mid/30 px-2 py-0.5 ml-2">home</span>
            {' '}start{' '}
            <span className="border border-mid/30 px-2 py-0.5 ml-2">end</span>
            {' '}end{' '}
            <span className="border border-mid/30 px-2 py-0.5 ml-2">esc</span>
            {' '}close
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultBanner({ game }: { game: HistoryGame }) {
  const colors = {
    win: 'bg-green-500/10 border-green-500/30 text-green-400',
    loss: 'bg-red-500/10 border-red-500/30 text-red-400',
    draw: 'bg-mid/10 border-mid/30 text-mid-light',
  };

  const resultText = {
    win: 'Victory',
    loss: 'Defeat',
    draw: 'Draw',
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  return (
    <div className={`p-4 border ${colors[game.result]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-mono font-medium">{resultText[game.result]}</p>
          <p className="text-sm font-mono opacity-80">
            {game.resultDetail?.replace(/_/g, ' ')} • {game.moveCount} moves • {formatDuration(game.duration)}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-mono opacity-60">wager</p>
              <USDCAmount amount={game.wagerAmount} size="sm" />
            </div>
            <div>
              <p className="text-xs font-mono opacity-60">profit</p>
              <p className="font-mono text-sm">
                {game.result === 'win' ? '+' : game.result === 'loss' ? '-' : ''}
                ${game.result === 'draw' ? '0' : game.wagerAmount.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs font-mono opacity-60">elo</p>
              <p className="font-mono text-sm">
                {game.eloChange > 0 ? '+' : ''}{game.eloChange}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
