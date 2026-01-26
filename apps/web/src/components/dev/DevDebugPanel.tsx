'use client';

/**
 * DevDebugPanel
 *
 * Debug panel for testing features in development mode.
 * Only visible when NODE_ENV === 'development'.
 */

import { useState } from 'react';
import { useNotificationStore } from '@/store/notification';
import { ACHIEVEMENTS, type AchievementCategory } from '@chess-game/shared';

// Only render in development
const isDev = process.env.NODE_ENV === 'development';

export function DevDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { addAchievementNotification, addNotification, clearAll } = useNotificationStore();

  if (!isDev) return null;

  const triggerRandomAchievement = () => {
    const randomAchievement = ACHIEVEMENTS[Math.floor(Math.random() * ACHIEVEMENTS.length)];
    addAchievementNotification({
      id: randomAchievement.id,
      name: randomAchievement.name,
      description: randomAchievement.description,
      icon: randomAchievement.icon,
      category: randomAchievement.category,
    });
  };

  const triggerSpecificAchievement = (id: string) => {
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (achievement) {
      addAchievementNotification({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
      });
    }
  };

  const triggerMultipleAchievements = () => {
    // Simulate unlocking 3 achievements at once (like after a big win)
    const shuffled = [...ACHIEVEMENTS].sort(() => Math.random() - 0.5);
    shuffled.slice(0, 3).forEach((achievement, index) => {
      setTimeout(() => {
        addAchievementNotification({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          category: achievement.category,
        });
      }, index * 500); // Stagger by 500ms
    });
  };

  const triggerSuccessNotification = () => {
    addNotification({
      type: 'success',
      title: 'game_saved',
      message: 'your progress has been saved',
    });
  };

  const triggerErrorNotification = () => {
    addNotification({
      type: 'error',
      title: 'connection_lost',
      message: 'failed to connect to server',
    });
  };

  // Popular achievements for quick testing
  const quickAchievements = [
    'first_win',
    'streak_5',
    'elo_1800',
    'high_roller',
    'speed_demon',
  ];

  return (
    <>
      {/* Toggle Button - Fixed bottom left */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 bg-purple-600 hover:bg-purple-500 text-white font-mono text-sm flex items-center justify-center border border-purple-400 transition-colors"
        title="Dev Debug Panel"
      >
        🛠
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-16 left-4 z-50 w-72 bg-black border border-purple-500/50 shadow-lg shadow-purple-500/20">
          {/* Header */}
          <div className="p-3 border-b border-purple-500/30 flex items-center justify-between">
            <span className="text-purple-400 font-mono text-sm">dev_debug</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-purple-400/50 hover:text-purple-400 text-sm"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="p-3 space-y-4 max-h-96 overflow-y-auto">
            {/* Achievement Notifications */}
            <div>
              <p className="text-xs font-mono text-purple-400/70 mb-2">achievement_toasts</p>
              <div className="space-y-2">
                <button
                  onClick={triggerRandomAchievement}
                  className="w-full px-3 py-2 bg-purple-900/30 border border-purple-500/30 text-purple-300 font-mono text-xs hover:bg-purple-900/50 hover:border-purple-500/50 transition-colors text-left"
                >
                  🎲 random_achievement
                </button>
                <button
                  onClick={triggerMultipleAchievements}
                  className="w-full px-3 py-2 bg-purple-900/30 border border-purple-500/30 text-purple-300 font-mono text-xs hover:bg-purple-900/50 hover:border-purple-500/50 transition-colors text-left"
                >
                  🎯 trigger_3_achievements
                </button>
              </div>

              {/* Quick achievements */}
              <p className="text-xs font-mono text-purple-400/50 mt-3 mb-1">quick_picks</p>
              <div className="flex flex-wrap gap-1">
                {quickAchievements.map((id) => {
                  const achievement = ACHIEVEMENTS.find(a => a.id === id);
                  return (
                    <button
                      key={id}
                      onClick={() => triggerSpecificAchievement(id)}
                      className="px-2 py-1 bg-purple-900/20 border border-purple-500/20 text-purple-300/70 font-mono text-xs hover:bg-purple-900/40 hover:text-purple-300 transition-colors"
                      title={achievement?.name}
                    >
                      {achievement?.icon}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Other Notifications */}
            <div>
              <p className="text-xs font-mono text-purple-400/70 mb-2">other_toasts</p>
              <div className="flex gap-2">
                <button
                  onClick={triggerSuccessNotification}
                  className="flex-1 px-2 py-1.5 bg-green-900/30 border border-green-500/30 text-green-300 font-mono text-xs hover:bg-green-900/50 transition-colors"
                >
                  ✓ success
                </button>
                <button
                  onClick={triggerErrorNotification}
                  className="flex-1 px-2 py-1.5 bg-red-900/30 border border-red-500/30 text-red-300 font-mono text-xs hover:bg-red-900/50 transition-colors"
                >
                  ! error
                </button>
              </div>
            </div>

            {/* Clear All */}
            <button
              onClick={clearAll}
              className="w-full px-3 py-2 bg-black border border-white/20 text-white/50 font-mono text-xs hover:border-white/40 hover:text-white/70 transition-colors"
            >
              clear_all_notifications
            </button>
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-purple-500/30">
            <p className="text-xs font-mono text-purple-400/30 text-center">
              dev mode only
            </p>
          </div>
        </div>
      )}
    </>
  );
}
