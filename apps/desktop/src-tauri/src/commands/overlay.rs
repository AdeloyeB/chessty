// =============================================================================
// commands/overlay.rs — Chess Game Overlay Window Management
// =============================================================================
//
// This module handles the overlay feature — a compact, always-on-top window
// that lets users play chess while doing other things (trading, browsing).
//
// Key concepts for the developer:
//
// **Always-on-Top Window**: A window that stays above other windows. Think of
// it like a sticky note on your screen that doesn't get hidden when you click
// somewhere else. This is perfect for a chess game you want to keep an eye on.
//
// **Decorationless Window**: We hide the OS title bar (decorations: false) and
// draw our own custom UI in the frontend. This gives us full control over the
// look and feel of the overlay.
//
// **WebviewWindowBuilder**: Tauri's way to create new windows at runtime.
// Each window loads a different URL from your frontend (e.g., /overlay/{gameId}).
//
// **Window Labels**: Each Tauri window has a unique label (like an ID). We use
// "game-overlay" so we can find and manipulate this specific window later.
//
// **Opacity via Events**: Tauri v2 doesn't have a direct `set_opacity()` API.
// Instead, we save the opacity preference and emit an event to the frontend,
// which applies the opacity via CSS (e.g., adjusting the root element's opacity
// or background alpha).
//
// The commands in this file:
// - open_overlay: Create and show the overlay window for a game
// - close_overlay: Close the overlay window
// - set_overlay_opacity: Update opacity setting (frontend applies via CSS)
// - set_overlay_size: Resize the overlay (small/medium/large presets)
// - save_overlay_position: Remember where the user dragged the overlay
// - get_overlay_settings: Load saved preferences for the overlay
// - update_overlay_display: Update multiple display options at once
// =============================================================================

use crate::state::OverlaySettingsCache;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

// =============================================================================
// Constants
// =============================================================================

/// The unique identifier for the overlay window.
/// Tauri uses "labels" to track windows — think of it like a window ID.
/// We can use this to check if the overlay exists, focus it, or close it.
const OVERLAY_WINDOW_LABEL: &str = "game-overlay";

// Note: Store file and key constants moved to state/overlay_cache.rs
// Settings are now managed via the OverlaySettingsCache for better performance.

// =============================================================================
// Types
// =============================================================================

/// Overlay settings that persist between sessions.
///
/// This struct holds all the customizable options for the overlay window.
/// When the user adjusts settings, we save them to disk so they're remembered
/// next time the app launches.
///
/// # Fields
///
/// - `opacity`: How see-through the window content is (0.3 = very transparent, 1.0 = solid)
/// - `size`: The board size in pixels (200 = small, 280 = medium, 360 = large)
/// - `position_x/y`: Where the overlay is on screen (None = let OS decide)
/// - `show_clocks`: Whether to display the game clocks
/// - `show_opponent_info`: Whether to show opponent's name/rating
/// - `show_eval`: Whether to show engine evaluation bar
///
/// # Note on Opacity
///
/// In Tauri v2, there's no native `set_opacity()` API for windows.
/// The opacity value is stored here and sent to the frontend via events.
/// The frontend is responsible for applying the opacity via CSS (e.g.,
/// setting the body's opacity or using RGBA background colors).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlaySettings {
    /// Content opacity from 0.3 (very transparent) to 1.0 (fully opaque).
    /// Applied via CSS in the frontend, not native window opacity.
    /// We clamp the minimum to 0.3 so the overlay is always visible enough.
    pub opacity: f64,

    /// Board size in pixels. Presets: 200 (small), 280 (medium), 360 (large).
    /// The window height is calculated as size + padding for controls.
    pub size: u32,

    /// Saved X position on screen. None means "let the OS decide" (usually centered).
    pub position_x: Option<i32>,

    /// Saved Y position on screen. None means "let the OS decide".
    pub position_y: Option<i32>,

    /// Whether to show the game clocks in the overlay.
    pub show_clocks: bool,

    /// Whether to show opponent's name and rating.
    pub show_opponent_info: bool,

    /// Whether to show the engine evaluation bar.
    pub show_eval: bool,
}

