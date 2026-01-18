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
    <div className="fixed inset-0 bg-pure-black/95 flex items-center justify-center z-50">
      <div className="card max-w-xs w-full">
        <p className="text-xs font-mono text-mid-light mb-4 text-center">
          choose_promotion
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PIECES.map((piece) => (
            <button
              key={piece.key}
              onClick={() => onSelect(piece.key)}
              className="p-3 bg-pure-black border border-mid hover:border-pure-white transition-colors"
            >
              <div className="text-3xl text-center">
                {color === 'white' ? piece.white : piece.black}
              </div>
            </button>
          ))}
        </div>

        <button onClick={onCancel} className="w-full btn btn-secondary">
          cancel
        </button>
      </div>
    </div>
  );
}
