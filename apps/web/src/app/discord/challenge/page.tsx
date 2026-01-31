'use client';

/**
 * Discord Challenge Page
 * ======================
 *
 * This page shows challenge details when opened via a Discord deep link.
 *
 * FLOW:
 * 1. User creates a challenge in Discord (e.g., /challenge @opponent $10)
 * 2. Bot creates a pending challenge and sends a deep link: chkmate://challenge/{id}
 * 3. Recipient clicks the link, which opens the desktop app
 * 4. Deep link listener navigates to this page with the challenge ID
 * 5. This page fetches challenge details and shows accept/decline UI
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
      <div className="text-mid-light font-mono text-sm">Loading challenge...</div>
    </div>
  );
}

/**
 * Error state shown when the challenge ID is missing from the URL.
 * This shouldn't happen in normal usage — indicates a malformed deep link.
 */
function MissingChallengeError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pure-black">
      <div className="bg-off-black border border-mid/30 p-6 max-w-md">
        <h1 className="text-pure-white font-mono text-lg mb-2">Invalid Challenge Link</h1>
        <p className="text-mid-light text-sm">
          The challenge ID is missing. The challenge may have expired or been cancelled.
        </p>
      </div>
    </div>
  );
}

/**
 * Main content component that reads the challenge ID from URL params.
 * Separated from the page component to allow Suspense boundary.
 */
function ChallengeContent() {
  const searchParams = useSearchParams();
  const challengeId = searchParams.get('id');

  // Guard: challenge ID is required
  if (!challengeId) {
    return <MissingChallengeError />;
  }

  // TODO: Replace with ChallengeLandingScreen component once it's built
  // The ChallengeLandingScreen should:
  // 1. Fetch challenge details from API using challengeId
  // 2. Show challenger info, wager amount, time control
  // 3. Show Accept/Decline buttons
  // 4. Handle challenge expiration
  // 5. Navigate to game lobby on accept
  return (
    <div className="min-h-screen flex items-center justify-center bg-pure-black">
      <div className="bg-off-black border border-mid/30 p-6 max-w-md">
        <h1 className="text-pure-white font-mono text-lg mb-4">Challenge Received</h1>
        <p className="text-mid-light text-sm mb-4">
          Loading challenge details...
        </p>
        <div className="bg-pure-black border border-mid/30 p-3 font-mono text-xs text-mid break-all mb-4">
          Challenge ID: {challengeId}
        </div>

        {/* Placeholder buttons - will be replaced by ChallengeLandingScreen */}
        <div className="flex gap-3">
          <button
            disabled
            className="flex-1 py-2 px-4 bg-pure-white text-pure-black font-mono text-sm opacity-50 cursor-not-allowed"
          >
            Accept
          </button>
          <button
            disabled
            className="flex-1 py-2 px-4 bg-pure-black border border-mid/50 text-mid-light font-mono text-sm opacity-50 cursor-not-allowed"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Page component with Suspense boundary.
 * Next.js App Router requires this pattern for useSearchParams().
 */
export default function DiscordChallengePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ChallengeContent />
    </Suspense>
  );
}