impl Default for OverlaySettings {
    /// Default settings for a new user who hasn't customized anything.
    ///
    /// We start with medium size, 96% opacity (slight transparency), and all info visible.
    /// Position is None so the OS places the window (usually centered).
    fn default() -> Self {
        Self {
            opacity: 0.96,      // 96% opacity by default (slight transparency)
            size: 280,          // Medium size (good balance of visibility and compactness)
            position_x: None,   // Let OS decide initial position
            position_y: None,
            show_clocks: true,  // Clocks are important for timed games
            show_opponent_info: true,
            show_eval: true,    // Evaluation helps understand the position
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Calculate the window height based on board size (collapsed state).
///
/// The window needs to be taller than the board to fit all UI elements:
/// - Header with close button + opponent info + settings: 40px
/// - Opponent clock row: 32px
/// - Chessboard container with padding (p-2 = 16px): board + 16px
/// - Player clock row: 32px
/// - OverlayStats header (player name + expand button): 40px
/// - OverlayDragHandle: 28px
/// - Borders: ~4px
///
/// Total extra height = 192px (collapsed state)
///
/// This gives us accurate sizing that matches the Tailwind-based component.
fn calculate_window_height(board_size: u32) -> f64 {
    (board_size + 192) as f64
}

// Note: load_settings and save_settings removed - now using OverlaySettingsCache
// for in-memory caching with periodic auto-save to disk.

/// Emit settings update to the overlay window.
///
/// This notifies the frontend that settings have changed so it can update
/// the UI accordingly (e.g., apply new opacity via CSS).
fn emit_settings_update(app: &AppHandle, settings: &OverlaySettings) {
    // Try to emit to the overlay window specifically
    // If the window doesn't exist, this silently succeeds (no error)
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let _ = window.emit("overlay:settings-updated", settings);
    }
}

// =============================================================================
// IPC Commands
// =============================================================================

/// Open the overlay window for a specific game.
///
/// If the overlay is already open, this focuses it and updates it to show
/// the new game. This prevents multiple overlay windows from cluttering
/// the screen.
///
/// # Parameters
/// - `game_id`: The ID of the game to display in the overlay. The frontend
///   uses this to load the correct game state.
///
/// # Window Configuration
///
/// The overlay window has special properties:
/// - **always_on_top(true)**: Stays above other windows
/// - **decorations(false)**: No OS title bar (we draw our own)
/// - **resizable(false)**: Fixed size (user picks from presets)
/// - **skip_taskbar(true)**: Doesn't appear in taskbar/dock
/// - **shadow(true)**: Subtle drop shadow for depth
///
/// # Frontend URL
///
/// The window loads `/overlay?id={game_id}` from the frontend. The frontend
/// route `/overlay` reads the game ID from the query parameter and renders
/// a compact chess board view.
///
/// # Transparency and Opacity
///
/// True window transparency requires platform-specific setup. Instead, we:
/// 1. Use a solid black background (off-black from our color system)
/// 2. Let the frontend handle visual opacity via CSS
/// 3. Emit settings (including opacity) so the frontend can apply them
///
/// # Example (Frontend)
/// ```typescript
/// await invoke("open_overlay", { gameId: "abc123" });
/// ```
#[tauri::command]
pub async fn open_overlay(
    app: AppHandle,
    cache: State<'_, Arc<OverlaySettingsCache>>,
    game_id: String,
) -> Result<(), String> {
    // Get settings from in-memory cache (fast, no disk I/O)
    let settings = cache.get();

    // Check if the overlay window already exists
    // Manager trait gives us get_webview_window() to find windows by label
    if let Some(existing_window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        // Overlay already exists — update it to show the new game
        // We navigate to the new URL rather than recreating the window
        // This preserves the window's position and state

        // Build the new URL for this game (using query param for static export compatibility)
        let url = format!("/overlay?id={}", game_id);

        // Navigate the existing window to the new game
        // This is like refreshing the page but with a new URL
        existing_window
            .navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| format!("Failed to navigate overlay: {}", e))?;

        // Bring the window to the front and give it focus
        existing_window
            .set_focus()
            .map_err(|e| format!("Failed to focus overlay: {}", e))?;

        // Emit the current settings so the frontend can apply opacity, etc.
        emit_settings_update(&app, &settings);

        return Ok(());
    }

    // No existing overlay — create a new one
    // WebviewWindowBuilder is Tauri's window factory

    let window_width = settings.size as f64;
    let window_height = calculate_window_height(settings.size);

    // Start building the window with required parameters:
    // - app: The app handle (connection to the Tauri runtime)
    // - label: Unique ID for this window (OVERLAY_WINDOW_LABEL)
    // - url: The frontend route to load
    let mut builder = WebviewWindowBuilder::new(
        &app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App(format!("/overlay?id={}", game_id).into()),
    )
    // Window title (shows in taskbar if not skipped)
    .title("chkmate")
    // Window dimensions
    .inner_size(window_width, window_height)
    // Always on top — this is the key feature of an overlay!
    // The window will float above other apps
    .always_on_top(true)
    // No OS decorations (title bar, borders)
    // We'll draw our own custom UI in the frontend
    .decorations(false)
    // TRANSPARENT WINDOW — Critical for proper opacity slider behavior!
    // Without this, reducing opacity just reveals the white webview background.
    // With this, reducing opacity shows the desktop/apps behind the overlay.
    .transparent(true)
    // Fixed size — user picks from presets instead of free resizing
    // This ensures the chess board always looks good
    .resizable(false)
    // Don't show in taskbar/dock
    // The overlay is a secondary window, not the main app
    .skip_taskbar(true)
    // Shadow behind the window for depth
    .shadow(true)
    // Minimum size to prevent the window from being too small
    .min_inner_size(200.0, calculate_window_height(200))
    // Start focused so the user can interact immediately
    .focused(true)
    // Start visible
    .visible(true);

    // If the user has a saved position, restore it
    // Otherwise, let the OS decide where to place the window
    if let (Some(x), Some(y)) = (settings.position_x, settings.position_y) {
        // Position uses logical pixels (accounts for display scaling)
        builder = builder.position(x as f64, y as f64);
    } else {
        // Center the window on the primary monitor
        builder = builder.center();
    }

    // Build the window — this actually creates it
    // The .transparent(true) setting enables native window transparency.
    // Combined with CSS "background: transparent" in the overlay layout,
    // this allows the opacity slider to show through to the desktop.
    let _overlay_window = builder
        .build()
        .map_err(|e| format!("Failed to create overlay window: {}", e))?;

    // Minimize the main window so the overlay takes focus
    // This improves UX: user opens overlay to play while doing other things,
    // so the main app should get out of the way
    if let Some(main_window) = app.get_webview_window("main") {
        if let Err(e) = main_window.minimize() {
            eprintln!("[Overlay] Failed to minimize main window: {}", e);
            // Non-fatal error — overlay still works
        }
    }

    // Emit the settings so the frontend can apply opacity, show/hide elements, etc.
    // We do this after a small delay to ensure the window's webview is ready
    // to receive events. The frontend should also check settings on mount.
    emit_settings_update(&app, &settings);

    Ok(())
}

/// Close the overlay window.
///
/// This destroys the overlay window completely. The next time open_overlay
/// is called, a new window will be created.
///
/// If the overlay isn't open, this is a no-op (doesn't error).
///
/// # Example (Frontend)
/// ```typescript
/// await invoke("close_overlay");
/// ```
#[tauri::command]
pub async fn close_overlay(app: AppHandle) -> Result<(), String> {
    // Try to find the overlay window by its label
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        // Close (destroy) the window
        window
            .close()
            .map_err(|e| format!("Failed to close overlay: {}", e))?;
    }

