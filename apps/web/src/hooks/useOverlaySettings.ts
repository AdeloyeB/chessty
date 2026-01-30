/**
 * useOverlaySettings — Hook for overlay window settings persistence
 * ==================================================================
 *
 * This hook manages the overlay window's user preferences:
 *   - Size (small/medium/large) — controls board dimensions
 *   - Opacity (0.3 - 1.0) — window transparency for multitasking
 *   - UI visibility toggles (clocks, opponent info, eval bar)
 *   - Expanded state for the stats panel
 *
 * Settings are persisted via Tauri's secure store plugin so they
 * survive app restarts. On first load (or if store is unavailable),
 * sensible defaults are used.
 *
 * WHY A DEDICATED HOOK?
 * The overlay window is a separate Tauri window with its own webview.
 * We need settings to persist across sessions and potentially sync
 * between the main window and overlay if the user opens settings there.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlaySize = 'small' | 'medium' | 'large';
export type OverlayTheme = 'dark' | 'grey' | 'light';

/**
 * Theme color definitions for the overlay.
 *
 * Each theme defines colors for:
 * - Background/surface colors (window, panels)
 * - Text colors (primary, secondary, muted)
 * - Border colors
 * - Chessboard squares (light/dark)
 * - Piece stroke colors (white/black)
 * - Highlight colors (selected, last move, legal moves, check)
 */
export interface OverlayThemeColors {
  // Backgrounds
  background: string;
  surface: string;
  surfaceHover: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;
  borderSubtle: string;

  // Chessboard
  squareLight: string;
  squareDark: string;
  boardBorder: string;

  // Pieces
  pieceWhite: string;
  pieceBlack: string;
  pieceWhiteFill: string;
  pieceBlackFill: string;

  // Highlights
  selected: string;
  selectedRing: string;
  lastMove: string;
  legalMove: string;
  legalMoveCapture: string;
  check: string;
  checkRing: string;
  turnGlow: string;
}

/**
 * Theme presets for Dark, Grey, and Light modes.
 *
 * Dark: Pure black, high contrast (current default)
 * Grey: Slate grey, softer on the eyes
 * Light: Clean white, classic look
 */
