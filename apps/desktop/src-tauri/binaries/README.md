# Stockfish Binaries for Tauri Sidecar

This directory contains Stockfish chess engine binaries that are bundled with the desktop app as Tauri sidecars.

## Why Sidecars?

Tauri "sidecars" are external binaries that get bundled with your app. When the app runs, Tauri knows where to find these binaries on any platform. This is perfect for Stockfish because:

1. **Chess analysis requires a native binary** - Stockfish is written in C++ and compiled to machine code
2. **Cross-platform support** - Each OS needs its own compiled version
3. **Tauri handles the complexity** - It finds the right binary for the current platform automatically

## Required Files

Tauri requires binaries to follow a specific naming convention:

```
<binary-name>-<target-triple>[.exe]
```

You need these 4 files in this directory:

| File | Platform | Architecture |
|------|----------|--------------|
| `stockfish-aarch64-apple-darwin` | macOS | Apple Silicon (M1/M2/M3) |
| `stockfish-x86_64-apple-darwin` | macOS | Intel |
| `stockfish-x86_64-pc-windows-msvc.exe` | Windows | 64-bit |
| `stockfish-x86_64-unknown-linux-gnu` | Linux | 64-bit |

## Download Instructions

### Step 1: Download from Official Releases

Go to: https://github.com/official-stockfish/Stockfish/releases/latest

Download these files:

- **macOS Apple Silicon**: `stockfish-macos-m1-apple-silicon.tar`
- **macOS Intel**: `stockfish-macos-x86-64-avx2.tar` (or `stockfish-macos-x86-64.tar` for older Macs)
- **Windows**: `stockfish-windows-x86-64-avx2.zip` (or `stockfish-windows-x86-64.zip` for older CPUs)
- **Linux**: `stockfish-ubuntu-x86-64-avx2.tar` (or `stockfish-ubuntu-x86-64.tar` for older CPUs)

### Step 2: Extract and Rename

After downloading, extract each archive and rename the binary inside:

```bash
# macOS Apple Silicon
tar -xf stockfish-macos-m1-apple-silicon.tar
mv stockfish/stockfish-macos-m1-apple-silicon stockfish-aarch64-apple-darwin

# macOS Intel
tar -xf stockfish-macos-x86-64-avx2.tar
mv stockfish/stockfish-macos-x86-64-avx2 stockfish-x86_64-apple-darwin

# Linux
tar -xf stockfish-ubuntu-x86-64-avx2.tar
mv stockfish/stockfish-ubuntu-x86-64-avx2 stockfish-x86_64-unknown-linux-gnu

# Windows (use unzip or extract manually)
unzip stockfish-windows-x86-64-avx2.zip
mv stockfish/stockfish-windows-x86-64-avx2.exe stockfish-x86_64-pc-windows-msvc.exe
```

### Step 3: Make Executable (Unix only)

```bash
chmod +x stockfish-aarch64-apple-darwin
chmod +x stockfish-x86_64-apple-darwin
chmod +x stockfish-x86_64-unknown-linux-gnu
```

### Step 4: Verify

Run a quick test to make sure the binary works:

```bash
# On macOS Apple Silicon
./stockfish-aarch64-apple-darwin <<< "uci" | head -5

# On macOS Intel
./stockfish-x86_64-apple-darwin <<< "uci" | head -5

# On Linux
./stockfish-x86_64-unknown-linux-gnu <<< "uci" | head -5

# On Windows (PowerShell)
echo "uci" | .\stockfish-x86_64-pc-windows-msvc.exe | Select-Object -First 5
```

You should see output starting with:
```
Stockfish 17.1 by T. Romstad, M. Costalba, J. Kiiski, G. Linscott
id name Stockfish 17.1
id author T. Romstad, M. Costalba, J. Kiiski, G. Linscott
...
```

## Quick Download Script (macOS/Linux)

For convenience, here's a script that downloads and sets up all binaries:

```bash
#!/bin/bash
set -e

RELEASE_URL="https://github.com/official-stockfish/Stockfish/releases/latest/download"
BINARIES_DIR="$(dirname "$0")"

echo "Downloading Stockfish binaries..."

# macOS Apple Silicon
curl -L "$RELEASE_URL/stockfish-macos-m1-apple-silicon.tar" | tar -xf - -C /tmp
mv /tmp/stockfish/stockfish-macos-m1-apple-silicon "$BINARIES_DIR/stockfish-aarch64-apple-darwin"
chmod +x "$BINARIES_DIR/stockfish-aarch64-apple-darwin"
echo "Downloaded: stockfish-aarch64-apple-darwin"

# macOS Intel
curl -L "$RELEASE_URL/stockfish-macos-x86-64-avx2.tar" | tar -xf - -C /tmp
mv /tmp/stockfish/stockfish-macos-x86-64-avx2 "$BINARIES_DIR/stockfish-x86_64-apple-darwin"
chmod +x "$BINARIES_DIR/stockfish-x86_64-apple-darwin"
echo "Downloaded: stockfish-x86_64-apple-darwin"

# Linux
curl -L "$RELEASE_URL/stockfish-ubuntu-x86-64-avx2.tar" | tar -xf - -C /tmp
mv /tmp/stockfish/stockfish-ubuntu-x86-64-avx2 "$BINARIES_DIR/stockfish-x86_64-unknown-linux-gnu"
chmod +x "$BINARIES_DIR/stockfish-x86_64-unknown-linux-gnu"
echo "Downloaded: stockfish-x86_64-unknown-linux-gnu"

# Windows
curl -L "$RELEASE_URL/stockfish-windows-x86-64-avx2.zip" -o /tmp/stockfish-windows.zip
unzip -o /tmp/stockfish-windows.zip -d /tmp/stockfish-win
mv /tmp/stockfish-win/stockfish/stockfish-windows-x86-64-avx2.exe "$BINARIES_DIR/stockfish-x86_64-pc-windows-msvc.exe"
echo "Downloaded: stockfish-x86_64-pc-windows-msvc.exe"

# Cleanup
rm -rf /tmp/stockfish /tmp/stockfish-win /tmp/stockfish-windows.zip

echo "All binaries downloaded successfully!"
ls -la "$BINARIES_DIR"/stockfish-*
```

Save this as `download-stockfish.sh` in this directory and run: `bash download-stockfish.sh`

## How Tauri Uses These

In `tauri.conf.json`, we configure:

```json
{
  "bundle": {
    "externalBin": ["binaries/stockfish"]
  }
}
```

Tauri automatically:
1. Detects the current platform's target triple
2. Finds the matching binary (e.g., `stockfish-aarch64-apple-darwin` on M1 Mac)
3. Bundles it into the app installer
4. Makes it available at runtime via `app.shell().sidecar("stockfish")`

## File Sizes

Each binary is approximately 10-15 MB. They are gitignored to keep the repository small.

## Troubleshooting

### "Binary not found" at runtime
- Make sure the binary name matches exactly (including the target triple)
- Verify the binary is in `apps/desktop/src-tauri/binaries/`

### "Permission denied" on macOS/Linux
- Run `chmod +x <binary-name>` to make it executable

### "Cannot execute binary" on macOS
- First run may trigger Gatekeeper. Right-click > Open, or:
  ```bash
  xattr -d com.apple.quarantine stockfish-aarch64-apple-darwin
  ```

### Wrong architecture errors
- Make sure you downloaded the correct variant for your CPU
- Apple Silicon Macs need `aarch64`, Intel Macs need `x86_64`