    // Restore the main window when overlay closes.
    // This brings the main app back into focus, allowing the user to
    // continue where they left off (lobby, settings, etc.)
    if let Some(main_window) = app.get_webview_window("main") {
        // Unminimize (restore from dock/taskbar)
        if let Err(e) = main_window.unminimize() {
            eprintln!("[Overlay] Failed to unminimize main window: {}", e);
        }
        // Bring to front and focus
        if let Err(e) = main_window.set_focus() {
            eprintln!("[Overlay] Failed to focus main window: {}", e);
        }
    }

    // If window doesn't exist, that's fine — nothing to close
    Ok(())
}

/// Resize the overlay window dynamically.
///
/// Called by React when content size changes — specifically when the stats
/// panel expands or collapses. This keeps the Tauri window size in sync with
/// the React content size.
///
/// # Parameters
/// - `width`: New window width in logical pixels
/// - `height`: New window height in logical pixels
///
/// # Why This Exists
///
/// The overlay has an expandable stats panel. When collapsed, the window is
/// compact (e.g., 444px for medium board). When expanded, it needs more height
/// (e.g., 596px for medium board with stats visible).
///
/// Without this command, expanding the stats panel would clip the content
/// because the Tauri window size stays fixed.
///
/// # Example (Frontend)
/// ```typescript
/// // When stats panel expands
/// await invoke("resize_overlay", { width: 312, height: 596 });
///
/// // When stats panel collapses
/// await invoke("resize_overlay", { width: 312, height: 444 });
/// ```
#[tauri::command]
pub async fn resize_overlay(
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        // Use LogicalSize to account for display scaling (Retina, Windows DPI)
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Failed to resize overlay: {}", e))?;
    }
    Ok(())
}

