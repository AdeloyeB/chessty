// =============================================================================
// plugins/mac_rounded_corners.rs — Native macOS Window Styling
// =============================================================================
//
// This module provides native macOS window styling features:
// - Rounded corners (like native macOS apps)
// - Traffic light button repositioning (close/minimize/maximize)
// - Native shadows and layer clipping
//
// HOW IT WORKS
// ============
// macOS windows are backed by NSWindow objects from Apple's Cocoa framework.
// Tauri creates these windows for us, but by default they have square corners.
// This module accesses the underlying NSWindow and configures it to:
// 1. Clip content to a rounded mask (contentView.layer.cornerRadius)
// 2. Show native traffic lights (styleMask with titledMask)
// 3. Make the titlebar transparent (titlebarAppearsTransparent)
//
// WHY USE NATIVE APIs?
// ====================
// - App Store compatible: Uses only public Cocoa APIs (no private APIs)
// - Native behavior: Traffic lights behave exactly like native apps
// - Performance: No CSS hacks or workarounds
// - Automatic handling: Fullscreen exit repositions buttons correctly
//
// SAFETY NOTES
// ============
// - These APIs are macOS-only; this module is conditionally compiled
// - The objc crate provides safe-ish bindings but involves unsafe blocks
// - Window handles are obtained from Tauri's webview and must be valid
//
// USAGE
// =====
// From TypeScript:
//   await invoke('enable_modern_window_style', { cornerRadius: 12, offsetX: 8, offsetY: 8 });
//
// =============================================================================

// Suppress warnings from deprecated Cocoa APIs and unexpected cfg
#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use cocoa::appkit::{NSView, NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
use cocoa::base::id;
use cocoa::foundation::NSPoint;
use objc::{msg_send, sel, sel_impl};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::WebviewWindow;

// =============================================================================
// Window Styling State Cache
// =============================================================================
// Track which windows have already been styled to avoid redundant Cocoa API calls.
// Using a lazy static with Mutex because window labels can vary.

lazy_static::lazy_static! {
    /// Tracks which windows have been styled (keyed by window label).
    /// This prevents redundant Cocoa API calls when React components re-render.
    static ref STYLED_WINDOWS: Mutex<HashMap<String, bool>> = Mutex::new(HashMap::new());
}

/// Check if a window has already been styled.
fn is_window_styled(label: &str) -> bool {
    STYLED_WINDOWS
        .lock()
        .map(|map| map.get(label).copied().unwrap_or(false))
        .unwrap_or(false)
}

/// Mark a window as styled.
fn mark_window_styled(label: &str) {
    if let Ok(mut map) = STYLED_WINDOWS.lock() {
        map.insert(label.to_string(), true);
    }
}

/// Clear styling state for a window (call on window close).
#[allow(dead_code)]
fn clear_window_style(label: &str) {
    if let Ok(mut map) = STYLED_WINDOWS.lock() {
        map.remove(label);
    }
}

// =============================================================================
// Traffic Lights Configuration
// =============================================================================

/// Configuration for positioning the traffic light buttons.
///
/// The traffic lights (close, minimize, zoom) are the iconic macOS window
/// controls. By default, they appear at the top-left of the window. We can
/// adjust their position to fit our custom titlebar design.
struct TrafficLightsConfig {
    /// Horizontal offset in pixels from the default position.
    /// Positive = move right, Negative = move left.
    offset_x: f64,

    /// Vertical offset in pixels from the default position.
    /// Positive = move down, Negative = move up.
    offset_y: f64,
}

impl Default for TrafficLightsConfig {
    fn default() -> Self {
        Self {
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

// =============================================================================
// Tauri IPC Commands
// =============================================================================

/// Enable modern window style with rounded corners, shadows, and traffic lights.
///
/// This is the recommended command for achieving native macOS appearance.
/// It combines rounded corners with proper shadow rendering and traffic light
/// positioning.
///
/// # Parameters
/// - `corner_radius`: The radius for rounded corners (default: 12px, matching macOS Big Sur+)
/// - `offset_x`: Horizontal offset for traffic light buttons from left edge
/// - `offset_y`: Vertical offset for traffic light buttons from top edge
///
/// # Example (TypeScript)
/// ```typescript
/// await invoke('enable_modern_window_style', {
///   cornerRadius: 12,
///   offsetX: 12,
///   offsetY: 12
/// });
/// ```
#[tauri::command]
pub fn enable_modern_window_style(
    window: WebviewWindow,
    corner_radius: Option<f64>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let label = window.label().to_string();

    // Early exit if this window is already styled (prevents redundant Cocoa calls)
    if is_window_styled(&label) {
        println!(
            "[MacRoundedCorners] Window '{}' already styled, skipping",
            label
        );
        return Ok(());
    }

    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };
    let radius = corner_radius.unwrap_or(12.0);

    // Use with_webview to access the underlying platform webview.
    // This is the safe Tauri way to get the NSWindow handle.
    window
        .with_webview(move |webview| {
            unsafe {
                // Get the NSWindow from the webview's platform-specific method.
                // The ns_window() method is only available on macOS webviews.
                let ns_window = webview.ns_window() as id;

                // BATCH ALL COCOA CALLS IN SINGLE UNSAFE BLOCK
                // This minimizes Objective-C runtime overhead by keeping
                // all operations in one context.

                // STEP 1: Configure window style mask
                // -----------------------------------
                // NSWindowStyleMask controls the window's appearance and behavior.
                let mut style_mask = ns_window.styleMask();

                // Add required styles for rounded corners and traffic lights:
                // - NSTitledWindowMask: Gives us the traffic light buttons
                // - NSFullSizeContentViewWindowMask: Content extends under titlebar
                // - NSClosableWindowMask: Close button works
                // - NSMiniaturizableWindowMask: Minimize button works
                style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
                style_mask |= NSWindowStyleMask::NSTitledWindowMask;
                style_mask |= NSWindowStyleMask::NSClosableWindowMask;
                style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;

                ns_window.setStyleMask_(style_mask);

                // STEP 2: Configure titlebar appearance
                // -------------------------------------
                // Make the titlebar transparent so our custom content shows through.
                ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);
                ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);

                // STEP 3: Enable shadow and disable opaque (for transparency)
                // -----------------------------------------------------------
                ns_window.setHasShadow_(cocoa::base::YES);
                ns_window.setOpaque_(cocoa::base::NO);

                // STEP 4: Configure content view for rounded corners
                // -------------------------------------------------
                let content_view = ns_window.contentView();
                content_view.setWantsLayer(cocoa::base::YES);

                // Get the layer and set corner radius
                let layer: id = msg_send![content_view, layer];
                if !layer.is_null() {
                    let _: () = msg_send![layer, setCornerRadius: radius];
                    let _: () = msg_send![layer, setMasksToBounds: cocoa::base::YES];
                }

                // STEP 5: Position traffic lights
                // -------------------------------
                position_traffic_lights(ns_window, config.offset_x, config.offset_y);
            }
        })
        .map_err(|e| e.to_string())?;

