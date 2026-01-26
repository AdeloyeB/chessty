'use client';

/**
 * ProfileSkeleton
 *
 * Loading skeleton for the profile page.
 * Shows placeholder elements with pulse animation while data loads.
 */

interface SkeletonBlockProps {
  className?: string;
}

function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return (
    <div className={`bg-mid/20 animate-pulse ${className}`} />
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-off-black border border-mid/30 p-6">
        <div className="flex items-start gap-6">
          {/* Avatar placeholder */}
          <SkeletonBlock className="w-20 h-20 shrink-0" />

          <div className="flex-1 space-y-4">
            {/* Username */}
            <SkeletonBlock className="h-6 w-48" />

            {/* Rank badge */}
            <SkeletonBlock className="h-8 w-32" />

            {/* Stats row */}
            <div className="flex gap-6">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          </div>

          {/* Rank progress */}
          <div className="w-32 space-y-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-2 w-full" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-off-black border border-mid/30 p-4">
            <SkeletonBlock className="h-8 w-16 mb-2" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Achievements Section */}
      <div className="bg-off-black border border-mid/30 p-6">
        {/* Section header */}
        <div className="flex justify-between items-center mb-4">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-4 w-20" />
        </div>

        {/* Achievement grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="text-center space-y-2">
              <SkeletonBlock className="w-12 h-12 mx-auto" />
              <SkeletonBlock className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-off-black border border-mid/30 p-6">
        <SkeletonBlock className="h-5 w-40 mb-4" />

        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 border border-mid/20">
              <SkeletonBlock className="w-8 h-8" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-48" />
                <SkeletonBlock className="h-3 w-32" />
              </div>
              <SkeletonBlock className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact skeleton for inline profile loading
 */
export function ProfileSkeletonCompact() {
  return (
    <div className="flex items-center gap-3 p-3">
      <SkeletonBlock className="w-10 h-10 shrink-0" />
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
    </div>
  );
}
