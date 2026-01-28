'use client';

import { useDroppable } from '@dnd-kit/core';

interface DroppableGridCellProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A droppable zone in the multi-game grid.
 * When a sub-nav tile is dragged over this area, it highlights.
 * On drop, the game is added to the grid at this position.
 */
export function DroppableGridCell({ id, children, className = '' }: DroppableGridCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-all ${
        isOver ? 'ring-2 ring-white/50 bg-white/5' : ''
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The main content area acts as a drop zone for tiles from the sub-nav.
 * Dropping a tile here adds it to the grid and switches to multi mode.
 */
export function DroppableContentArea({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'content-area' });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-0 transition-all ${
        isOver ? 'ring-1 ring-inset ring-white/20 bg-white/[0.02]' : ''
      }`}
    >
      {children}
    </div>
  );
}
