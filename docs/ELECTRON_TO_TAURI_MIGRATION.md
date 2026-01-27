# Electron → Tauri Migration Plan

> **Who does what:** Claude builds the migration. You review the code, ask questions, and learn Rust in the background. Each phase includes what Claude will build and what you should study while that's happening.

---

## Why We're Doing This

Our chess betting platform handles real money. Electron apps are trivially unpacked (`npx asar extract`), making client-side anti-cheat code readable and editable by anyone. Tauri compiles the native layer to Rust machine code — orders of magnitude harder to reverse-engineer. Secondary benefits: app size drops from ~150MB to ~8MB, RAM usage halves.

---

## Quick Recap: What Is Tauri

Electron bundles an entire Chrome browser (~120MB) inside your app. Tauri skips that — it uses the browser engine your OS already has (Safari's WebKit on Mac, Edge's WebView2 on Windows). The "backend" (the part that talks to the OS) is written in Rust instead of JavaScript.

Your React/Next.js code doesn't change at all. Tauri just loads it in a different container.

```
BEFORE (Electron):                    AFTER (Tauri):
┌─────────────────────┐              ┌─────────────────────┐
│ Bundled Chromium     │  ← gone     │ OS WebView (free)   │
│ Node.js runtime      │  ← gone     │ Rust binary (~3MB)  │
│ Your React app       │  ← stays    │ Your React app      │  ← same
└─────────────────────┘              └─────────────────────┘
  ~150MB, ~200MB RAM                   ~8MB, ~50MB RAM
```

---

## Current Electron Inventory

Everything that needs migrating from `apps/desktop/`.

### Native APIs In Use

| Current Feature | Electron Code | Tauri Equivalent |
|----------------|--------------|------------------|
| Window creation | `BrowserWindow` in `main.ts` | `tauri.conf.json` window config |
| Encrypted local storage | `electron-store` via IPC | `tauri-plugin-store` |
| Open external links | `shell.openExternal()` | `tauri-plugin-opener` |
| Deep links (`chessgamble://`) | `app.setAsDefaultProtocolClient()` | `tauri-plugin-deep-link` |
| OAuth token relay | `ipcMain` + `webContents.send()` | Tauri events (`emit`/`listen`) |
| Context isolation | `contextBridge.exposeInMainWorld()` | Built-in (Tauri is isolated by default) |
| Titlebar style | `titleBarStyle: 'hiddenInset'` | `"decorations": false` + custom titlebar |
| Min window size | `minWidth: 1024, minHeight: 700` | `tauri.conf.json` |
| DevTools (dev only) | `webContents.openDevTools()` | `devtools` feature flag in Cargo.toml |
| App packaging | `electron-builder` | `cargo tauri build` (built-in) |

### IPC Channels to Migrate

```
Electron IPC:                          Tauri Equivalent:
store:get(key)                         #[tauri::command] fn store_get(key)
store:set(key, value)                  #[tauri::command] fn store_set(key, value)
store:delete(key)                      #[tauri::command] fn store_delete(key)
store:clear()                          #[tauri::command] fn store_clear()
auth:openExternal(url)                 #[tauri::command] fn auth_open_external(url)
auth:token (main→renderer event)       app.emit("auth:token", token)
```

---

## Phase 1 — Scaffold Tauri Alongside Electron ✅ COMPLETE

### What Was Built

- [x] Install Rust toolchain and Tauri CLI
- [x] Run `cargo tauri init` in `apps/desktop/` (files created manually for precise control)
- [x] Configure `tauri.conf.json` — window size, title, min dimensions, deep link protocol, bundle targets (DMG/NSIS/AppImage), CSP security headers
- [x] Configure `Cargo.toml` — add `tauri`, `tauri-plugin-store`, `tauri-plugin-opener`, `tauri-plugin-deep-link`, `serde`, `serde_json`
- [x] Add Tauri scripts to `apps/desktop/package.json` alongside existing Electron scripts
- [x] Update root `package.json` with `dev:desktop:tauri` script
- [x] Update `turbo.json` outputs to include Rust build artifacts
- [x] Add Rust build artifacts to `.gitignore`
- [x] Verify: `cargo tauri dev` opens a window loading `localhost:3000`

---

## Phase 2 — Migrate Native Features to Rust ✅ COMPLETE

### What Was Built

- [x] Write `src-tauri/src/main.rs` — entry point with plugin registration, deep link handler, command registration
- [x] Write `src-tauri/src/commands.rs` — all IPC handlers (store get/set/delete/clear, auth open external)
- [x] Create `apps/web/src/lib/desktop.ts` — abstraction layer that detects Tauri vs browser and routes API calls accordingly
- [x] Install `@tauri-apps/api` in the web app
- [x] Find and replace all `window.electronAPI.*` calls with the new abstraction (no existing calls found in web app — abstraction created as the single entry point)
- [x] Test encrypted storage round-trip
- [x] Test OAuth deep link flow (`chessgamble://auth/callback`)
- [x] Test external link opening

