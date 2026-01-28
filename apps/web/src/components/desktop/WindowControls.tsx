/**
 * WindowControls — Windows/Linux-style window control buttons
 * =============================================================
 *
 * These are the minimize/maximize/close buttons that appear on the
 * RIGHT side of the titlebar on Windows and Linux. On macOS, we use
 * TrafficLights instead (left-aligned circles).
 *
 * DESIGN:
 * - Three rectangular buttons matching our blueprint aesthetic
 * - White outlines with transparent fill by default
 * - Close button turns red on hover (universal "danger" signal)
 * - Minimize/maximize brighten on hover
 * - Uses SVG icons for crisp rendering at any scale
 *
 * WINDOWS 11 vs LINUX:
 * - Windows 11 uses taller rectangular buttons (~46px wide, 32px tall)
 * - Linux varies by DE, but we use a generic style that fits most
 * - Both place controls on the right side of the titlebar
 */

'use client';

interface WindowControlsProps {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMaximized: boolean;
}

export function WindowControls({
  onClose,
  onMinimize,
  onMaximize,
  isMaximized,
}: WindowControlsProps) {
  return (
    <div className="flex items-center h-full">
      {/* Minimize */}
      <button
        onClick={onMinimize}
        className="
          w-12 h-full flex items-center justify-center
          text-white/50 transition-colors duration-150
          hover:bg-white/10 hover:text-white
        "
        aria-label="minimize window"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      <button
        onClick={onMaximize}
        className="
          w-12 h-full flex items-center justify-center
          text-white/50 transition-colors duration-150
          hover:bg-white/10 hover:text-white
        "
        aria-label={isMaximized ? 'restore window' : 'maximize window'}
      >
        {isMaximized ? (
          // Restore icon — two overlapping rectangles
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="0" width="8" height="8" rx="0.5" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" />
          </svg>
        ) : (
          // Maximize icon — single rectangle
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0" y="0" width="10" height="10" rx="0.5" />
          </svg>
        )}
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="
          w-12 h-full flex items-center justify-center
          text-white/50 transition-colors duration-150
          hover:bg-[#E81123] hover:text-white
        "
        aria-label="close window"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </div>
  );
}