/// Set the overlay window's opacity (transparency level).
///
/// # Parameters
/// - `opacity`: A value from 0.3 to 1.0
///   - 0.3 = Very see-through (can see apps behind it clearly)
///   - 1.0 = Fully opaque (solid, can't see through)
///
/// We enforce a minimum of 0.3 so the overlay is always visible enough
/// to interact with. A fully transparent overlay would be unusable!
///
/// # Implementation Note
///
/// Tauri v2 doesn't have a native `set_opacity()` window API. Instead:
/// 1. We save the opacity value to persistent storage
/// 2. We emit an "overlay:settings-updated" event to the overlay window
/// 3. The frontend listens for this event and applies opacity via CSS
///
/// The frontend should apply this using one of these approaches:
/// - Set `document.body.style.opacity` to the value
/// - Use CSS custom property: `--overlay-opacity`
/// - Adjust background colors with RGBA alpha channel
///
/// This setting is saved to disk and persists between sessions.
///
/// # Example (Frontend)
/// ```typescript
/// // Make the overlay 70% opaque
/// await invoke("set_overlay_opacity", { opacity: 0.7 });
///
/// // Frontend event listener:
/// listen("overlay:settings-updated", (event) => {
///   const settings = event.payload;
///   document.body.style.opacity = String(settings.opacity);
/// });
/// ```
#[tauri::command]
pub async fn set_overlay_opacity(
    app: AppHandle,
    cache: State<'_, Arc<OverlaySettingsCache>>,
    opacity: f64,
) -> Result<(), String> {
    // Clamp opacity to valid range: 0.3 (minimum visibility) to 1.0 (fully opaque)
    // clamp() ensures the value is within bounds even if the frontend sends garbage
    let clamped_opacity = opacity.clamp(0.3, 1.0);

    // Update in-memory cache (fast, no disk I/O)
    // The cache's auto-save task will persist to disk every 2 seconds if dirty
    cache.update(|s| s.opacity = clamped_opacity);

    // Emit update to the frontend so it can apply the opacity via CSS
    let settings = cache.get();
    emit_settings_update(&app, &settings);

    Ok(())
}

/// Set the overlay window's size.
///
/// # Parameters
/// - `size`: The board width/height in pixels. Recommended presets:
///   - 200 = Small (compact, minimal screen real estate)
///   - 280 = Medium (balanced, default)
///   - 360 = Large (easier to see, good for high-res displays)
///
/// The window height is calculated automatically to fit the board plus
/// controls (clocks, opponent info, etc.).
///
/// We enforce a minimum of 150px and maximum of 500px to keep the overlay
/// usable and reasonable.
///
/// This setting is saved to disk and persists between sessions.
///
/// # Example (Frontend)
/// ```typescript
/// // Set to large size
/// await invoke("set_overlay_size", { size: 360 });
/// ```
#[tauri::command]
pub async fn set_overlay_size(
    app: AppHandle,
    cache: State<'_, Arc<OverlaySettingsCache>>,
    size: u32,
) -> Result<(), String> {
    // Clamp size to reasonable bounds
    // Too small = can't see the pieces, too big = defeats the purpose of "compact"
    let clamped_size = size.clamp(150, 500);

    // Apply to window if it exists
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let width = clamped_size as f64;
        let height = calculate_window_height(clamped_size);

        // set_size() takes a Size struct — we're using LogicalSize which
        // accounts for display scaling (Retina displays, Windows scaling)
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Failed to set size: {}", e))?;
    }

    // Update in-memory cache (auto-saves to disk every 2 seconds if dirty)
    cache.update(|s| s.size = clamped_size);

    // Emit update to frontend
    let settings = cache.get();
    emit_settings_update(&app, &settings);

    Ok(())
}

