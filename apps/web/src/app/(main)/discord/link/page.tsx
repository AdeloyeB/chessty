'use client';

/**
 * Discord Account Link Page
 * =========================
 *
 * This page handles linking a Discord account to a Chkmate account.
 *
 * FLOW:
 * 1. User runs /link command in Discord bot
 * 2. Bot generates a one-time token and sends a deep link: chkmate://link/{token}
 * 3. User clicks the link, which opens the desktop app
 * 4. Deep link listener navigates to this page with the token
 * 5. This page calls the API to verify the token and link accounts
 *
 * WHY SUSPENSE?
 * useSearchParams() needs to be wrapped in Suspense because it can suspend
 * while waiting for the URL to be available during streaming SSR.
 * Without Suspense, Next.js throws an error in production builds.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Loading fallback shown while the page content loads.
 * Uses the project's color system (mid-light for muted text).
 */
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pure-black">
      <div className="text-mid-light font-mono text-sm">Loading...</div>
    </div>
  );
}

/**
 * Error state shown when the token is missing from the URL.
 * This shouldn't happen in normal usage — indicates a malformed deep link.
 */
function MissingTokenError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pure-black">
      <div className="bg-off-black border border-mid/30 p-6 max-w-md">
        <h1 className="text-pure-white font-mono text-lg mb-2">Invalid Link</h1>
        <p className="text-mid-light text-sm">
          The link token is missing. Please try running the /link command in Discord again.
        </p>
      </div>
    </div>
  );
}

/**
 * Main content component that reads the token from URL params.
 * Separated from the page component to allow Suspense boundary.
 */
function LinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Guard: token is required
  if (!token) {
    return <MissingTokenError />;
  }

  // TODO: Replace with AccountLinkScreen component once it's built
  // The AccountLinkScreen should:
  // 1. Show loading state while verifying token
  // 2. Call API to link Discord account
  // 3. Show success/error state
  // 4. Provide "Return to Discord" or "Go to Dashboard" buttons
  return (
    <div className="min-h-screen flex items-center justify-center bg-pure-black">
      <div className="bg-off-black border border-mid/30 p-6 max-w-md">
        <h1 className="text-pure-white font-mono text-lg mb-4">Link Discord Account</h1>
        <p className="text-mid-light text-sm mb-4">
          Linking your Discord account...
        </p>
        <div className="bg-pure-black border border-mid/30 p-3 font-mono text-xs text-mid break-all">
          Token: {token}
        </div>
      </div>
    </div>
  );
}

/**
 * Page component with Suspense boundary.
 * Next.js App Router requires this pattern for useSearchParams().
 */
export default function DiscordLinkPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LinkContent />
    </Suspense>
  );
}
