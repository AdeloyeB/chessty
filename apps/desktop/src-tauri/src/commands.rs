// =============================================================================
// commands.rs — IPC Command Handlers (Tauri v2)
// =============================================================================
//
// This file defines all the "commands" that the frontend (JavaScript/TypeScript)
// can call from the Rust backend. In Tauri, this is how the two sides talk:
//
//   Frontend calls:  invoke("store_get", { key: "authToken" })
//   Rust handles:    pub async fn store_get(app, key) -> Result<...>
//
// Think of each #[tauri::command] function as an API endpoint, but instead of
// HTTP requests, the frontend sends messages through Tauri's IPC bridge.
//
// These commands replace the Electron IPC handlers from electron/main.ts:
//   ipcMain.handle('store:get', ...)   -->  store_get()
//   ipcMain.handle('store:set', ...)   -->  store_set()
//   ipcMain.handle('store:delete', ...)-->  store_delete()
//   ipcMain.handle('store:clear', ...) -->  store_clear()
//   ipcMain.handle('auth:openExternal', ...) --> auth_open_external()
// =============================================================================

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// The filename for our persistent key-value store on disk.
/// This matches the Electron store name "chess-gamble-config" so migrating
/// user data is straightforward. Tauri's store plugin saves this as a JSON
/// file in the app's data directory (e.g., ~/Library/Application Support/
/// on macOS).
const STORE_FILE: &str = "chess-gamble-config.json";

// =============================================================================
// Store Commands
// =============================================================================
// These four commands give the frontend persistent storage — data that survives
// app restarts. Under the hood, tauri-plugin-store reads/writes a JSON file.
// This replaces Electron's electron-store package.
// =============================================================================

/// Retrieve a value from the store by its key.
///
/// Returns `Ok(Some(value))` if the key exists, or `Ok(None)` if it doesn't.
/// The value is a `serde_json::Value`, which is Rust's way of representing
/// any valid JSON value (string, number, object, array, bool, or null).
///
/// Frontend usage:
///   const token = await invoke("store_get", { key: "authToken" });
#[tauri::command]
pub async fn store_get(
    app: AppHandle,
    key: String,
) -> Result<Option<Value>, String> {
    // Open (or create) the store file. The `store()` method returns a handle
    // to the JSON file — it loads it from disk the first time, then keeps it
    // in memory for fast access.
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Look up the key. `store.get()` returns Option<Value> — Some if found,
    // None if the key doesn't exist. We clone the value because the store
    // owns the original data and we need to return a copy to the frontend.
    Ok(store.get(&key))
}

/// Save a key-value pair to the store.
///
/// The value can be any JSON-compatible type — the frontend sends it as
/// a JavaScript value, and Tauri automatically converts it to
/// `serde_json::Value` on the Rust side.
///
/// Frontend usage:
///   await invoke("store_set", { key: "authToken", value: "eyJhbG..." });
///   await invoke("store_set", { key: "settings", value: { theme: "dark" } });
#[tauri::command]
pub async fn store_set(
    app: AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Insert or overwrite the key with the new value.
    // The store plugin auto-saves to disk, so we don't need to call save()
    // manually (it debounces writes to avoid thrashing the filesystem).
    store.set(key, value);

    Ok(())
}

/// Delete a single key from the store.
///
/// If the key doesn't exist, this is a no-op (no error).
///
/// Frontend usage:
///   await invoke("store_delete", { key: "authToken" });
#[tauri::command]
pub async fn store_delete(
    app: AppHandle,
    key: String,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Remove the key. Returns true if it existed, false otherwise.
    // We don't care about the return value here — deleting a non-existent
    // key is fine.
    let _ = store.delete(&key);

    Ok(())
}

/// Wipe the entire store — removes all keys and values.
///
/// This is the nuclear option. Used for things like "Log out and clear all
/// data" or resetting the app to a fresh state.
///
/// Frontend usage:
///   await invoke("store_clear");
#[tauri::command]
pub async fn store_clear(app: AppHandle) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    // Remove every key-value pair from the store.
    store.clear();

    Ok(())
}

// =============================================================================
// Auth Commands
// =============================================================================

/// Open a URL in the user's default web browser.
///
/// This is used for the OAuth login flow: the app opens the login page in
/// the system browser (Chrome, Safari, etc.), the user logs in there, and
/// the browser redirects back to the app via the `chessgamble://` deep link.
///
/// Why not open it inside the app? Because OAuth providers (Google, GitHub)
/// often block embedded browser windows for security — they want users to
/// see the real browser URL bar so they know they're on the legit login page.
///
/// This replaces Electron's `shell.openExternal(url)`.
///
/// Frontend usage:
///   await invoke("auth_open_external", { url: "https://auth.chessgamble.com/login" });
#[tauri::command]
pub async fn auth_open_external(
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    // Validate URL scheme for security — only allow http(s) for OAuth flows.
    // Without this check, a compromised frontend could trick the backend into
    // opening dangerous schemes like file://, javascript:, or custom protocols.
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Invalid URL scheme. Only https:// and http:// URLs are allowed.".to_string());
    }

    // tauri-plugin-opener provides the `open_url()` method which delegates to
    // the OS's default handler for the URL scheme. For https:// URLs, that
    // means the default web browser. This replaced the deprecated
    // tauri-plugin-shell `open()` method.
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL in browser: {}", e))?;

    Ok(())
}
