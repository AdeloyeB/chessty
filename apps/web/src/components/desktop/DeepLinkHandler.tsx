'use client';

/**
 * DeepLinkHandler — Listens for Tauri deep links and navigates
 * ============================================================
 *
 * This component exists solely to call the useDeepLinkListener hook.
 * React hooks can only be called inside components (not at the top level
 * of a provider file), so we wrap the hook in this tiny component.
 *
 * WHY A SEPARATE COMPONENT?
 * The Providers component needs to render other components and pass
 * children through. Adding hook logic directly there would work, but
 * separating concerns makes the code cleaner and easier to test.
 *
 * MOUNT LOCATION:
 * This is rendered in Providers (apps/web/src/app/providers.tsx)
 * so it's always mounted as long as the app is running.
 *
 * RENDERS NOTHING:
 * This is a "side effect" component — it just sets up the event
 * listener and returns null (no visual output).
 */

import { useDeepLinkListener } from '@/hooks/useDeepLinkListener';

export function DeepLinkHandler() {
  // Set up the Tauri deep link event listener.
  // This hook handles all the navigation logic internally.
  useDeepLinkListener();

  // No visual output — this component is purely for side effects
  return null;
}