/// Save the overlay window's position to persistent storage.
///
/// Call this when the user drags the overlay to a new position. The position
/// will be restored the next time the overlay is opened.
///
/// # Parameters
/// - `x`: The window's X coordinate (pixels from left edge of screen)
/// - `y`: The window's Y coordinate (pixels from top edge of screen)
///
/// # Note on Coordinates
///
/// Screen coordinates can vary between displays and display arrangements.
/// If the user has multiple monitors and changes their setup, the saved
/// position might be off-screen. The OS usually handles this gracefully
/// by moving the window to a visible area.
///
/// # Example (Frontend)
/// ```typescript
/// // The frontend should call this when dragging ends
/// // Using Tauri's window API to get the current position:
/// import { getCurrentWindow } from '@tauri-apps/api/window';
///
/// const window = getCurrentWindow();
/// const position = await window.outerPosition();
/// await invoke("save_overlay_position", { x: position.x, y: position.y });
/// ```
#[tauri::command]
pub async fn save_overlay_position(
    cache: State<'_, Arc<OverlaySettingsCache>>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // Update position in cache (auto-saves to disk every 2 seconds if dirty)
    cache.update(|s| {
        s.position_x = Some(x);
        s.position_y = Some(y);
    });

    Ok(())
}

/// Get the current overlay settings.
///
/// Returns all saved overlay preferences. The frontend can use this to:
/// - Initialize UI controls (opacity slider, size selector)
/// - Apply settings when the overlay component mounts
/// - Check current state before making changes
///
/// If no settings have been saved yet, returns sensible defaults.
///
/// # Returns
/// An `OverlaySettings` struct with all current preferences.
///
/// # Example (Frontend)
/// ```typescript
/// const settings = await invoke<OverlaySettings>("get_overlay_settings");
/// console.log(`Current opacity: ${settings.opacity}`);
/// console.log(`Current size: ${settings.size}`);
///
/// // Apply opacity on mount
/// document.body.style.opacity = String(settings.opacity);
/// ```
#[tauri::command]
pub async fn get_overlay_settings(
    cache: State<'_, Arc<OverlaySettingsCache>>,
) -> Result<OverlaySettings, String> {
    // Fast in-memory read (no disk I/O)
    Ok(cache.get())
}

// =============================================================================
// Additional Utility Commands
// =============================================================================

/// Update multiple overlay display options at once.
///
/// This is a convenience command that lets the frontend update multiple
/// settings in a single call, rather than making separate calls for each.
///
/// # Parameters (all optional)
/// - `show_clocks`: Whether to display game clocks
/// - `show_opponent_info`: Whether to show opponent name/rating
/// - `show_eval`: Whether to show engine evaluation bar
///
/// Only the provided fields are updated; others keep their current values.
///
/// The updated settings are emitted to the overlay window so the frontend
/// can react immediately.
///
/// # Example (Frontend)
/// ```typescript
/// // Hide the evaluation bar but keep other settings
/// await invoke("update_overlay_display", { showEval: false });
///
/// // Listen for updates
/// listen("overlay:settings-updated", (event) => {
///   const settings = event.payload;
///   setShowEval(settings.show_eval);
///   setShowClocks(settings.show_clocks);
/// });
/// ```
#[tauri::command]
pub async fn update_overlay_display(
    app: AppHandle,
    cache: State<'_, Arc<OverlaySettingsCache>>,
    show_clocks: Option<bool>,
    show_opponent_info: Option<bool>,
    show_eval: Option<bool>,
) -> Result<OverlaySettings, String> {
    // Update only the provided fields in the cache
    cache.update(|s| {
        if let Some(clocks) = show_clocks {
            s.show_clocks = clocks;
        }
        if let Some(opponent) = show_opponent_info {
            s.show_opponent_info = opponent;
        }
        if let Some(eval) = show_eval {
            s.show_eval = eval;
        }
    });

    // Get the updated settings
    let settings = cache.get();

    // Emit update to frontend
    emit_settings_update(&app, &settings);

    // Return the updated settings so the frontend can confirm the changes
    Ok(settings)
}
