/**
 * DesktopLayout — Applies desktop-specific CSS classes and native styling
 * ========================================================================
 *
 * This is a Tauri-only desktop app. This component:
 *   1. Adds CSS classes for desktop layout (padding for titlebar/ticker)
 *   2. Enables native macOS window styling (rounded corners, traffic lights)
 *   3. Provides context for child components to know if native styling is active
 *
 * The effects are applied on client mount (after hydration) to avoid
 * SSR mismatches.
 *
 * NATIVE macOS STYLING:
 * On macOS, we call the Rust `enable_modern_window_style` command which:
 *   - Sets NSWindowStyleMask for native traffic lights
 *   - Makes the titlebar transparent
 *   - Clips content to rounded corners
 *
 * The TitleBar component checks isNativeStyled to hide its custom React
 * traffic light buttons when native ones are active.
 */

'use client';

import { createContext, useContext, useEffect } from 'react';
// import { useNativeMacOSStyle } from '@/hooks/useNativeMacOSStyle';

// ---------------------------------------------------------------------------
// Context for Native Styling State
// ---------------------------------------------------------------------------

interface DesktopContextValue {
  /** Whether native macOS traffic lights are active */
  isNativeStyled: boolean;
}

const DesktopContext = createContext<DesktopContextValue>({
  isNativeStyled: false,
});

/**
 * Hook for child components to check if native macOS styling is active.
 * Used by TitleBar to conditionally hide custom traffic light buttons.
 */
export function useDesktopContext() {
  return useContext(DesktopContext);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DesktopLayoutProps {
  children?: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  // DISABLED: Native macOS traffic lights
  // We use custom React TrafficLights instead for consistent cross-platform styling.
  // The native hook is commented out - we just use CSS rounded corners via .tauri-app class.
  // const { isNativeStyled } = useNativeMacOSStyle({ cornerRadius: 12 });
  const isNativeStyled = false; // Force custom traffic lights to render

  useEffect(() => {
    // Add class to body and html so CSS can adapt layout for desktop
    // (e.g., hide browser navbar, add padding for titlebar/ticker,
    // rounded corners for modern Discord-like appearance)
    document.documentElement.classList.add('tauri-app');
    document.body.classList.add('tauri-app');

    return () => {
      document.documentElement.classList.remove('tauri-app');
      document.body.classList.remove('tauri-app');
    };
  }, []);

  return (
    <DesktopContext.Provider value={{ isNativeStyled }}>
      {children}
    </DesktopContext.Provider>
  );
}
