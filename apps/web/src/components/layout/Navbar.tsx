'use client';

import { useAuthStore } from '@/store/auth';
import { useApi } from '@/hooks/useApi';
import { formatBalance } from '@/lib/utils';

export function Navbar() {
  const { user } = useAuthStore();
  const { logout } = useApi();

  return (
    <nav className="border-b border-mid/30">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="text-2xl">♔</span>
          </div>

          {user && (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-6 text-sm font-mono">
                <div>
                  <span className="text-pure-white">{user.username}</span>
                  <span className="ml-2 text-mid-light">[ {user.eloRating} ]</span>
                </div>
                <div className="px-3 py-1.5 bg-off-black border border-mid/30">
                  <span className="text-pure-white">
                    {formatBalance(user.balance)} pts
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                className="text-mid-light hover:text-pure-white transition-colors text-sm font-mono"
              >
                exit
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
