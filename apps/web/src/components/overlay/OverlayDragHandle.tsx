/**
 * OverlayDragHandle — Draggable region for repositioning the overlay window
 * ==========================================================================
 *
 * This component provides a visual drag handle at the bottom of the overlay
 * that users can grab to reposition the window. It uses Tauri's native
 * drag functionality via the `data-tauri-drag-region` attribute.
 *
 * DESIGN:
 * - Subtle horizontal bars icon (hamburger-style)
 * - Slight background highlight on hover
 * - The entire region is draggable
 * - Cursor changes to "grab" on hover
 */

'use client';

import type { OverlayThemeColors } from '@/hooks/useOverlaySettings';
import { OVERLAY_THEMES } from '@/hooks/useOverlaySettings';

interface OverlayDragHandleProps {
  /** Optional additional classes */
  className?: string;
  /** Theme colors */
  themeColors?: OverlayThemeColors;
}

export function OverlayDragHandle({
  className = '',
  themeColors = OVERLAY_THEMES.dark,
}: OverlayDragHandleProps) {
  return (
    <div
      data-tauri-drag-region
      className={`
        flex items-center justify-center
        h-6 w-full
        cursor-grab active:cursor-grabbing
        transition-colors select-none
        rounded-b-xl
        ${className}
      `}
      style={{
        backgroundColor: themeColors.surface,
        borderTop: `1px solid ${themeColors.border}`,
      }}
    >
      {/* Hamburger icon - two horizontal lines */}
      <div className="flex flex-col gap-[3px] pointer-events-none">
        <div
          className="w-6 h-[2px] rounded-full"
          style={{ backgroundColor: themeColors.textMuted }}
        />
        <div
          className="w-6 h-[2px] rounded-full"
          style={{ backgroundColor: themeColors.textMuted }}
        />
      </div>
    </div>
  );
}

export default OverlayDragHandle;
