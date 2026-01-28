/**
 * DesktopLayout — Adjusts page layout when running in Tauri
 * ==========================================================
 *
 * When the app runs inside Tauri, we need two layout adjustments:
 *   1. Add padding-top (48px) for the custom titlebar
 *   2. Add padding-bottom (40px) for the ticker bar
 *
 * In the browser, neither bar exists, so no padding is needed.
 *
 * This component also injects a CSS class on the body that other
 * components can use to hide browser-only UI (like the default navbar)
 * when running inside Tauri.
 *
 * WHY A SEPARATE COMPONENT?
 * We can't detect Tauri at build time (the same Next.js build runs
 * in both browser and Tauri). Detection must happen at runtime in
 * the browser via `window.__TAURI_INTERNALS__`. This component
 * runs that check on mount and applies CSS classes accordingly.
 */

'use client';

import { useEffect } from 'react';
import { isTauri } from '@/lib/desktop';

export function DesktopLayout() {
  useEffect(() => {
    if (isTauri()) {
      // Add class to body so CSS can adapt layout for desktop
      // (e.g., hide browser navbar, add padding for titlebar/ticker)
      document.body.classList.add('tauri-app');
    }

    return () => {
      document.body.classList.remove('tauri-app');
    };
  }, []);

  return null; // This component only applies side effects
}
