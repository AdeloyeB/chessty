/**
 * Main App Root Layout
 * =====================
 *
 * This is the root layout for the main application (everything except /overlay).
 * It includes all the providers, desktop chrome (TitleBar, TickerBar), and global
 * components that the main app needs.
 *
 * WHY ROUTE GROUPS?
 * -----------------
 * Next.js App Router composes layouts hierarchically. Without route groups,
 * the overlay's layout would nest inside this one, causing:
 *   Root Layout (<html><body>)
 *     └── Overlay Layout (<html>) ← ERROR: nested <html>
 *
 * By using route groups:
 *   (main)/layout.tsx   → Root layout for main app
 *   (overlay)/layout.tsx → Separate root layout for overlay
 *
 * Each group gets its own <html> element, solving the hydration issue.
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Chessty',
  description: 'Play chess online and predict game outcomes',
};

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