---

## Phase 3 — Build Configuration & Dev Workflow ✅ COMPLETE

### What Was Built

- [x] Fix `frontendDist` — point to `../web/out` (static export) instead of `../../web/.next` (which includes `node_modules/`)
- [x] Fix bundle identifier — changed from `com.chessgamble.app` to `com.chessgamble.desktop` (`.app` conflicts with macOS bundle extension)
- [x] Fix relative paths — Tauri runs `beforeBuildCommand` from `apps/desktop/`, not `src-tauri/`, so paths needed to be `../web` not `../../web`
- [x] Add conditional Next.js output — `TAURI_ENV_PLATFORM` env var switches between `'export'` (Tauri) and `'standalone'` (web deployment)
- [x] Configure `beforeBuildCommand` for production builds
- [x] Verify `cargo tauri dev` compiles and launches the desktop window

---

## Phase 4 — Desktop Polish (macOS + Windows + Linux) ← UP NEXT

### macOS

- [ ] **Rounded window corners** — The Tauri window currently renders as a sharp rectangle. macOS apps have rounded corners. This requires either enabling native decorations with customization, or implementing CSS-based rounded corners on the root element with a transparent window background.
- [ ] **Custom titlebar** — With `"decorations": false`, the native macOS titlebar (traffic lights + drag region) is gone. Build a custom titlebar component with:
  - Drag region (so users can move the window by dragging the top bar)
  - Close / Minimize / Maximize buttons (styled to match macOS traffic lights)
  - App title or logo
- [ ] **Window vibrancy** — Consider macOS vibrancy/transparency effects for the sidebar (like Finder or Spotify)

### Windows

- [ ] **Custom titlebar** — Windows apps use a different window chrome style. Build a custom titlebar with:
  - Drag region for window movement
  - Close / Minimize / Maximize buttons (styled to match Windows 11 controls — right-aligned, rectangular)
  - Snap layouts support (Windows 11 hover-over-maximize menu)
- [ ] **Window rounded corners** — Windows 11 has rounded corners natively; Windows 10 does not. Detect OS version and apply CSS rounding where needed.
- [ ] **Taskbar integration** — Ensure the app icon, window title, and thumbnail preview look correct in the Windows taskbar.
- [ ] **High DPI scaling** — Test on high-DPI displays (common on gaming PCs). Ensure text, icons, and the chess board render crisply at 125%, 150%, and 200% scaling.

### Linux

- [ ] **Custom titlebar** — Linux desktop environments vary widely (GNOME, KDE, XFCE, etc.). Build a custom titlebar with:
  - Drag region for window movement
  - Close / Minimize / Maximize buttons (right-aligned, generic style that fits most DEs)
- [ ] **Window decorations** — Some Linux DEs handle client-side decorations (CSD) natively, others use server-side decorations (SSD). Test with `decorations: false` on GNOME (Wayland) and KDE (X11) to ensure the window renders correctly.
- [ ] **Tray / dock integration** — Verify the app icon and title display correctly in GNOME's dash, KDE's taskbar, and system trays.
- [ ] **Font rendering** — Linux font rendering differs from macOS/Windows. Test that the UI fonts (monospace for chess notation, sans-serif for labels) render cleanly without hinting artifacts.

### Shared (All Platforms)

- [ ] **App icons** — Generate proper app icons for all platforms using `cargo tauri icon` from a high-resolution source image (1024x1024 PNG)
- [ ] **Platform detection in titlebar** — Render macOS-style traffic lights (left-aligned) or Windows/Linux-style controls (right-aligned) based on the OS

### Why This Matters

When `decorations: false` is set, the OS stops managing the window chrome entirely — no rounded corners, no titlebar, no window controls. This gives full design control but means we need to rebuild those native-feeling elements ourselves per platform. The current square window with no controls looks noticeably different from every other desktop app on macOS, Windows, and Linux.

### Testing Plan

- **macOS**: Test on the dev machine
- **Windows**: Test on gaming PC (native) or via a Windows VM
- **Linux**: Test via VM (Ubuntu/GNOME as primary target, KDE as secondary)

---

## Phase 5 — Electron Removal & Cleanup

### What Needs Building

- [ ] Delete `electron/` folder entirely
- [ ] Delete `dist/` folder (Electron build artifacts)
- [ ] Delete `tsconfig.electron.json`
- [ ] Remove Electron dependencies from `package.json` (`electron`, `electron-builder`, `electron-store`, `concurrently`, `wait-on`)
- [ ] Remove `electron-builder` config block from `package.json`
- [ ] Update Electron-related scripts in root `package.json`
- [ ] Update `turbo.json` build outputs
- [ ] Update CLAUDE.md tech stack — Electron → Tauri
- [ ] Final smoke test on macOS

### What to Review

This is a "make sure nothing got missed" review:
- Does `pnpm dev` still work end to end?
- Does `pnpm dev:desktop` open the Tauri app?
- Does the web app still work standalone in a browser?
- Are there any leftover references to Electron in the codebase?

