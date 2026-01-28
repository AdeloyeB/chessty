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
 * - Detects if we're in Tauri using `__TAURI_INTERNALS__`
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
 * We solve this with an `isMounted` flag — a pattern from the existing
 * `auth.onToken()` implementation in desktop.ts (see the `cancelled`
 * flag there for the same approach).
 *
 * USAGE:
 *   const { osType, isMaximized, close, minimize, toggleMaximize } = useTitleBar();
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { isTauri } from '@/lib/desktop';

export type OSType = 'macos' | 'windows' | 'linux' | null;

export function useTitleBar() {
  const [osType, setOsType] = useState<OSType>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauriApp, setIsTauriApp] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    setIsTauriApp(true);

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

  // Window control callbacks use isTauri() directly (not the state variable)
  // to avoid a timing issue: isTauriApp state is set asynchronously in the
  // useEffect, so if the user clicks a button before the effect runs,
  // the callback would silently fail. isTauri() is synchronous and immediate.
  const close = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  }, []);

  const minimize = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  }, []);

  const toggleMaximize = useCallback(async () => {
    if (!isTauri()) return;
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
