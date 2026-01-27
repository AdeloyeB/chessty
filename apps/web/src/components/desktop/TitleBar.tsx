/**
 * TitleBar — Custom desktop window titlebar
 * ===========================================
 *
 * This replaces the native OS titlebar that we removed with
 * `"decorations": false` in tauri.conf.json. It provides:
 *
 *   1. Window controls (close/minimize/maximize)
 *   2. Drag region to move the window
 *   3. Navigation tabs (home, find_game, practice, spectate, etc.)
 *   4. User info (username, ELO, balance)
 *
 * PLATFORM ADAPTATION:
 *   - macOS:         [● ● ●] ♔ chess gamble   home  find_game  ...         user123 [1600] 500 usdc  exit
 *   - Windows/Linux: ♔ chess gamble   home  find_game  ...         user123 [1600] 500 usdc  exit  [— □ ×]
 *   - Browser:       (not rendered — returns null)
 *
 * The titlebar is 48px tall (h-12) and fixed to the top of the viewport.
 * All page content should have padding-top to account for this.
 *
 * DRAG BEHAVIOR:
 * The entire titlebar is a drag region (data-tauri-drag-region).
 * Interactive elements (buttons, links) are excluded from dragging
 * by being rendered as normal interactive elements — Tauri's drag
 * implementation correctly ignores clicks on interactive elements.
 */

'use client';

import { useTitleBar } from '@/hooks/useTitleBar';
import { useGameStore } from '@/store/game';
import { useFeatureFlag } from '@/store/flags';
import { TrafficLights } from './TrafficLights';
import { WindowControls } from './WindowControls';

// Tab type matching HomeDashboard's Tab type
type Tab = 'home' | 'practice' | 'play' | 'watch' | 'history' | 'leaderboard' | 'live_game';

interface TitleBarProps {
  /** Currently active tab — controls which tab is highlighted */
  activeTab?: Tab;
  /** Callback when a tab is clicked */
  onTabChange?: (tab: Tab) => void;
  /** User info to display on the right side */
  user?: {
    username: string;
    eloRating: number;
    balance: number;
  } | null;
  /** Logout callback */
  onLogout?: () => void;
}

const baseTabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'home' },
  { id: 'play', label: 'find_game' },
  { id: 'practice', label: 'practice' },
  { id: 'watch', label: 'spectate' },
  { id: 'history', label: 'history' },
  { id: 'leaderboard', label: 'rankings' },
];

export function TitleBar({ activeTab, onTabChange, user, onLogout }: TitleBarProps) {
  const { isTauriApp, osType, isMaximized, close, minimize, toggleMaximize } = useTitleBar();
  const { status } = useGameStore();
  const spectatorEnabled = useFeatureFlag('spectator_mode');

  // Filter base tabs by feature flags, then dynamically insert live_game when in a game
  const filteredTabs = spectatorEnabled
    ? baseTabs
    : baseTabs.filter((t) => t.id !== 'watch');
  const showLiveTab = status === 'queuing' || status === 'matched' || status === 'playing' || status === 'ended';
  const tabs: { id: Tab; label: string }[] = showLiveTab
    ? [
        filteredTabs[0],
        filteredTabs[1],
        { id: 'live_game', label: 'live_game' },
        ...filteredTabs.slice(2),
      ]
    : filteredTabs;

  // Only render in the desktop app — the browser uses its own navigation
  if (!isTauriApp) return null;

  const isMac = osType === 'macos';

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] select-none">
      <div
        className="h-12 bg-black border-b border-white/15 flex items-center"
        data-tauri-drag-region
      >
        {/* === LEFT SECTION === */}
        {/* macOS: traffic lights first, then branding */}
        {/* Windows/Linux: just branding */}
        <div className="flex items-center shrink-0">
          {isMac && (
            <TrafficLights
              onClose={close}
              onMinimize={minimize}
              onMaximize={toggleMaximize}
            />
          )}

          {/* App branding */}
          <div className="flex items-center gap-2 px-4">
            <span className="text-2xl text-white/80">♔</span>
            {!isMac && (
              <span className="text-xs text-white/40 uppercase tracking-wider font-mono">
                chess gamble
              </span>
            )}
          </div>
        </div>

        {/* === CENTER SECTION: Navigation Tabs === */}
        {onTabChange && (
          <div className="flex-1 flex items-center gap-1 px-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  px-3 py-1.5 font-mono text-xs transition-all relative whitespace-nowrap flex items-center gap-1
                  ${activeTab === tab.id
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/70'
                  }
                `}
              >
                {tab.label}
                {tab.id === 'live_game' && (
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Spacer when no tabs */}
        {!onTabChange && <div className="flex-1" />}

        {/* === RIGHT SECTION === */}
        <div className="flex items-center shrink-0">
          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 px-4">
              <div className="flex items-center gap-2">
                <span className="text-white font-mono text-xs">{user.username}</span>
                <span className="text-white/40 font-mono text-xs">[ {user.eloRating} ]</span>
              </div>
              <div className="px-2 py-1 border border-white/15 font-mono text-xs text-white/70">
                {user.balance.toLocaleString()} usdc
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-white/30 hover:text-white/70 transition-colors text-xs font-mono"
                >
                  exit
                </button>
              )}
            </div>
          )}

          {/* Windows/Linux: window controls on the right */}
          {!isMac && (
            <WindowControls
              onClose={close}
              onMinimize={minimize}
              onMaximize={toggleMaximize}
              isMaximized={isMaximized}
            />
          )}
        </div>
      </div>
    </div>
  );
}
