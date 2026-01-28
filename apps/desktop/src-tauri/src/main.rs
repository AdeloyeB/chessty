// =============================================================================
// main.rs — Tauri v2 Application Entry Point
// =============================================================================
//
// This is where the desktop app starts. Think of it like the "main()" in any
// program — it sets up everything the app needs, then starts running.
//
// What this file does:
// 1. Registers plugins (store, shell, deep-link) — these add capabilities
// 2. Registers IPC commands — so the frontend can call Rust functions
// 3. Sets up the deep link handler — so "chessgamble://" URLs open our app
// 4. Launches the app window
//
// This replaces Electron's `electron/main.ts` entry point.
// =============================================================================

// Prevents a console window from appearing alongside the app on Windows
// in release builds. Debug builds still show the console for logging.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Pull in our modules (each is a separate .rs file in this directory).
// `mod` tells Rust: "there's another file called X.rs — include it."
mod commands;
mod engine;

use tauri::Emitter;

// Import the EngineState so we can register it with Tauri's state management.
// This allows our engine commands to access the Stockfish instance.
use engine::EngineState;

fn main() {
    tauri::Builder::default()
        // =====================================================================
        // Plugin Registration
        // =====================================================================
        // Plugins add features to Tauri. Each `.plugin()` call is like
        // installing an extension. Order matters for some plugins.
        //

        // Store plugin: Persistent key-value storage (replaces electron-store).
        // This saves data to a JSON file on disk so it survives app restarts.
        // Our commands.rs uses this to implement store_get, store_set, etc.
        .plugin(tauri_plugin_store::Builder::new().build())

        // Opener plugin: Lets us open URLs in the system browser.
        // Used by auth_open_external to launch the OAuth login page.
        // (Replaces the deprecated tauri-plugin-shell for URL opening.)
        .plugin(tauri_plugin_opener::init())

        // OS plugin: Lets the frontend detect which operating system we're on.
        // The custom titlebar uses this to render macOS-style traffic lights
        // (left-aligned) or Windows/Linux-style controls (right-aligned).
        .plugin(tauri_plugin_os::init())

        // Deep Link plugin: Registers our app to handle "chessgamble://" URLs.
        // When a user clicks a chessgamble:// link (e.g., after OAuth login),
        // the OS routes it to our app instead of the browser.
        .plugin(tauri_plugin_deep_link::init())

        // Shell plugin: Allows spawning sidecars (external binaries bundled with the app).
        // We use this to run the Stockfish chess engine binary for move analysis.
        // The sidecar is configured in tauri.conf.json under bundle.externalBin.
        .plugin(tauri_plugin_shell::init())

        // =====================================================================
        // State Management
        // =====================================================================
        // Tauri's state management lets us share data between commands.
        // The EngineState holds our Stockfish instance, wrapped in Arc<Mutex<>>
        // for thread-safe access. Commands can access it via State<'_, EngineState>.
        .manage(EngineState::new())

        // =====================================================================
        // IPC Command Registration
        // =====================================================================
        // This tells Tauri which Rust functions the frontend is allowed to call.
        // Each function listed here becomes available via `invoke("name", ...)`
        // in JavaScript/TypeScript.
        //
        // Without listing a command here, the frontend can't call it — this is
        // a security feature (explicit allowlist).
        .invoke_handler(tauri::generate_handler![
            // Store commands (persistent key-value storage)
            commands::store_get,
            commands::store_set,
            commands::store_delete,
            commands::store_clear,
            // Auth commands (OAuth flow)
            commands::auth_open_external,
            // Engine commands (Stockfish chess analysis)
            commands::init_engine,
            commands::analyze_position,
            commands::analyze_game,
            commands::stop_analysis,
            commands::get_engine_info,
            // Cancellable analysis commands (async with event-based results)
            commands::analyze_position_async,
            commands::analyze_game_async,
            commands::cancel_analysis,
        ])

        // =====================================================================
        // App Setup (runs once at startup)
        // =====================================================================
        // The `.setup()` closure runs after the app window is created but
        // before the frontend loads. This is where we wire up event listeners
        // and do one-time initialization.
        .setup(|app| {
            // -- Deep Link Registration (Linux & Windows debug) ---------------
            // On macOS, deep links are registered via Info.plist (handled by
            // Tauri's build config). On Linux and Windows debug builds, we
            // need to register them at runtime.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            // -- Deep Link Event Handler --------------------------------------
            // This is the OAuth callback flow:
            //
            // 1. User clicks "Login" in the app
            // 2. App opens browser to auth provider (Google, GitHub, etc.)
            // 3. User logs in on the web
            // 4. Auth provider redirects to: chessgamble://auth/callback?token=xxx
            // 5. OS sees "chessgamble://" and sends the URL to our app
            // 6. This handler fires, extracts the token from the URL
            // 7. We emit "auth:token" event to the frontend with the token
            // 8. Frontend receives the token and logs the user in
            //
            // This replaces Electron's `app.on('open-url', ...)` handler
            // and the `handleDeepLink()` function from electron/main.ts.

            // Clone the app handle so we can use it inside the closure.
            // In Rust, closures "capture" variables from their environment.
            // Since this closure will outlive the setup function, we need to
            // give it its own copy (clone) of the handle.
            let handle = app.handle().clone();

            // Register the deep link listener using the DeepLinkExt trait.
            // This trait is provided by tauri-plugin-deep-link and adds the
            // `deep_link()` method to the App type.
            use tauri_plugin_deep_link::DeepLinkExt;
            app.deep_link().on_open_url(move |event| {
                // `event.urls()` returns all URLs that triggered this event.
                // Usually there's just one, but we loop to be safe.
                for url in event.urls() {
                    // We only care about the auth callback path.
                    // Example URL: chessgamble://auth/callback?token=eyJhbGciOi...
                    //
                    // `url.path()` returns "/auth/callback"
                    // `url.query_pairs()` returns the ?key=value parameters
                    if url.path().starts_with("/auth/callback") {
                        // Look through the query parameters for "token"
                        // `query_pairs()` returns an iterator of (key, value) pairs.
                        // `find()` stops at the first match.
                        let token = url
                            .query_pairs()
                            .find(|(key, _)| key == "token")
                            .map(|(_, value)| value.to_string());

                        if let Some(token) = token {
                            // Emit the "auth:token" event to the frontend.
                            // This is like Electron's:
                            //   mainWindow.webContents.send('auth:token', token)
                            //
                            // Any frontend listener registered with:
                            //   listen("auth:token", (event) => { ... })
                            // will receive this event with the token as payload.
                            if let Err(e) = handle.emit("auth:token", &token) {
                                eprintln!("Failed to emit auth:token event: {}", e);
                            }
                        }
                    }
                }
            });

            // -- Check if app was launched via deep link ----------------------
            // If the app wasn't already running when the deep link was clicked,
            // the OS launches it with the URL. `get_current()` checks for that
            // initial URL so we don't miss the very first auth callback.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                let startup_handle = app.handle().clone();
                for url in urls {
                    if url.path().starts_with("/auth/callback") {
                        let token = url
                            .query_pairs()
                            .find(|(key, _)| key == "token")
                            .map(|(_, value)| value.to_string());

                        if let Some(token) = token {
                            if let Err(e) = startup_handle.emit("auth:token", &token) {
                                eprintln!(
                                    "Failed to emit auth:token on startup: {}",
                                    e
                                );
                            }
                        }
                    }
                }
            }

            Ok(())
        })

        // =====================================================================
        // Run the App
        // =====================================================================
        // `generate_context!()` reads tauri.conf.json at compile time to know
        // things like the app name, window size, and which URL to load.
        // `.expect(...)` crashes with this message if something goes wrong —
        // there's no recovering from a failed app launch.
        .run(tauri::generate_context!())
        .expect("error while running the chess gamble desktop application");
}
