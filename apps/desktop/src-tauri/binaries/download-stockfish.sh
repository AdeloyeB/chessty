#!/bin/bash
# Downloads Stockfish binaries for all platforms
# Run this script from the binaries/ directory

set -e

RELEASE_URL="https://github.com/official-stockfish/Stockfish/releases/latest/download"
BINARIES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==================================="
echo "Stockfish Binary Downloader"
echo "==================================="
echo ""
echo "This script downloads Stockfish for all platforms."
echo "Binaries will be saved to: $BINARIES_DIR"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

download_and_extract() {
    local url=$1
    local archive_name=$2
    local source_name=$3
    local target_name=$4
    local is_zip=${5:-false}

    echo "Downloading $target_name..."

    if [ "$is_zip" = true ]; then
        curl -sL "$url" -o "$TEMP_DIR/$archive_name"
        unzip -q "$TEMP_DIR/$archive_name" -d "$TEMP_DIR/extracted"
        mv "$TEMP_DIR/extracted/stockfish/$source_name" "$BINARIES_DIR/$target_name"
        rm -rf "$TEMP_DIR/extracted"
    else
        curl -sL "$url" | tar -xf - -C "$TEMP_DIR"
        mv "$TEMP_DIR/stockfish/$source_name" "$BINARIES_DIR/$target_name"
    fi

    # Make executable on Unix
    if [[ "$target_name" != *.exe ]]; then
        chmod +x "$BINARIES_DIR/$target_name"
    fi

    echo "  Downloaded: $target_name"
}

# macOS Apple Silicon (M1/M2/M3)
download_and_extract \
    "$RELEASE_URL/stockfish-macos-m1-apple-silicon.tar" \
    "stockfish-macos-m1-apple-silicon.tar" \
    "stockfish-macos-m1-apple-silicon" \
    "stockfish-aarch64-apple-darwin"

# macOS Intel
download_and_extract \
    "$RELEASE_URL/stockfish-macos-x86-64-avx2.tar" \
    "stockfish-macos-x86-64-avx2.tar" \
    "stockfish-macos-x86-64-avx2" \
    "stockfish-x86_64-apple-darwin"

# Linux x64
download_and_extract \
    "$RELEASE_URL/stockfish-ubuntu-x86-64-avx2.tar" \
    "stockfish-ubuntu-x86-64-avx2.tar" \
    "stockfish-ubuntu-x86-64-avx2" \
    "stockfish-x86_64-unknown-linux-gnu"

# Windows x64
download_and_extract \
    "$RELEASE_URL/stockfish-windows-x86-64-avx2.zip" \
    "stockfish-windows-x86-64-avx2.zip" \
    "stockfish-windows-x86-64-avx2.exe" \
    "stockfish-x86_64-pc-windows-msvc.exe" \
    true

echo ""
echo "==================================="
echo "Download complete!"
echo "==================================="
echo ""
echo "Binaries downloaded:"
ls -lh "$BINARIES_DIR"/stockfish-* 2>/dev/null || echo "No binaries found (this shouldn't happen)"
echo ""
echo "Next steps:"
echo "1. Test the binary for your platform:"
echo "   ./stockfish-aarch64-apple-darwin <<< 'uci' | head -3"
echo ""
echo "2. If you get a macOS Gatekeeper warning, run:"
echo "   xattr -d com.apple.quarantine stockfish-aarch64-apple-darwin"
