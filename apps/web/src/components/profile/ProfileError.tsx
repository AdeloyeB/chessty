'use client';

/**
 * ProfileError
 *
 * Error display component for profile page.
 * Shows error message with retry option.
 */

interface ProfileErrorProps {
  error: Error | null;
  onRetry?: () => void;
  title?: string;
}

export function ProfileError({
  error,
  onRetry,
  title = 'failed to load profile',
}: ProfileErrorProps) {
  return (
    <div className="bg-off-black border border-red-500/30 p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border border-red-500/50 text-red-400 text-2xl">
        !
      </div>

      <h3 className="text-lg font-mono text-pure-white mb-2 lowercase">
        {title}
      </h3>

      <p className="text-sm text-mid-light font-mono mb-6 lowercase">
        {error?.message || 'an unexpected error occurred'}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-2 bg-pure-black border border-mid/50 text-pure-white font-mono text-sm lowercase hover:border-pure-white transition-colors"
        >
          try_again
        </button>
      )}
    </div>
  );
}

/**
 * Private profile message for when viewing another user's private profile
 */
export function ProfilePrivate({ username }: { username?: string }) {
  return (
    <div className="bg-off-black border border-mid/30 p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border border-mid/50 text-mid-light text-2xl">
        🔒
      </div>

      <h3 className="text-lg font-mono text-pure-white mb-2 lowercase">
        private profile
      </h3>

      <p className="text-sm text-mid-light font-mono lowercase">
        {username
          ? `${username}'s profile is set to private`
          : 'this profile is set to private'}
      </p>
    </div>
  );
}

/**
 * User not found message
 */
export function ProfileNotFound() {
  return (
    <div className="bg-off-black border border-mid/30 p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border border-mid/50 text-mid-light text-2xl">
        ?
      </div>

      <h3 className="text-lg font-mono text-pure-white mb-2 lowercase">
        user not found
      </h3>

      <p className="text-sm text-mid-light font-mono lowercase">
        the requested profile does not exist
      </p>
    </div>
  );
}
