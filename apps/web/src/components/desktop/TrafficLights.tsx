/**
 * TrafficLights — macOS-style window control buttons
 * ====================================================
 *
 * The three circles in the top-left corner of every macOS window:
 *   🔴 Red    = Close
 *   🟡 Yellow = Minimize
 *   🟢 Green  = Maximize / Fullscreen
 *
 * These are "traffic lights" in Apple's design language. We rebuild
 * them in HTML/CSS instead of using native ones because:
 *   1. Our `decorations: false` config removes native buttons
 *   2. We want them to match our monochrome aesthetic (white outlines
 *      when idle, colored on hover — a subtle nod to macOS without
 *      breaking our black/white design)
 *
 * HOVER BEHAVIOR:
 * - Default: Three small white-outlined circles
 * - Hover over group: Circles fill with macOS colors and show symbols
 *   (×, −, +) — this is exactly how macOS behaves
 */

'use client';

interface TrafficLightsProps {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

export function TrafficLights({ onClose, onMinimize, onMaximize }: TrafficLightsProps) {
  return (
    <div className="flex items-center gap-2 group pl-3 pr-2">
      {/* Close */}
      <button
        onClick={onClose}
        className="
          w-3 h-3 rounded-full border border-white/30
          bg-transparent transition-all duration-150
          group-hover:bg-[#FF5F57] group-hover:border-[#FF5F57]
          flex items-center justify-center
        "
        aria-label="close window"
      >
        <span className="text-[8px] leading-none text-transparent group-hover:text-black/80 font-bold">
          ×
        </span>
      </button>

      {/* Minimize */}
      <button
        onClick={onMinimize}
        className="
          w-3 h-3 rounded-full border border-white/30
          bg-transparent transition-all duration-150
          group-hover:bg-[#FFBD2E] group-hover:border-[#FFBD2E]
          flex items-center justify-center
        "
        aria-label="minimize window"
      >
        <span className="text-[8px] leading-none text-transparent group-hover:text-black/80 font-bold">
          −
        </span>
      </button>

      {/* Maximize */}
      <button
        onClick={onMaximize}
        className="
          w-3 h-3 rounded-full border border-white/30
          bg-transparent transition-all duration-150
          group-hover:bg-[#28C940] group-hover:border-[#28C940]
          flex items-center justify-center
        "
        aria-label="maximize window"
      >
        <span className="text-[8px] leading-none text-transparent group-hover:text-black/80 font-bold">
          +
        </span>
      </button>
    </div>
  );
}