    // Mark this window as styled to prevent redundant calls
    mark_window_styled(&label);
    println!("[MacRoundedCorners] Window '{}' styled successfully", label);

    Ok(())
}

/// Enable rounded corners without the full modern styling.
///
/// This is a simpler version that just adds rounded corners without
/// the layer clipping for corner radius. Use this if you want
/// more control over the window appearance.
///
/// # Parameters
/// - `offset_x`: Horizontal offset for traffic light buttons
/// - `offset_y`: Vertical offset for traffic light buttons
#[tauri::command]
pub fn enable_rounded_corners(
    window: WebviewWindow,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };

    window
        .with_webview(move |webview| {
            unsafe {
                let ns_window = webview.ns_window() as id;

                // Add titled style to get traffic lights
                let mut style_mask = ns_window.styleMask();

                style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
                style_mask |= NSWindowStyleMask::NSTitledWindowMask;
                style_mask |= NSWindowStyleMask::NSClosableWindowMask;
                style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;

                ns_window.setStyleMask_(style_mask);
                ns_window.setTitlebarAppearsTransparent_(cocoa::base::YES);

                let content_view = ns_window.contentView();
                content_view.setWantsLayer(cocoa::base::YES);

                // Position traffic lights
                position_traffic_lights(ns_window, config.offset_x, config.offset_y);
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Manually trigger traffic light repositioning.
///
/// Call this after window state changes that might affect button positions.
/// The fullscreen observer handles most cases automatically, but you can
/// use this for manual control.
#[tauri::command]
pub fn reposition_traffic_lights(
    window: WebviewWindow,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Result<(), String> {
    let config = TrafficLightsConfig {
        offset_x: offset_x.unwrap_or(0.0),
        offset_y: offset_y.unwrap_or(0.0),
    };

    window
        .with_webview(move |webview| {
            unsafe {
                let ns_window = webview.ns_window() as id;
                position_traffic_lights(ns_window, config.offset_x, config.offset_y);
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

// =============================================================================
// Internal Helper Functions
// =============================================================================

/// Internal function to position the traffic light buttons.
///
/// The traffic lights (close, minimize, zoom) are child views of the
/// window's titlebar. We find each button and adjust its frame origin
/// to achieve our desired positioning.
unsafe fn position_traffic_lights(ns_window: id, offset_x: f64, offset_y: f64) {
    // Default position from which we apply offsets
    let default_x = 20.0;
    let default_y = 0.0;

    // Get the standardWindowButton views for close, minimize, zoom
    // Button indices: 0 = Close, 1 = Miniaturize, 2 = Zoom
    let close_button: id = msg_send![ns_window, standardWindowButton: 0];
    let miniaturize_button: id = msg_send![ns_window, standardWindowButton: 1];
    let zoom_button: id = msg_send![ns_window, standardWindowButton: 2];

    // Calculate new positions with offsets
    let new_x = default_x + offset_x;
    let new_y = default_y - offset_y;

    // Position close button
    if !close_button.is_null() {
        let frame: cocoa::foundation::NSRect = msg_send![close_button, frame];
        let new_frame =
            cocoa::foundation::NSRect::new(NSPoint::new(new_x, new_y), frame.size);
        let _: () = msg_send![close_button, setFrame: new_frame];
    }

    // Position miniaturize (minimize) button (20px to the right of close)
    if !miniaturize_button.is_null() {
        let frame: cocoa::foundation::NSRect = msg_send![miniaturize_button, frame];
        let new_frame =
            cocoa::foundation::NSRect::new(NSPoint::new(new_x + 20.0, new_y), frame.size);
        let _: () = msg_send![miniaturize_button, setFrame: new_frame];
    }

    // Position zoom button (40px to the right of close)
    if !zoom_button.is_null() {
        let frame: cocoa::foundation::NSRect = msg_send![zoom_button, frame];
        let new_frame =
            cocoa::foundation::NSRect::new(NSPoint::new(new_x + 40.0, new_y), frame.size);
        let _: () = msg_send![zoom_button, setFrame: new_frame];
    }
}
