'use client';

interface PromotionDialogProps {
  color: 'white' | 'black';
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const PIECES = [
  { key: 'q', name: 'Queen', white: '♕', black: '♛' },
  { key: 'r', name: 'Rook', white: '♖', black: '♜' },
  { key: 'b', name: 'Bishop', white: '♗', black: '♝' },
  { key: 'n', name: 'Knight', white: '♘', black: '♞' },
] as const;

export function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <div className="fixed inset-0 bg-retro-dark/95 flex items-center justify-center z-50">
      <div className="bg-retro-mid border border-retro-blue/30 p-4 max-w-xs w-full shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <p className="text-xs font-mono text-retro-glow mb-4 text-center">
          choose_promotion
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PIECES.map((piece) => (
            <button
              key={piece.key}
              onClick={() => onSelect(piece.key)}
              className="p-3 bg-retro-dark border border-retro-blue/30 hover:border-retro-blue hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all"
            >
              <div className="text-3xl text-center">
                {color === 'white' ? piece.white : piece.black}
              </div>
            </button>
          ))}
        </div>

        <button onClick={onCancel} className="w-full px-4 py-2 bg-retro-dark text-retro-muted border border-retro-blue/30 font-mono hover:border-retro-blue hover:text-pure-white hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all">
          cancel
        </button>
      </div>
    </div>
  );
}
