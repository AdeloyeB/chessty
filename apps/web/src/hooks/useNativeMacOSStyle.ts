/**
 * useNativeMacOSStyle — Hook for native macOS window styling
 * ===========================================================
 *
 * This hook enables native macOS window features when running in Tauri:
 *   - Rounded corners (Big Sur+ style)
 *   - Native traffic light buttons (close/minimize/zoom)
 *   - Transparent titlebar with content underneath
 *
 * On Windows/Linux, this is a no-op that returns { isNativeStyled: false }.
 * The Rust commands exist as stubs on those platforms, so calling them is safe.
 *
 * HOW IT WORKS:
 * 1. Calls our Rust `enable_modern_window_style` command via Tauri invoke
 * 2. The Rust code uses Cocoa APIs to modify the NSWindow
 * 3. Traffic lights appear at the specified offset position
 * 4. Returns state so components can hide custom React traffic lights
 *
 * USAGE:
 *   // In main window (with 48px titlebar)
 *   const { isNativeStyled } = useNativeMacOSStyle({ offsetX: -8, offsetY: 4 });
 *
 *   // In overlay (with tighter header)
 *   const { isNativeStyled } = useNativeMacOSStyle({ cornerRadius: 12, offsetX: -8, offsetY: 4 });
 *
 * The hook automatically cleans up resize listeners on unmount.
 *
 * NOTE: This hook directly invokes our Rust commands instead of using the
 * @cloudworxx/tauri-plugin-mac-rounded-corners package, giving us full control.
 */

'use client';

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeMacOSStyleConfig {
  /**
   * Corner radius in pixels. Defaults to 12 (macOS Big Sur+ standard).
   * Only affects the content clipping mask, not the actual window shape.
   */
  cornerRadius?: number;

  /**
   * Horizontal offset for traffic light buttons from their default position.
   * Positive = move right, Negative = move left.
   * Default position is about 20px from the left edge.
   */
  offsetX?: number;

  /**
   * Vertical offset for traffic light buttons from their default position.
   * Positive = move down, Negative = move up.
   * Useful for custom titlebars of different heights.
   */
  offsetY?: number;
}

export interface UseNativeMacOSStyleReturn {
  /**
   * Whether native macOS styling was successfully applied.
   * Use this to conditionally hide custom React traffic light components.
   * Always false on Windows/Linux.
   */
  isNativeStyled: boolean;

  /**
   * Whether we're currently waiting for the styling to be applied.
   * Useful for avoiding UI flicker during the async setup.
   */
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useNativeMacOSStyle(
  config: NativeMacOSStyleConfig = {}
): UseNativeMacOSStyleReturn {
  const [isNativeStyled, setIsNativeStyled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Track whether we've already styled this window to avoid redundant calls
  const hasStyledRef = useRef(false);

  const { cornerRadius = 12, offsetX = 0, offsetY = 0 } = config;

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    // Skip if already styled (prevents redundant Cocoa API calls)
    if (hasStyledRef.current) {
      return;
    }

    let mounted = true;
    let cleanup: (() => void) | null = null;

    async function enableNativeStyle() {
      try {
        // First, check if we're on macOS by detecting OS type
        const { type: getOsType } = await import('@tauri-apps/plugin-os');
        const osType = getOsType();

        // Skip on non-macOS platforms (the Rust commands are no-ops anyway,
        // but we can save the IPC overhead)
        if (osType !== 'macos') {
          if (mounted) {
            setIsNativeStyled(false);
            setIsLoading(false);
          }
          return;
        }

        // Call our Rust command to enable modern window styling
        // This modifies the NSWindow via Cocoa APIs
        const { invoke } = await import('@tauri-apps/api/core');

        await invoke('enable_modern_window_style', {
          cornerRadius,
          offsetX,
          offsetY,
        });

        // Mark as styled to prevent redundant calls
        hasStyledRef.current = true;

        if (mounted) {
          setIsNativeStyled(true);
          setIsLoading(false);
          console.debug('[NativeStyle] macOS styling enabled', { cornerRadius, offsetX, offsetY });
        }

        // Set up resize listener for fullscreen exit repositioning
        // When exiting fullscreen, traffic lights may need repositioning
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        const unlistenResize = await appWindow.onResized(async () => {
          if (!mounted) return;
          // Re-apply traffic light positioning after resize/fullscreen changes
          try {
            await invoke('reposition_traffic_lights', {
              offsetX,
              offsetY,
            });
          } catch (err) {
            console.debug('[NativeStyle] Traffic light reposition failed:', err);
          }
        });

        if (!mounted) {
          // If we unmounted during setup, clean up immediately
          unlistenResize();
        } else {
          cleanup = unlistenResize;
        }
      } catch (error) {
        // Not in Tauri context (dev browser) or non-macOS platform
        console.debug('[NativeStyle] Native styling not available:', error);
        if (mounted) {
          setIsNativeStyled(false);
          setIsLoading(false);
        }
      }
    }

    enableNativeStyle();

    return () => {
      mounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [cornerRadius, offsetX, offsetY]);

  return {
    isNativeStyled,
    isLoading,
  };
}

export default useNativeMacOSStyle;
