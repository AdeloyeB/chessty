// =============================================================================
// plugins/mod.rs — Native Platform Plugins
// =============================================================================
//
// This module houses platform-specific plugins that enhance the app with
// native OS features. Each plugin is conditionally compiled for its target
// platform only.
//
// Current plugins:
// - mac_rounded_corners: Native macOS window styling (rounded corners, traffic lights)
//
// CROSS-PLATFORM STRATEGY
// =======================
// Tauri's invoke_handler! macro doesn't support conditional compilation inside
// it. So we expose the same command signatures on all platforms, but:
// - On macOS: Commands call native Cocoa APIs for real functionality
// - On Windows/Linux: Commands are no-ops that return Ok(()) immediately
//
// This lets the frontend call the same commands without platform checks.
// =============================================================================

// macOS: Real implementation using Cocoa framework
#[cfg(target_os = "macos")]
mod mac_rounded_corners;

#[cfg(target_os = "macos")]
pub use mac_rounded_corners::*;

// Non-macOS: No-op stubs that match the macOS function signatures
// These allow the frontend to call the same commands without errors
#[cfg(not(target_os = "macos"))]
mod mac_rounded_corners_stub {
    use tauri::WebviewWindow;

    /// No-op on non-macOS platforms
    #[tauri::command]
    pub async fn enable_modern_window_style(
        _window: WebviewWindow,
        _corner_radius: Option<f64>,
        _offset_x: Option<f64>,
        _offset_y: Option<f64>,
    ) -> Result<(), String> {
        // No-op on Windows/Linux
        Ok(())
    }

    /// No-op on non-macOS platforms
    #[tauri::command]
    pub async fn enable_rounded_corners(
        _window: WebviewWindow,
        _offset_x: Option<f64>,
        _offset_y: Option<f64>,
    ) -> Result<(), String> {
        // No-op on Windows/Linux
        Ok(())
    }

    /// No-op on non-macOS platforms
    #[tauri::command]
    pub async fn reposition_traffic_lights(_window: WebviewWindow) -> Result<(), String> {
        // No-op on Windows/Linux
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
pub use mac_rounded_corners_stub::*;
