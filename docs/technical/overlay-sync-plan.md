# Overlay Window Sync Plan

## Problem Statement

The Tauri overlay window and React frontend are out of sync in two critical ways:

### Issue 1: Transparency Mismatch
- **Symptom**: When user adjusts opacity slider, content fades but reveals WHITE background
- **Root Cause**: Overlay window created without `.transparent(true)` in Rust
- **Effect**: Webview has solid white background, CSS opacity just fades to white

### Issue 2: Size Mismatch
- **Symptom**: Stats panel expands but content is clipped (Tauri window doesn't grow)
- **Root Cause**: Window size is static (calculated once at creation)
- **Effect**: React content overflows the fixed Tauri window bounds

---

## Solution Architecture

### Principle: Rust is the Source of Truth

The Tauri window controls the actual viewport. React must communicate size/state changes to Rust, which then resizes the native window. This is a **command-based sync pattern**:

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT FRONTEND                            │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ useOverlay  │───▶│ Settings    │───▶│ invoke()    │     │
│  │ Settings    │    │ Change      │    │ to Rust     │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                               │              │
└───────────────────────────────────────────────┼──────────────┘
                                                │ IPC
┌───────────────────────────────────────────────▼──────────────┐
│                    RUST BACKEND                               │
│                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ Receive     │───▶│ Calculate   │───▶│ Apply to    │      │
│  │ Command     │    │ New Size    │    │ NSWindow    │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Fix Transparency (Critical)

### 1.1 Enable Native Window Transparency

**File**: `apps/desktop/src-tauri/src/commands/overlay.rs`

Add `.transparent(true)` to the WebviewWindowBuilder:

```rust
let mut builder = WebviewWindowBuilder::new(...)
    .transparent(true)  // <-- ADD THIS
    .always_on_top(true)
    .decorations(false)
    // ...
```

### 1.2 Set Webview Background to Transparent

On macOS, the webview content area also needs transparent background. Add after window creation:

```rust
#[cfg(target_os = "macos")]
{
    overlay_window.with_webview(|webview| {
        unsafe {
            use cocoa::base::id;
            use cocoa::appkit::NSColor;
            use objc::{msg_send, sel, sel_impl};

            let ns_window = webview.ns_window() as id;
            // Set window background to clear
            let clear_color: id = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![ns_window, setBackgroundColor: clear_color];
        }
    })?;
}
```

### 1.3 CSS Transparency

The overlay layout already has transparent background. Verify:

```css
html.overlay-window,
html.overlay-window body {
  background: transparent !important;
}
```

### 1.4 Remove Native Traffic Lights

Since we want a simple, cross-platform close button:
- Remove the `#[cfg(target_os = "macos")]` block that adds native styling
- Keep `decorations: false`
- Add a React close button in the header

---

## Phase 2: Fix Dynamic Sizing (Critical)

### 2.1 Create Resize Command

**File**: `apps/desktop/src-tauri/src/commands/overlay.rs`

```rust
/// Resize the overlay window dynamically.
///
/// Called by React when content size changes (e.g., stats panel expand/collapse).
///
/// # Parameters
/// - `height`: The new window height in logical pixels
/// - `width`: Optional new width (usually unchanged)
#[tauri::command]
pub async fn resize_overlay(
    app: AppHandle,
    height: f64,
    width: Option<f64>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let current_size = window.inner_size()
            .map_err(|e| format!("Failed to get window size: {}", e))?;

        let new_width = width.unwrap_or(current_size.width as f64);

        window
            .set_size(tauri::LogicalSize::new(new_width, height))
            .map_err(|e| format!("Failed to resize overlay: {}", e))?;
    }
    Ok(())
}
```

### 2.2 Calculate Expanded Heights

Update `OVERLAY_SIZES` to include both collapsed and expanded heights:

**File**: `apps/web/src/hooks/useOverlaySettings.ts`

```typescript
export const OVERLAY_SIZES: Record<OverlaySize, {
  board: number;
  width: number;
  heightCollapsed: number;
  heightExpanded: number;
}> = {
  small:  { board: 200, width: 232, heightCollapsed: 364, heightExpanded: 516 },
  medium: { board: 280, width: 312, heightCollapsed: 444, heightExpanded: 596 },
  large:  { board: 360, width: 392, heightCollapsed: 524, heightExpanded: 676 },
};
```

The expanded height adds ~152px for:
- Stats header bar: 32px
- Stakes row: 24px
- Move history: 80px
- Eval row: 20px
- Move count: 16px
- Padding: ~12px

### 2.3 Sync on Expand/Collapse

**File**: `apps/web/src/hooks/useOverlaySettings.ts`

Add a sync effect:

```typescript
// When expanded state changes, notify Rust to resize
useEffect(() => {
  if (typeof window === 'undefined') return;

  const syncWindowSize = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const size = OVERLAY_SIZES[settings.size];
      const height = settings.expanded ? size.heightExpanded : size.heightCollapsed;

      await invoke('resize_overlay', { height, width: size.width });
    } catch (error) {
      console.debug('[Overlay] Resize failed:', error);
    }
  };

  syncWindowSize();
}, [settings.expanded, settings.size]);
```

### 2.4 Debounce Rapid Changes

For the opacity slider (which fires on every mouse move), debounce the updates:

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedSetOpacity = useDebouncedCallback(
  (value: number) => {
    // Update local state immediately for responsiveness
    setSetting('opacity', value);
    // Rust update is debounced
  },
  50 // 50ms debounce
);
```

---

## Phase 3: Simplify Window Chrome

### 3.1 Remove macOS-Specific Styling

Since we want a simple, consistent UI:

**File**: `apps/desktop/src-tauri/src/commands/overlay.rs`

Remove this block from `open_overlay`:
```rust
// DELETE THIS BLOCK
#[cfg(target_os = "macos")]
{
    use crate::plugins::enable_modern_window_style;
    // ...
}
```

### 3.2 Add React Close Button

**File**: `apps/web/src/components/overlay/OverlayBoard.tsx`

Replace the space reserved for traffic lights with a close button:

```tsx
<div
  className="flex items-center justify-between px-3 py-2 bg-off-black border-b border-mid/20 rounded-t-xl"
  data-tauri-drag-region
>
  {/* Close button */}
  <button
    onClick={handleClose}
    className="w-6 h-6 flex items-center justify-center rounded-full bg-mid/20 hover:bg-red-500/80 transition-colors"
    title="Close overlay"
  >
    <svg className="w-3 h-3 text-mid-light hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  {/* Opponent info */}
  {/* ... */}
</div>
```

### 3.3 Update Close Handler

```typescript
const handleClose = useCallback(async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('close_overlay');
  } catch (error) {
    console.error('Failed to close overlay:', error);
  }
}, []);
```

---

## Phase 4: Opacity Sync (Enhancement)

Currently, opacity only affects CSS. For true window transparency:

### 4.1 Update Opacity Command

The existing `set_overlay_opacity` command should also update the window's alpha if possible.

On macOS, window-level opacity can be set via:

```rust
#[cfg(target_os = "macos")]
{
    window.with_webview(|webview| {
        unsafe {
            let ns_window = webview.ns_window() as id;
            let _: () = msg_send![ns_window, setAlphaValue: opacity];
        }
    })?;
}
```

This makes the entire window (not just CSS) transparent.

---

## Implementation Order

1. **Phase 1.1-1.2**: Enable window transparency in Rust (fixes white background)
2. **Phase 2.1**: Add `resize_overlay` command
3. **Phase 2.2-2.3**: Update frontend to sync size on expand/collapse
4. **Phase 3.1-3.3**: Simplify to React close button (removes macOS complexity)
5. **Phase 4.1**: Native opacity sync (optional enhancement)

---

## Testing Checklist

- [ ] Opacity slider: Content fades to transparent (shows desktop behind)
- [ ] Stats panel expand: Window grows, all content visible
- [ ] Stats panel collapse: Window shrinks back
- [ ] Close button: Closes overlay, main window restores
- [ ] Size preset changes: Window resizes correctly
- [ ] Position memory: Saved position persists after restart

---

## Files to Modify

| File | Changes |
|------|---------|
| `commands/overlay.rs` | Add `.transparent(true)`, add `resize_overlay` command, remove macOS styling block |
| `useOverlaySettings.ts` | Add `heightExpanded`, add resize sync effect |
| `OverlayBoard.tsx` | Add close button, remove traffic light padding |
| `(overlay)/layout.tsx` | Verify transparent CSS |

---

## Risk Mitigation

1. **Windows transparency**: May not work perfectly on older Windows. Test on Windows 10/11.
2. **Performance**: Debounce resize calls to avoid jank during rapid expand/collapse.
3. **Position drift**: When resizing, anchor to top-left to prevent window from moving.
