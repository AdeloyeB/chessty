'use client';

interface MoveNavigatorProps {
  currentMove: number;
  totalMoves: number;
  isPlaying: boolean;
  onGoToStart: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToEnd: () => void;
  onTogglePlayback: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export function MoveNavigator({
  currentMove,
  totalMoves,
  isPlaying,
  onGoToStart,
  onGoBack,
  onGoForward,
  onGoToEnd,
  onTogglePlayback,
  playbackSpeed,
  onSpeedChange,
}: MoveNavigatorProps) {
  const displayMove = currentMove + 1; // Convert from 0-indexed to 1-indexed
  const progress = totalMoves > 0 ? ((currentMove + 1) / totalMoves) * 100 : 0;

  return (
    <div className="bg-pure-black border border-mid/30 p-4 space-y-3">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="h-1 bg-mid/30 overflow-hidden">
          <div
            className="h-full bg-pure-white transition-all duration-150"
            style={{ width: `${Math.max(0, progress)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono text-mid-light">
          <span>Move {displayMove <= 0 ? '-' : displayMove}</span>
          <span>/ {totalMoves}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <NavButton onClick={onGoToStart} title="Go to start (Home)">
          ⏮
        </NavButton>
        <NavButton onClick={onGoBack} title="Previous move (←)">
          ⏪
        </NavButton>
        <button
          onClick={onTogglePlayback}
          className="w-12 h-12 flex items-center justify-center bg-pure-white text-pure-black hover:bg-off-white transition-colors text-xl"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <NavButton onClick={onGoForward} title="Next move (→)">
          ⏩
        </NavButton>
        <NavButton onClick={onGoToEnd} title="Go to end (End)">
          ⏭
        </NavButton>
      </div>

      {/* Speed Control */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-xs font-mono text-mid-light">speed:</span>
        {[0.5, 1, 2, 3].map((speed) => (
          <button
            key={speed}
            onClick={() => onSpeedChange(speed)}
            className={`px-2 py-0.5 text-xs font-mono border transition-colors ${
              playbackSpeed === speed
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'text-mid-light border-mid/30 hover:border-pure-white hover:text-pure-white'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}

function NavButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-10 h-10 flex items-center justify-center bg-off-black border border-mid/30 text-mid-light hover:text-pure-white hover:border-pure-white transition-colors"
    >
      {children}
    </button>
  );
}
