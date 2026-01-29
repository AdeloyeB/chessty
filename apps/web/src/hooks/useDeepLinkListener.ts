'use client';

/**
 * useDeepLinkListener — Listens for Tauri deep link events and navigates
 * ======================================================================
 *
 * WHAT ARE DEEP LINKS?
 * Deep links let external apps (like a Discord bot) open our desktop app
 * at a specific screen. For example, clicking a link like:
 *   chkmate://challenge/abc123
 * opens our app and navigates to the challenge page with ID "abc123".
 *
 * HOW IT WORKS:
 * 1. User clicks a chkmate:// link in Discord
 * 2. OS opens our Tauri app (if installed)
 * 3. Tauri's Rust backend receives the URL
 * 4. Rust emits 'deep-link-received' event to the frontend
 * 5. This hook catches that event and calls Next.js router.push()
 *
 * SUPPORTED ROUTES:
 * - chkmate://link/{token}      → /discord/link?token={token}
 * - chkmate://challenge/{id}    → /discord/challenge?id={id}
 *
 * WHY CHECK __TAURI__?
 * During development, Next.js might run in a browser (not Tauri).
 * The Tauri event API only exists inside the desktop app.
 * We check window.__TAURI__ to avoid import errors in the browser.
 *
 * RACE CONDITION HANDLING:
 * If the component unmounts before the async import finishes,
 * we'd get memory leaks or setState on unmounted components.
 * The `isMounted` flag prevents this.
 *
 * USAGE:
 * Call this hook once in a component that's always mounted (like Providers).
 * It has no return value — it's a side-effect-only hook.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The shape of the event payload sent from Rust.
 * Rust sends this when a deep link is received.
 */
interface DeepLinkPayload {
  /** The route portion of the deep link (e.g., "challenge/abc123") */
  route: string;
  /** Optional: parsed type (e.g., "challenge", "link") */
  type?: string;
  /** Optional: parsed ID from the route */
  id?: string;
}

export function useDeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    // -------------------------------------------------------------------------
    // GUARD: Only run in Tauri environment
    // -------------------------------------------------------------------------
    // typeof window === 'undefined' means we're in SSR (server-side rendering).
    // Next.js renders on the server first, where window doesn't exist.
    //
    // __TAURI__ is a global object that Tauri injects into the window.
    // If it doesn't exist, we're in a browser (not the desktop app).
    // -------------------------------------------------------------------------
    if (typeof window === 'undefined' || !('__TAURI__' in window)) {
      return;
    }

    // Track mount state to prevent:
    // 1. Setting state after unmount (React warning)
    // 2. Orphaned event listeners (memory leak)
    let isMounted = true;

    // Store the unlisten function so we can clean up on unmount
    let unlisten: (() => void) | undefined;

    /**
     * Sets up the Tauri event listener.
     * We use an async function because:
     * 1. Dynamic import() is async (required for SSR compatibility)
     * 2. The listen() function returns a Promise
     */
    const setupListener = async () => {
      try {
        // Dynamic import — only loads the Tauri API on the client
        const { listen } = await import('@tauri-apps/api/event');

        // Don't continue if component unmounted during the import
        if (!isMounted) return;

        // Listen for the 'deep-link-received' event from Rust.
        // The generic <DeepLinkPayload> tells TypeScript what shape
        // event.payload will have.
        unlisten = await listen<DeepLinkPayload>('deep-link-received', (event) => {
          // Don't process events if we're unmounting
          if (!isMounted) return;

          const { route } = event.payload;
          console.log('[DeepLink] Received route:', route);

          // -----------------------------------------------------------------
          // ROUTE PARSING
          // -----------------------------------------------------------------
          // The route comes in as "link/abc123" or "challenge/xyz789".
          // We parse the prefix to determine which page to navigate to,
          // then extract the ID/token that follows.
          // -----------------------------------------------------------------

          if (route.startsWith('link/')) {
            // Discord account linking flow
            // Route: "link/{token}" → Navigate to: /discord/link?token={token}
            const token = route.substring(5); // Remove "link/" prefix (5 chars)
            router.push(`/discord/link?token=${encodeURIComponent(token)}`);
          } else if (route.startsWith('challenge/')) {
            // Discord challenge flow
            // Route: "challenge/{id}" → Navigate to: /discord/challenge?id={id}
            const id = route.substring(10); // Remove "challenge/" prefix (10 chars)
            router.push(`/discord/challenge?id=${encodeURIComponent(id)}`);
          } else {
            // Unknown route — log for debugging
            console.warn('[DeepLink] Unknown route pattern:', route);
          }
        });

        // If component unmounted while awaiting, clean up immediately
        if (!isMounted && unlisten) {
          unlisten();
          unlisten = undefined;
        }
      } catch (error) {
        // Log errors but don't crash — deep links failing shouldn't break the app
        console.error('[DeepLink] Failed to setup listener:', error);
      }
    };

    setupListener();

    // Cleanup function — runs when the component unmounts
    return () => {
      isMounted = false;
      // Clean up the event listener to prevent memory leaks
      if (unlisten) {
        unlisten();
      }
    };
  }, [router]); // Re-run if router changes (shouldn't happen, but TypeScript wants it)
}
