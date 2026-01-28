/**
 * DesktopLayout — Applies desktop-specific CSS classes
 * =====================================================
 *
 * This is a Tauri-only desktop app. This component adds CSS classes
 * that enable desktop-specific styling:
 *   1. padding-top (48px) for the custom titlebar
 *   2. padding-bottom (40px) for the ticker bar
 *   3. rounded corners for Discord-like appearance
 *
 * The classes are applied on client mount (after hydration) to avoid
 * SSR mismatches.
 */

'use client';

import { useEffect } from 'react';

export function DesktopLayout() {
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

  return null; // This component only applies side effects
}
