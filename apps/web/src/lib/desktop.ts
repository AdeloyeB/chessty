/**
 * Desktop Abstraction Layer
 * =========================
 *
 * This file is the single place in the web app that knows about Tauri and Electron.
 * Every other file imports from here instead of touching platform APIs directly.
 *
 * WHY THIS EXISTS:
 * Our app runs in three environments:
 *   1. Tauri  - the new desktop shell (Rust-based, lightweight)
 *   2. Electron - the legacy desktop shell (Node.js-based, being phased out)
 *   3. Browser - plain web browser (dev mode / future web release)
 *
 * Each environment provides different APIs for things like secure storage
 * and opening external links. This module detects which environment we're
 * in and routes calls to the right implementation.
 *
 * HOW IT WORKS:
 * - Environment detection checks for global objects that each runtime injects.
 * - Tauri APIs are loaded with dynamic `import()` so the Tauri package is
 *   never bundled into a plain browser build (tree-shaken away if unused).
 * - Electron APIs come from `window.electronAPI`, which the Electron preload
 *   script sets up before the page loads.
 * - Browser fallbacks use standard web APIs (localStorage, window.open).
 */

// ---------------------------------------------------------------------------
// Type Declarations
// ---------------------------------------------------------------------------
// Tell TypeScript about the `electronAPI` object that Electron's preload
// script attaches to the window. The `?` makes it optional because this
// object only exists when running inside Electron.

declare global {
  interface Window {
    electronAPI?: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
        clear: () => Promise<void>;
      };
      auth: {
        openExternal: (url: string) => Promise<void>;
        onToken: (callback: (token: string) => void) => void;
      };
      platform: string;
      isElectron: boolean;
    };
  }
}

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
 * Are we running inside the legacy Electron desktop app?
 *
 * Electron's preload script sets `window.electronAPI` before any page
 * code runs. If that object exists, we're in Electron.
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

/**
 * Are we in ANY desktop environment (Tauri or Electron)?
 *
 * Useful when you need to know "is this a desktop app?" without caring
 * which one. For example, showing a desktop-only settings panel.
 */
export function isDesktop(): boolean {
  return isTauri() || isElectron();
}

/**
 * The three possible runtime environments.
 * - 'tauri'    = new Tauri desktop shell
 * - 'electron' = legacy Electron desktop shell
 * - 'browser'  = plain web browser (no desktop shell)
 */
export type Platform = 'tauri' | 'electron' | 'browser';

/**
 * Returns which platform we're running on.
 *
 * Tauri is checked first because in the future we might have both Tauri
 * internals AND an electronAPI shim during the migration period. Tauri
 * takes priority since it's the target platform.
 */
export function getPlatform(): Platform {
  if (isTauri()) return 'tauri';
  if (isElectron()) return 'electron';
  return 'browser';
}

// ---------------------------------------------------------------------------
// Secure Storage
// ---------------------------------------------------------------------------
// A unified key-value store that works the same way in all environments.
//
// WHAT EACH BACKEND ACTUALLY DOES:
//   Tauri    -> tauri-plugin-store: saves an encrypted JSON file on disk
//   Electron -> electron-store: saves an encrypted JSON file on disk
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

    if (isElectron()) {
      // The non-null assertion (!) is safe here because isElectron()
      // already confirmed electronAPI exists on window.
      return window.electronAPI!.store.get(key);
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

    if (isElectron()) {
      return window.electronAPI!.store.set(key, value);
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

    if (isElectron()) {
      return window.electronAPI!.store.delete(key);
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

    if (isElectron()) {
      return window.electronAPI!.store.clear();
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

    if (isElectron()) {
      return window.electronAPI!.auth.openExternal(url);
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
   * In Tauri, this comes as an event. In Electron, it comes via the
   * preload bridge. In the browser, OAuth is handled via normal redirects,
   * so this is a no-op.
   *
   * @param callback - Called with the token string when it arrives
   * @returns An unsubscribe function in Tauri (or void in other envs).
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
      let unlistenFn: (() => void) | null = null;

      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('auth:token', (event) => {
          callback(event.payload);
        }).then((unlisten) => {
          unlistenFn = unlisten;
        });
      });

      // Return a cleanup function that will unsubscribe when called.
      // This follows the React pattern for useEffect cleanup.
      return () => {
        if (unlistenFn) unlistenFn();
      };
    }

    if (isElectron()) {
      // Electron's preload bridge doesn't provide an unsubscribe
      // mechanism in the current API shape, so we just register.
      window.electronAPI!.auth.onToken(callback);
      return;
    }

    // Browser: OAuth tokens arrive via URL redirects, not events.
    // Nothing to listen for here — the auth page handles the redirect.
  },
};
