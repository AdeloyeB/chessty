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
// 3. Sets up the deep link handler — so "chkmate://" URLs open our app
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
mod engine_lifecycle;

// Anti-cheat module — client-side cheat detection (environment, input, network).
// This is part of our defense-in-depth strategy. The client collects data about:
// - Running processes (chess engines, screen sharing, automation tools)
// - Input patterns (mouse movements, timing — bot vs human detection)
// - Network activity (requests to chess analysis APIs)
//
// This data is sent to the server where it's combined with statistical move
// analysis for final cheat probability scoring. See docs/ANTI_CHEAT_PLAN.md.
mod anticheat;

use serde::Serialize;
use tauri::Emitter;
use url::Url;

// =============================================================================
// Deep Link Payload
// =============================================================================
// This struct represents the parsed data from a deep link URL.
// When the frontend receives the "deep-link-received" event, it gets this data.
//
// Example: chkmate://challenge/abc123
// - route: "challenge/abc123" (full path after the protocol)
// - link_type: "challenge" (first segment of the path)
// - id: Some("abc123") (second segment, if present)
// - token: None (query parameter, only present for auth callbacks)
#[derive(Debug, Clone, Serialize)]
struct DeepLinkPayload {
    /// The full route path after the protocol (e.g., "link/abc123")
    route: String,
    /// The type of link - first segment of the path (e.g., "link", "challenge", "auth")
    link_type: String,
    /// The ID or token from the path (second segment, if present)
    id: Option<String>,
    /// Query parameter token (used for auth callbacks)
    token: Option<String>,
}

// =============================================================================
// Deep Link Handler
// =============================================================================
// Parses a deep link URL and emits the appropriate event to the frontend.
// This function handles all deep link types:
// - chkmate://auth/callback?token=xxx  -> emits both "auth:token" (legacy) and "deep-link-received"
// - chkmate://link/{token}             -> emits "deep-link-received" for Discord linking
// - chkmate://challenge/{id}           -> emits "deep-link-received" for challenge acceptance
fn handle_deep_link(handle: &tauri::AppHandle, url: &Url) {
    // Get the path without the leading slash
    // url.path() returns "/challenge/abc123", we want "challenge/abc123"
    let path = url.path().trim_start_matches('/');

    // Split the path into segments
    // "challenge/abc123" -> ["challenge", "abc123"]
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    // Extract the link type (first segment) and ID (second segment)
    let link_type = segments.first().unwrap_or(&"").to_string();
    let id = segments.get(1).map(|s| s.to_string());

    // Extract the token from query parameters (for auth callbacks)
    let token = url
        .query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.to_string());

    // Build the payload
    let payload = DeepLinkPayload {
        route: path.to_string(),
        link_type: link_type.clone(),
        id,
        token: token.clone(),
    };

    // Emit the generic deep-link-received event for all routes
    // The frontend can listen to this single event and handle routing
    if let Err(e) = handle.emit("deep-link-received", &payload) {
        eprintln!("Failed to emit deep-link-received event: {}", e);
    }

    // For backwards compatibility: also emit "auth:token" for auth callbacks
    // This keeps existing OAuth flows working without modification
    if link_type == "auth" && token.is_some() {
        if let Err(e) = handle.emit("auth:token", token.as_ref().unwrap()) {
            eprintln!("Failed to emit auth:token event: {}", e);
        }
    }
}

// Import the LazyEngineState for on-demand Stockfish spawning.
// This replaces EngineState with a lazy-loading wrapper that:
// - Only spawns Stockfish when analysis is first requested
// - Automatically shuts down after 60 seconds of inactivity
// - Reduces idle memory from ~100MB to ~40MB
use engine_lifecycle::LazyEngineState;

// Import the AntiCheatState for anti-cheat command state management.
// This holds the MoveInputRecorder and NetworkMonitor instances.
use commands::AntiCheatState;

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

        // Deep Link plugin: Registers our app to handle "chkmate://" URLs.
        // When a user clicks a chkmate:// link (e.g., from Discord),
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
        //
        // LazyEngineState: Wraps Stockfish with lazy loading and idle shutdown.
        // Instead of spawning Stockfish at app start (consuming ~60MB even when
        // not analyzing), we spawn on-demand when the user requests analysis.
        // After 60 seconds of inactivity, Stockfish is automatically shut down
        // to free resources. This is crucial because the chess app runs alongside
        // resource-intensive apps like trading platforms.
        //
        // Resource targets:
        // - App idle:       <1% CPU, ~40MB RAM
        // - Game active:    3-8% CPU, ~60MB RAM
        // - Analysis mode:  15-30% CPU, ~150MB RAM
        // - After 60s idle: Auto-shutdown back to ~40MB
        .manage({
            let engine_state = LazyEngineState::new();
            engine_state.start_monitor(); // Start the idle shutdown monitor
            engine_state
        })
        // AntiCheatState holds the MoveInputRecorder and NetworkMonitor instances
        // for tracking input patterns and network activity during games.
        .manage(AntiCheatState::new())

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
            // Anti-cheat commands (environment scanning, input tracking, network monitoring)
            commands::scan_environment,
            commands::start_move_recording,
            commands::record_input_point,
            commands::finish_move_recording,
            commands::mark_focus_lost,
            commands::cancel_move_recording,
            commands::get_network_summary,
            commands::start_network_monitoring,
            commands::stop_network_monitoring,
            commands::analyze_network_patterns,
            commands::analyze_input_patterns_cmd,
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
            // Deep links allow external apps (like Discord) to trigger actions
            // in our app. When a user clicks a chkmate:// link, the OS routes
            // it here.
            //
            // Supported deep link routes:
            // - chkmate://auth/callback?token=xxx  - OAuth login callback
            // - chkmate://link/{token}             - Discord account linking
            // - chkmate://challenge/{id}           - Accept a challenge
            //
            // Flow:
            // 1. User clicks link in Discord (e.g., chkmate://challenge/abc123)
            // 2. OS sees "chkmate://" and sends the URL to our app
            // 3. This handler fires, parses the route and parameters
            // 4. We emit "deep-link-received" event to the frontend
            // 5. Frontend routes to the appropriate screen

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
                    // Parse the deep link and emit appropriate events
                    handle_deep_link(&handle, &url);
                }
            });

            // -- Check if app was launched via deep link ----------------------
            // If the app wasn't already running when the deep link was clicked,
            // the OS launches it with the URL. `get_current()` checks for that
            // initial URL so we don't miss the very first deep link.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_deep_link(app.handle(), &url);
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
