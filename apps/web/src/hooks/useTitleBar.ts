/**
 * useTitleBar — Hook for desktop window controls and OS detection
 * ================================================================
 *
 * This hook gives React components the ability to control the Tauri
 * desktop window: close, minimize, maximize, and detect which OS
 * we're running on.
 *
 * WHY WE NEED THIS:
 * We disabled native window decorations (`decorations: false` in
 * tauri.conf.json) to build a custom titlebar matching our blueprint
 * aesthetic. That means the OS no longer provides close/minimize/maximize
 * buttons — we have to build them ourselves and wire them up.
 *
 * HOW IT WORKS:
 * - Uses `@tauri-apps/plugin-os` to detect macOS vs Windows vs Linux
 * - Uses `@tauri-apps/api/window` to call window control methods
 * - Tracks maximize state via the window resize event
 *
 * RACE CONDITION HANDLING:
 * Dynamic imports (`import(...)`) are asynchronous. If the component
 * unmounts before the import resolves, we'd have:
 *   1. An orphaned event listener (memory leak)
 *   2. setState calls on an unmounted component (React warning)
 *
 * We solve this with an `isMounted` flag.
 *
 * USAGE:
 *   const { osType, isMaximized, close, minimize, toggleMaximize } = useTitleBar();
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export type OSType = 'macos' | 'windows' | 'linux' | null;

export function useTitleBar() {
  const [osType, setOsType] = useState<OSType>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauriApp, setIsTauriApp] = useState(false);

  useEffect(() => {
    // Only run on client (after hydration)
    if (typeof window === 'undefined') return;

    // Check if we're actually in a Tauri app by looking for the Tauri globals
    // @ts-expect-error - __TAURI_INTERNALS__ is injected by Tauri runtime
    const inTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
    setIsTauriApp(inTauri);

    // Only run Tauri-specific setup if we're in Tauri
    if (!inTauri) return;

    // Track mount state to prevent setting state after unmount
    // and to clean up listeners if the import resolves after unmount.
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    // Detect OS using the Tauri OS plugin.
    // This tells us whether to render traffic lights (macOS, left side)
    // or rectangular buttons (Windows/Linux, right side).
    import('@tauri-apps/plugin-os').then(({ type: osType }) => {
      if (!isMounted) return;
      const os = osType();
      if (os === 'macos' || os === 'windows' || os === 'linux') {
        setOsType(os);
      }
    }).catch((err) => {
      console.error('Failed to detect OS:', err);
    });

    // Track whether the window is currently maximized.
    // We need this to toggle the maximize button icon between
    // "maximize" (□) and "restore" (⧉).
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (!isMounted) return;

      const appWindow = getCurrentWindow();

      // Get initial state
      const maximized = await appWindow.isMaximized();
      if (!isMounted) return;
      setIsMaximized(maximized);

      // Listen for resize events — the user might maximize via
      // double-clicking the titlebar or using OS keyboard shortcuts.
      const unlistenFn = await appWindow.onResized(async () => {
        if (!isMounted) return;
        const max = await appWindow.isMaximized();
        if (isMounted) setIsMaximized(max);
      });

      // If component unmounted while we were setting up the listener,
      // immediately clean it up to prevent a memory leak.
      if (!isMounted) {
        unlistenFn();
      } else {
        unlisten = unlistenFn;
      }
    }).catch((err) => {
      console.error('Failed to set up window listener:', err);
    });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  const close = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  }, []);

  const minimize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  }, []);

  const toggleMaximize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch (err) {
      console.error('Failed to toggle maximize:', err);
    }
  }, []);

  return {
    isTauriApp,
    osType,
    isMaximized,
    close,
    minimize,
    toggleMaximize,
  };
}