---

## Phase 6 — Production Build & CI/CD

### What Needs Building

- [ ] Generate app icons for all platforms (`cargo tauri icon`)
- [ ] Create production build config — separate dev and release profiles
- [ ] Write GitHub Actions workflow for automated cross-platform builds (macOS ARM + Intel, Windows, Linux)
- [ ] Configure the `tauri-action` GitHub Action for building and releasing
- [ ] Test macOS build locally
- [ ] Set up release drafts — tag a version, CI builds all platforms, creates GitHub Release

### What to Study

**Code signing and notarization.** This isn't Rust — it's platform knowledge:
- macOS requires apps to be "notarized" by Apple or users get a scary warning
- Windows has optional code signing (users get a "Windows protected your PC" warning without it)
- This costs money ($99/year Apple Developer, ~$200-400/year for Windows code signing)
- Not needed for initial testing, but required before public distribution

---

## File Changes Summary

### New Files (Created)

```
apps/desktop/
└── src-tauri/
    ├── Cargo.toml              # Rust dependencies
    ├── tauri.conf.json         # App config (window, bundle, plugins)
    ├── build.rs                # Rust build script (auto-generated)
    ├── capabilities/
    │   └── default.json        # Tauri v2 permission declarations
    ├── icons/                  # App icons (all platforms)
    └── src/
        ├── main.rs             # Entry point — plugins, commands, deep links
        └── commands.rs         # IPC handlers — store, auth

apps/web/src/lib/
└── desktop.ts                  # Abstraction layer (Tauri vs browser)

docs/
├── ELECTRON_TO_TAURI_MIGRATION.md  # This file
└── ANTI_CHEAT_PLAN.md              # Anti-cheat system design (separate effort)
```

### Deleted Files (Phase 5 — Not Yet Done)

```
apps/desktop/
├── electron/main.ts            # Replaced by src-tauri/src/main.rs
├── electron/preload.ts         # No equivalent needed (Tauri isolates by default)
├── dist/main.js                # Compiled Electron (gone)
├── dist/preload.js             # Compiled preload (gone)
├── dist/debug.js               # Debug utils (gone)
├── tsconfig.electron.json      # Electron TS config (gone)
└── test-require.js             # Module test (gone)
```

### Modified Files

```
apps/desktop/package.json       # Add Tauri scripts alongside Electron
apps/web/package.json           # Add @tauri-apps/api
apps/web/next.config.js         # Conditional output (export vs standalone)
package.json (root)             # Add dev:desktop:tauri script
turbo.json                      # Add Rust build outputs
.gitignore                      # Add **/target/
```

---

## Rust Concepts You'll Encounter (Review Cheat Sheet)

When reviewing the Rust code Claude writes, here's what the syntax means:

| Rust | JavaScript Equivalent | What It Means |
|------|----------------------|---------------|
| `fn name() -> String` | `function name(): string` | Function that returns a String |
| `pub fn` | `export function` | Public function (accessible from other files) |
| `let x = 5;` | `const x = 5;` | Variable (immutable by default in Rust) |
| `let mut x = 5;` | `let x = 5;` | Mutable variable |
| `String` | `string` | Owned text (heap-allocated) |
| `&str` | `string` (reference) | Borrowed text (doesn't own the data) |
| `Vec<String>` | `string[]` | Dynamic array of strings |
| `Option<T>` | `T \| null` | Value that might not exist |
| `Result<T, E>` | try/catch return | Value that might be an error |
| `Some(value)` | the value exists | Wraps a value in Option |
| `None` | `null` | No value |
| `Ok(value)` | success | Wraps a success result |
| `Err(e)` | throw error | Wraps an error result |
| `?` | `throw` if error | Unwraps Result, returns error if failed |
| `.unwrap()` | `!` (force) | "I'm sure this won't fail" (crashes if wrong) |
| `#[tauri::command]` | decorator | Marks function as callable from frontend |
| `mod filename;` | `import * from './filename'` | Include another Rust file |
| `use crate::module` | `import { x } from './module'` | Bring items into scope |
| `struct Name { field: Type }` | `interface Name { field: Type }` | Data structure |
| `impl Name { fn method() }` | `class Name { method() }` | Methods on a struct |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebKit rendering differs from Chromium | UI looks slightly different on Mac | Test early in Phase 1. CSS differences are minor for our UI. |
| `next.config.js` standalone output path | Tauri can't find the built web app | Resolved — conditional `output` based on `TAURI_ENV_PLATFORM`. |
| Deep link registration varies by OS | `chessgamble://` may not work on all OS versions | Test on macOS 12+, Windows 10+. Tauri plugin handles registration. |
| First Rust compile is slow (~3-5 min) | Dev experience feels slow initially | Subsequent builds are ~10s. Only the first compile downloads and builds all dependencies. |
| Custom titlebar UX | Users expect native macOS behavior | Phase 4 addresses this — match traffic light placement and drag regions. |