export const OVERLAY_THEMES: Record<OverlayTheme, OverlayThemeColors> = {
  dark: {
    // Backgrounds
    background: '#000000',          // pure-black
    surface: '#0a0a0a',             // off-black
    surfaceHover: 'rgba(255,255,255,0.05)',

    // Text
    textPrimary: '#ffffff',         // pure-white
    textSecondary: '#888888',       // mid-light
    textMuted: '#666666',           // mid

    // Borders
    border: 'rgba(102,102,102,0.3)', // mid/30
    borderSubtle: 'rgba(102,102,102,0.15)',

    // Board - minimal black grid
    squareLight: '#0a0a0a',         // off-black
    squareDark: '#000000',          // pure-black
    boardBorder: 'rgba(255,255,255,0.15)',

    // Pieces
    pieceWhite: '#ffffff',
    pieceBlack: '#888888',
    pieceWhiteFill: 'none',
    pieceBlackFill: 'none',

    // Highlights
    selected: 'rgba(255,255,255,0.1)',
    selectedRing: 'rgba(255,255,255,0.3)',
    lastMove: 'rgba(255,255,255,0.05)',
    legalMove: 'rgba(255,255,255,0.15)',
    legalMoveCapture: 'rgba(255,255,255,0.25)',
    check: 'rgba(239,68,68,0.15)',
    checkRing: 'rgba(248,113,113,0.4)',
    turnGlow: 'rgba(74,222,128,0.15)',
  },

  grey: {
    // Backgrounds - slate grey
    background: '#1a1d24',
    surface: '#242830',
    surfaceHover: 'rgba(255,255,255,0.05)',

    // Text
    textPrimary: '#e2e8f0',         // slate-200
    textSecondary: '#94a3b8',       // slate-400
    textMuted: '#64748b',           // slate-500

    // Borders
    border: 'rgba(148,163,184,0.2)',
    borderSubtle: 'rgba(148,163,184,0.1)',

    // Board - warm slate squares
    squareLight: '#3d4452',         // lighter slate
    squareDark: '#2a2f38',          // darker slate
    boardBorder: 'rgba(148,163,184,0.2)',

    // Pieces - cream and charcoal
    pieceWhite: '#f1e8dc',          // warm cream
    pieceBlack: '#3a3a3a',          // charcoal
    pieceWhiteFill: 'none',
    pieceBlackFill: 'none',

    // Highlights
    selected: 'rgba(99,102,241,0.2)',    // indigo tint
    selectedRing: 'rgba(99,102,241,0.4)',
    lastMove: 'rgba(99,102,241,0.1)',
    legalMove: 'rgba(99,102,241,0.25)',
    legalMoveCapture: 'rgba(99,102,241,0.35)',
    check: 'rgba(239,68,68,0.2)',
    checkRing: 'rgba(248,113,113,0.4)',
    turnGlow: 'rgba(74,222,128,0.15)',
  },

  light: {
    // Backgrounds - warm off-white
    background: '#f5f3f0',          // slightly darker for better contrast
    surface: '#ffffff',
    surfaceHover: 'rgba(0,0,0,0.05)',

    // Text - darker for better accessibility/contrast
    textPrimary: '#0f0f0f',         // near-black for maximum contrast
    textSecondary: '#4a4a4a',       // darker grey for readability
    textMuted: '#6b6b6b',           // medium grey

    // Borders - slightly more visible
    border: 'rgba(0,0,0,0.15)',
    borderSubtle: 'rgba(0,0,0,0.08)',

    // Board - classic tan/cream
    squareLight: '#f0d9b5',         // classic light (lichess-style)
    squareDark: '#b58863',          // classic dark (lichess-style)
    boardBorder: 'rgba(0,0,0,0.2)',

    // Pieces - black outlines for both (classic style)
    pieceWhite: '#1a1a1a',
    pieceBlack: '#1a1a1a',
    pieceWhiteFill: '#ffffff',      // filled white pieces
    pieceBlackFill: '#1a1a1a',      // filled black pieces

    // Highlights
    selected: 'rgba(255,199,0,0.4)',     // golden yellow
    selectedRing: 'rgba(255,199,0,0.6)',
    lastMove: 'rgba(255,199,0,0.25)',
    legalMove: 'rgba(0,0,0,0.15)',
    legalMoveCapture: 'rgba(0,0,0,0.25)',
    check: 'rgba(239,68,68,0.35)',
    checkRing: 'rgba(220,38,38,0.5)',
    turnGlow: 'rgba(22,163,74,0.25)',
  },
};

export interface OverlaySettings {
  /** Window opacity - 0.3 (very transparent) to 1.0 (fully opaque) */
  opacity: number;
  /** Board size - affects the overall overlay dimensions */
  size: OverlaySize;
  /** Color theme - dark (default), grey, or light */
  theme: OverlayTheme;
  /** Show the chess clocks */
  showClocks: boolean;
  /** Show opponent name and rating in header */
  showOpponentInfo: boolean;
  /** Show engine evaluation in expanded panel */
  showEval: boolean;
  /** Whether the stats panel is expanded */
  expanded: boolean;
}

