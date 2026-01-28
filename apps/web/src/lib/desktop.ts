/**
 * Desktop Abstraction Layer
 * =========================
 *
 * This file is the single place in the web app that knows about Tauri.
 * Every other file imports from here instead of touching platform APIs directly.
 *
 * WHY THIS EXISTS:
 * Our app runs in two environments:
 *   1. Tauri  - the desktop shell (Rust-based, lightweight)
 *   2. Browser - plain web browser (dev mode / future web release)
 *
 * Each environment provides different APIs for things like secure storage
 * and opening external links. This module detects which environment we're
 * in and routes calls to the right implementation.
 *
 * HOW IT WORKS:
 * - Environment detection checks for global objects that the runtime injects.
 * - Tauri APIs are loaded with dynamic `import()` so the Tauri package is
 *   never bundled into a plain browser build (tree-shaken away if unused).
 * - Browser fallbacks use standard web APIs (localStorage, window.open).
 */

// ---------------------------------------------------------------------------
// Environment Detection
// ---------------------------------------------------------------------------
// These functions let any component ask "where am I running?" without
// knowing the implementation details of each runtime.

/**
 * Are we running inside a Tauri desktop app?
 *
 * Tauri v2 injects a `__TAURI_INTERNALS__` object into the window at
 * startup. If it's there, we know we're in Tauri.
 *
 * NOTE: Tauri v1 used `__TAURI__` (no "INTERNALS"). We check for the
 * v2 name because this project targets Tauri v2.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Are we in a desktop environment?
 *
 * Currently this means Tauri. Useful when you need to know "is this a
 * desktop app?" For example, showing a desktop-only settings panel.
 */
export function isDesktop(): boolean {
  return isTauri();
}

/**
 * The two possible runtime environments.
 * - 'tauri'   = Tauri desktop shell
 * - 'browser' = plain web browser (no desktop shell)
 */
export type Platform = 'tauri' | 'browser';

/**
 * Returns which platform we're running on.
 */
export function getPlatform(): Platform {
  if (isTauri()) return 'tauri';
  return 'browser';
}

// ---------------------------------------------------------------------------
// Secure Storage
// ---------------------------------------------------------------------------
// A unified key-value store that works the same way in all environments.
//
// WHAT EACH BACKEND ACTUALLY DOES:
//   Tauri    -> tauri-plugin-store: saves an encrypted JSON file on disk
//   Browser  -> localStorage: plain text in the browser (NOT encrypted)
//
// The browser fallback is fine for development but should never hold
// sensitive data (private keys, etc.) in production.

export const store = {
  /**
   * Read a value from storage.
   *
   * @param key - The storage key to look up
   * @returns The stored value, or null if the key doesn't exist
   *
   * In Tauri, we call a Rust command (`store_get`) via `invoke()`.
   * `invoke()` is Tauri's way of calling Rust functions from JavaScript.
   * Think of it like a fetch() call, but instead of going to a server,
   * it goes to the Rust backend running on the same machine.
   */
  async get(key: string): Promise<any> {
    if (isTauri()) {
      // Dynamic import: only loads the Tauri module when actually running
      // in Tauri. In browser builds, this import is never reached so the
      // bundler can tree-shake it away.
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('store_get', { key });
    }

    // Browser fallback: read from localStorage and parse JSON.
    // localStorage only stores strings, so we JSON.stringify on write
    // and JSON.parse on read to support objects, arrays, numbers, etc.
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },

  /**
   * Write a value to storage.
   *
   * @param key   - The storage key
   * @param value - Any JSON-serializable value
   */
  async set(key: string, value: any): Promise<void> {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('store_set', { key, value });
    }

    // Browser fallback: serialize to JSON string for localStorage.
    localStorage.setItem(key, JSON.stringify(value));
  },

  /**
   * Remove a single key from storage.
   *
   * @param key - The storage key to remove
   */
  async delete(key: string): Promise<void> {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('store_delete', { key });
    }

    localStorage.removeItem(key);
  },

  /**
   * Remove ALL keys from storage.
   *
   * Be careful with this — in browser mode it clears the entire
   * localStorage, which might affect other apps on the same domain.
   * In desktop mode it only clears our app's store file.
   */
  async clear(): Promise<void> {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('store_clear');
    }

    localStorage.clear();
  },
};

// ---------------------------------------------------------------------------
// Auth Helpers
// ---------------------------------------------------------------------------
// Desktop apps can't do OAuth the normal browser way (redirect back to
// localhost). Instead they:
//   1. Open the OAuth URL in the system browser
//   2. Listen for the token to come back via a custom protocol or IPC
//
// This module abstracts that pattern so the auth code doesn't need to
// know which desktop shell it's running in.

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
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('auth_open_external', { url });
    }

    // Browser fallback: open in a new tab.
    // 'noopener,noreferrer' is a security best practice — it prevents
    // the new tab from accessing our window object or knowing our URL.
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  /**
   * Listen for an auth token coming back from the OAuth flow.
   *
   * HOW THIS WORKS IN DESKTOP APPS:
   * After the user logs in via the system browser, the OAuth provider
   * redirects to a custom URL scheme (e.g., `chessgame://auth?token=xyz`).
   * The desktop shell intercepts this and passes the token to the web app
   * via IPC (inter-process communication).
   *
   * In Tauri, this comes as an event. In the browser, OAuth is handled
   * via normal redirects, so this is a no-op.
   *
   * @param callback - Called with the token string when it arrives
   * @returns An unsubscribe function in Tauri (or void in browser).
   *          The Tauri return is async because the event listener setup
   *          itself is async (dynamic import).
   */
  onToken(callback: (token: string) => void): (() => void) | void {
    if (isTauri()) {
      // In Tauri, `listen()` returns a promise that resolves to an
      // "unlisten" function. We set up the listener here but don't
      // await it — the caller doesn't need to wait for the listener
      // to be ready.
      //
      // The event name 'auth:token' must match what the Rust backend
      // emits when it receives the OAuth callback.
      //
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
    }

    // Browser: OAuth tokens arrive via URL redirects, not events.
    // Nothing to listen for here — the auth page handles the redirect.
  },
};
