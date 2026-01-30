/**
 * Overlay Root Layout — Minimal layout for floating overlay window
 * =================================================================
 *
 * This is a separate root layout for the overlay window. It's minimal because:
 *   1. No WalletProvider (no crypto operations in overlay)
 *   2. No DesktopLayout (no titlebar/ticker — overlay has its own chrome)
 *   3. No ToastContainer (no notifications needed)
 *   4. No DevDebugPanel (overlay should be lightweight)
 *
 * TRANSPARENT BACKGROUND
 * ----------------------
 * The overlay window uses a transparent background so native macOS rounded
 * corners show correctly. The OverlayBoard component provides its own
 * off-black background with CSS rounded corners.
 *
 * PERFORMANCE
 * -----------
 * By not loading heavy providers, the overlay starts faster:
 *   - No RainbowKit/Wagmi wallet initialization
 *   - No WebSocket auth flow
 *   - Just the game state from Zustand + WebSocket move sync
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Overlay - Chessty',
  description: 'Compact chess overlay window',
};

export default function OverlayRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overlay-window">
      <head>
        {/* Overlay-specific styles that override globals.css */}
        <style>{`
          /* Transparent background for the overlay window.
             This allows the native macOS rounded corners to show through.
             The OverlayBoard component provides its own background. */
          html.overlay-window,
          html.overlay-window body {
            background: transparent !important;
            min-height: 100vh;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }

          /* Override the tauri-app body padding for overlay */
          html.overlay-window body.tauri-app {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
        `}</style>
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