interface UseOverlaySettingsReturn {
  settings: OverlaySettings;
  /** Current theme colors (computed from settings.theme) */
  themeColors: OverlayThemeColors;
  isLoading: boolean;
  setOpacity: (value: number) => void;
  setSize: (value: OverlaySize) => void;
  setTheme: (value: OverlayTheme) => void;
  toggleClocks: () => void;
  toggleOpponentInfo: () => void;
  toggleEval: () => void;
  toggleExpanded: () => void;
  setSetting: <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_KEY = 'overlay-settings';

/** Default settings - medium size, 96% opacity, dark theme, everything visible */
const DEFAULT_SETTINGS: OverlaySettings = {
  opacity: 0.96, // Slight transparency by default for modern look
  size: 'medium',
  theme: 'dark', // Dark theme by default (matches main app aesthetic)
  showClocks: true,
  showOpponentInfo: true,
  showEval: true,
  expanded: false,
};

/**
 * Board dimensions for each size setting.
 *
 * These MUST match the Rust calculations in commands/overlay.rs:
 * - width = board + 32px (16px padding on each side)
 * - heightCollapsed = board + 192px (header, clocks, board padding, stats bar, drag handle)
 * - heightExpanded = heightCollapsed + 152px (stakes, moves, eval, padding)
 *
 * Collapsed breakdown:
 * - Header (close + opponent + settings): 40px
 * - Opponent clock row: 32px
 * - Board container padding: 16px
 * - Player clock row: 32px
 * - Stats header (name + expand): 40px
 * - Drag handle: 28px
 * - Borders: 4px
 * Total extra: 192px
 *
 * Expanded adds:
 * - Stakes row: 24px
 * - Move history box: 80px
 * - Eval row: 20px
 * - Move count row: 16px
 * - Spacing: 12px
 * Total: ~152px extra when expanded
 *
 * If you change these values, update calculate_window_height() in Rust too!
 */
export const OVERLAY_SIZES: Record<OverlaySize, {
  board: number;
  width: number;
  heightCollapsed: number;
  heightExpanded: number;
}> = {
  small:  { board: 200, width: 232, heightCollapsed: 392, heightExpanded: 544 },
  medium: { board: 280, width: 312, heightCollapsed: 472, heightExpanded: 624 },
  large:  { board: 360, width: 392, heightCollapsed: 552, heightExpanded: 704 },
};

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useOverlaySettings(): UseOverlaySettingsReturn {
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from localStorage on mount
  // Note: Tauri plugin-store requires additional setup; using localStorage for portability
  useEffect(() => {
    let isMounted = true;

    const loadSettings = () => {
      try {
        // Use localStorage for persistence (works in both Tauri webview and dev)
        if (typeof window !== 'undefined' && window.localStorage) {
          const stored = localStorage.getItem(STORE_KEY);
          if (stored && isMounted) {
            const parsed = JSON.parse(stored) as Partial<OverlaySettings>;
            // Merge with defaults to handle new settings added in updates
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          }
        }
      } catch (error) {
        // Storage unavailable or invalid JSON
        console.debug('Overlay settings: using defaults', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync Tauri window size when expanded state or size preset changes.
  // This is critical for keeping the native window in sync with React content.
  // Without this, expanding the stats panel would clip content because the
  // Tauri window size stays fixed while React content grows.
  useEffect(() => {
    // Skip during SSR and initial loading
    if (typeof window === 'undefined' || isLoading) return;

    const syncWindowSize = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const sizeConfig = OVERLAY_SIZES[settings.size];
        const height = settings.expanded
          ? sizeConfig.heightExpanded
          : sizeConfig.heightCollapsed;

        await invoke('resize_overlay', {
          width: sizeConfig.width,
          height,
        });
      } catch (error) {
        // Not in Tauri context (dev browser) or resize failed
        console.debug('[Overlay] Window resize skipped:', error);
      }
    };

    syncWindowSize();
  }, [settings.expanded, settings.size, isLoading]);

  // Persist settings to localStorage whenever they change
  const persistSettings = useCallback((newSettings: OverlaySettings) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORE_KEY, JSON.stringify(newSettings));
      }
    } catch (error) {
      console.debug('Failed to persist overlay settings', error);
    }
  }, []);

  // Generic setter that updates state and persists
  const setSetting = useCallback(
    <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => {
      setSettings((prev) => {
        const newSettings = { ...prev, [key]: value };
        persistSettings(newSettings);
        return newSettings;
      });
    },
    [persistSettings]
  );

  // Convenience setters
  const setOpacity = useCallback(
    (value: number) => {
      // Clamp to valid range
      const clamped = Math.max(0.3, Math.min(1.0, value));
      setSetting('opacity', clamped);
    },
    [setSetting]
  );

  const setSize = useCallback(
    (value: OverlaySize) => setSetting('size', value),
    [setSetting]
  );

  const setTheme = useCallback(
    (value: OverlayTheme) => setSetting('theme', value),
    [setSetting]
  );

  // Compute current theme colors from settings
  const themeColors = useMemo(
    () => OVERLAY_THEMES[settings.theme],
    [settings.theme]
  );

  const toggleClocks = useCallback(
    () => setSetting('showClocks', !settings.showClocks),
    [settings.showClocks, setSetting]
  );

  const toggleOpponentInfo = useCallback(
    () => setSetting('showOpponentInfo', !settings.showOpponentInfo),
    [settings.showOpponentInfo, setSetting]
  );

  const toggleEval = useCallback(
    () => setSetting('showEval', !settings.showEval),
    [settings.showEval, setSetting]
  );

  const toggleExpanded = useCallback(
    () => setSetting('expanded', !settings.expanded),
    [settings.expanded, setSetting]
  );

  return {
    settings,
    themeColors,
    isLoading,
    setOpacity,
    setSize,
    setTheme,
    toggleClocks,
    toggleOpponentInfo,
    toggleEval,
    toggleExpanded,
    setSetting,
  };
}
