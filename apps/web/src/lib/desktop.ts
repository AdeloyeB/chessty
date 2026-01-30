/**
 * Desktop Abstraction Layer
 * =========================
 *
 * This file provides utilities for interacting with Tauri desktop APIs.
 * This is a Tauri-only desktop app - all code runs inside Tauri's webview.
 *
 * HOW IT WORKS:
 * - Tauri APIs are loaded with dynamic `import()` to handle SSR (server-side
 *   rendering), where Tauri APIs aren't available.
 * - All functions assume Tauri is present - there are no browser fallbacks.
 */

// ---------------------------------------------------------------------------
// Secure Storage
// ---------------------------------------------------------------------------
// Uses tauri-plugin-store to save an encrypted JSON file on disk.

export const store = {
  /**
   * Read a value from storage.
   *
   * @param key - The storage key to look up
   * @returns The stored value, or null if the key doesn't exist
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('store_get', { key });
  },

  /**
   * Write a value to storage.
   *
   * @param key   - The storage key
   * @param value - Any JSON-serializable value
   */
  async set<T = unknown>(key: string, value: T): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('store_set', { key, value });
  },

  /**
   * Remove a single key from storage.
   *
   * @param key - The storage key to remove
   */
  async delete(key: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('store_delete', { key });
  },

  /**
   * Remove ALL keys from storage.
   */
  async clear(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('store_clear');
  },
};

// ---------------------------------------------------------------------------
// Overlay Window
// ---------------------------------------------------------------------------
// Opens a compact overlay window for playing chess while multitasking.
// The overlay is a small, always-on-top window showing the current game.

export const overlay = {
  /**
   * Open the overlay window for a specific game.
   *
   * @param gameId - The ID of the game to display in the overlay
   * @returns Promise that resolves when the overlay window opens
   */
  async open(gameId: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('open_overlay', { gameId });
  },

  /**
   * Close the overlay window if it's open.
   */
  async close(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('close_overlay');
  },
};

// ---------------------------------------------------------------------------
// Window Helpers
// ---------------------------------------------------------------------------
// Utilities for controlling the main application window.

export const mainWindow = {
  /**
   * Minimize the main window.
   * Useful when opening overlay mode so the user can focus on other apps.
   */
  async minimize(): Promise<void> {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const window = getCurrentWindow();
    await window.minimize();
  },
};

// ---------------------------------------------------------------------------
// Auth Helpers
// ---------------------------------------------------------------------------
// Desktop apps can't do OAuth the normal browser way (redirect back to
// localhost). Instead they:
//   1. Open the OAuth URL in the system browser
//   2. Listen for the token to come back via a custom protocol or IPC

export const auth = {
  /**
   * Open a URL in the user's default system browser.
   *
   * WHY NOT JUST USE window.open()?
   * In desktop apps, window.open() would open inside the app's webview,
   * which is bad for OAuth — the user should log in via their real browser
   * where they already have cookies/sessions. Desktop shells provide a
   * special "open in system browser" API for this.
   *
   * @param url - The full URL to open (e.g., OAuth login page)
   */
  async openExternal(url: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('auth_open_external', { url });
  },

  /**
   * Listen for an auth token coming back from the OAuth flow.
   *
   * HOW THIS WORKS:
   * After the user logs in via the system browser, the OAuth provider
   * redirects to a custom URL scheme (e.g., `chessgamble://auth?token=xyz`).
   * Tauri intercepts this and passes the token to the web app via IPC.
   *
   * @param callback - Called with the token string when it arrives
   * @returns An unsubscribe function
   */
  onToken(callback: (token: string) => void): () => void {
    // The `cancelled` flag handles a race condition in React Strict Mode:
    // If the component unmounts before the dynamic import resolves,
    // we need to immediately clean up the listener instead of storing
    // a stale unlistenFn that never gets called.
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    import('@tauri-apps/api/event').then(({ listen }) => {
      if (cancelled) return; // Already unmounted, skip setup
      listen<string>('auth:token', (event) => {
        callback(event.payload);
      }).then((unlisten) => {
        if (cancelled) {
          unlisten(); // Unmounted during setup, clean up immediately
        } else {
          unlistenFn = unlisten;
        }
      });
    });

    // Return a cleanup function that will unsubscribe when called.
    // This follows the React pattern for useEffect cleanup.
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  },
};
