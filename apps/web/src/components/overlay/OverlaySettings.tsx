/**
 * OverlaySettings — Settings dropdown for overlay customization
 * ==============================================================
 *
 * A dropdown menu providing quick access to overlay settings:
 *   - Size (small/medium/large)
 *   - Opacity slider
 *   - Toggle visibility of UI elements
 *
 * DESIGN:
 * - Gear icon trigger button
 * - Click outside to close
 * - Smooth slide-down animation
 */

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  OverlaySettings as OverlaySettingsType,
  OverlaySize,
  OverlayTheme,
  OverlayThemeColors,
} from '@/hooks/useOverlaySettings';
import { createDebouncedInvoke } from '@/lib/debouncedInvoke';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlaySettingsProps {
  /** Current settings */
  settings: OverlaySettingsType;
  /** Theme colors for styling */
  themeColors: OverlayThemeColors;
  /** Update opacity */
  onOpacityChange: (value: number) => void;
  /** Update size */
  onSizeChange: (value: OverlaySize) => void;
  /** Update theme */
  onThemeChange: (value: OverlayTheme) => void;
  /** Toggle clocks visibility */
  onToggleClocks: () => void;
  /** Toggle opponent info visibility */
  onToggleOpponentInfo: () => void;
  /** Toggle eval visibility */
  onToggleEval: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlaySettings({
  settings,
  themeColors,
  onOpacityChange,
  onSizeChange,
  onThemeChange,
  onToggleClocks,
  onToggleOpponentInfo,
  onToggleEval,
}: OverlaySettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Create a debounced invoke for opacity changes
  // This prevents flooding the Rust backend with IPC calls while dragging
  // the slider. The local state updates immediately for responsive UI,
  // but the backend only receives 3-4 calls instead of 150+.
  const debouncedSetOpacity = useMemo(
    () => createDebouncedInvoke<{ opacity: number }>('set_overlay_opacity', 300),
    []
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Apply opacity to the window (Tauri API) with debouncing
  // The local state update is immediate for responsive UI,
  // but the IPC call is debounced to reduce backend load.
  const handleOpacityChange = useCallback(
    (value: number) => {
      // Immediate local state update for responsive UI
      onOpacityChange(value);

      // Debounced backend sync (only fires after 300ms of no changes)
      debouncedSetOpacity({ opacity: value });
    },
    [onOpacityChange, debouncedSetOpacity]
  );

  // Resize the window when size changes
  const handleSizeChange = useCallback(
    async (size: OverlaySize) => {
      onSizeChange(size);

      // Resize the Tauri window to match
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');

        // Board dimensions + padding for UI elements
        const dimensions: Record<OverlaySize, { width: number; height: number }> = {
          small: { width: 232, height: 360 },
          medium: { width: 312, height: 480 },
          large: { width: 392, height: 580 },
        };

        const { width, height } = dimensions[size];
        await getCurrentWindow().setSize(new LogicalSize(width, height));
      } catch (error) {
        console.debug('Failed to resize window', error);
      }
    },
    [onSizeChange]
  );

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button - gear icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded transition-colors"
        style={{
          backgroundColor: isOpen ? themeColors.surfaceHover : 'transparent',
          color: isOpen ? themeColors.textPrimary : themeColors.textSecondary,
          border: `1px solid ${isOpen ? themeColors.border : 'transparent'}`,
        }}
        aria-label="Overlay settings"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        className="absolute right-0 top-full mt-1 z-50 w-52 shadow-xl transition-all duration-150 origin-top-right rounded-lg"
        style={{
          backgroundColor: themeColors.surface,
          border: `1px solid ${themeColors.border}`,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(0.95)',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Theme selector */}
        <div className="p-3" style={{ borderBottom: `1px solid ${themeColors.borderSubtle}` }}>
          <p className="text-[10px] font-mono mb-2" style={{ color: themeColors.textMuted }}>
            theme
          </p>
          <div className="flex gap-1">
            {(['dark', 'grey', 'light'] as OverlayTheme[]).map((theme) => (
              <button
                key={theme}
                onClick={() => onThemeChange(theme)}
                className="flex-1 px-2 py-1 text-[10px] font-mono transition-colors rounded"
                style={{
                  backgroundColor:
                    settings.theme === theme ? themeColors.textPrimary : themeColors.background,
                  color:
                    settings.theme === theme ? themeColors.background : themeColors.textSecondary,
                  border:
                    settings.theme === theme
                      ? 'none'
                      : `1px solid ${themeColors.border}`,
                }}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        {/* Size selector */}
        <div className="p-3" style={{ borderBottom: `1px solid ${themeColors.borderSubtle}` }}>
          <p className="text-[10px] font-mono mb-2" style={{ color: themeColors.textMuted }}>
            size
          </p>
          <div className="flex gap-1">
            {(['small', 'medium', 'large'] as OverlaySize[]).map((size) => (
              <button
                key={size}
                onClick={() => handleSizeChange(size)}
                className="flex-1 px-2 py-1 text-[10px] font-mono transition-colors rounded"
                style={{
                  backgroundColor:
                    settings.size === size ? themeColors.textPrimary : themeColors.background,
                  color:
                    settings.size === size ? themeColors.background : themeColors.textSecondary,
                  border:
                    settings.size === size
                      ? 'none'
                      : `1px solid ${themeColors.border}`,
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Opacity slider */}
        <div className="p-3" style={{ borderBottom: `1px solid ${themeColors.borderSubtle}` }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono" style={{ color: themeColors.textMuted }}>
              opacity
            </p>
            <span className="text-[10px] font-mono" style={{ color: themeColors.textSecondary }}>
              {Math.round(settings.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            value={settings.opacity * 100}
            onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
            className="w-full h-1 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-thumb]:transition-transform
            "
            style={
              {
                backgroundColor: themeColors.border,
                '--slider-thumb-color': themeColors.textPrimary,
              } as React.CSSProperties
            }
          />
        </div>

        {/* Toggle switches */}
        <div className="p-3 space-y-2">
          <ToggleRow
            label="show clocks"
            checked={settings.showClocks}
            onChange={onToggleClocks}
            themeColors={themeColors}
          />
          <ToggleRow
            label="show opponent info"
            checked={settings.showOpponentInfo}
            onChange={onToggleOpponentInfo}
            themeColors={themeColors}
          />
          <ToggleRow
            label="show eval"
            checked={settings.showEval}
            onChange={onToggleEval}
            themeColors={themeColors}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  themeColors: OverlayThemeColors;
}

function ToggleRow({ label, checked, onChange, themeColors }: ToggleRowProps) {
  return (
    <button
      onClick={onChange}
      className="flex items-center justify-between w-full text-left group"
    >
      <span
        className="text-[10px] font-mono transition-colors"
        style={{ color: themeColors.textSecondary }}
      >
        {label}
      </span>
      <div
        className="w-7 h-4 rounded-full relative transition-colors border"
        style={{
          backgroundColor: checked ? 'rgba(74, 222, 128, 0.3)' : themeColors.surfaceHover,
          borderColor: checked ? 'rgba(74, 222, 128, 0.5)' : themeColors.border,
        }}
      >
        <div
          className="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all"
          style={{
            left: checked ? '14px' : '2px',
            backgroundColor: checked ? 'rgb(74, 222, 128)' : themeColors.textMuted,
          }}
        />
      </div>
    </button>
  );
}

export default OverlaySettings;
