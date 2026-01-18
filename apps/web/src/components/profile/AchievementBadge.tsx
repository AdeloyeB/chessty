'use client';

import { getAchievementById, type Achievement } from '@chess-game/shared';

interface AchievementBadgeProps {
  achievementId: string;
  unlocked: boolean;
  unlockedAt?: Date;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

const sizeConfig = {
  sm: { badge: 40, icon: 'text-lg', text: 'text-xs' },
  md: { badge: 56, icon: 'text-2xl', text: 'text-sm' },
  lg: { badge: 72, icon: 'text-3xl', text: 'text-base' },
};

export function AchievementBadge({
  achievementId,
  unlocked,
  unlockedAt,
  size = 'md',
  showTooltip = true,
}: AchievementBadgeProps) {
  const achievement = getAchievementById(achievementId);
  if (!achievement) return null;

  const config = sizeConfig[size];

  return (
    <div className="relative group">
      <div
        className={`flex items-center justify-center transition-all ${
          unlocked
            ? 'bg-off-black border-pure-white/50 hover:border-pure-white'
            : 'bg-pure-black border-mid/30 grayscale opacity-50'
        } border`}
        style={{
          width: config.badge,
          height: config.badge,
        }}
      >
        <span className={config.icon}>{achievement.icon}</span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          <div className="bg-off-black border border-mid/50 p-3 min-w-[200px] text-center">
            <p className={`font-mono text-pure-white ${config.text} mb-1`}>
              {achievement.name}
            </p>
            <p className="text-xs text-mid-light font-mono mb-2">
              {achievement.description}
            </p>
            {unlocked && unlockedAt && (
              <p className="text-xs text-mid font-mono">
                unlocked {new Date(unlockedAt).toLocaleDateString()}
              </p>
            )}
            {!unlocked && (
              <p className="text-xs text-mid font-mono">locked</p>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-off-black" />
        </div>
      )}
    </div>
  );
}

interface AchievementCardProps {
  achievement: Achievement;
  unlocked: boolean;
  unlockedAt?: Date;
  progress?: number; // 0-100 for progress towards achievement
}

export function AchievementCard({
  achievement,
  unlocked,
  unlockedAt,
  progress,
}: AchievementCardProps) {
  return (
    <div
      className={`p-4 border transition-all ${
        unlocked
          ? 'bg-off-black border-pure-white/30 hover:border-pure-white/50'
          : 'bg-pure-black border-mid/20'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex items-center justify-center w-14 h-14 border ${
            unlocked ? 'border-pure-white/50' : 'border-mid/30 grayscale opacity-50'
          }`}
        >
          <span className="text-3xl">{achievement.icon}</span>
        </div>
        <div className="flex-1">
          <h4
            className={`font-mono ${
              unlocked ? 'text-pure-white' : 'text-mid'
            }`}
          >
            {achievement.name}
          </h4>
          <p className="text-xs text-mid-light font-mono mt-1">
            {achievement.description}
          </p>
          {!unlocked && progress !== undefined && progress > 0 && (
            <div className="mt-2">
              <div className="h-1 bg-pure-black border border-mid/30">
                <div
                  className="h-full bg-mid-light transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-mid font-mono mt-1">
                {progress}% complete
              </p>
            </div>
          )}
          {unlocked && unlockedAt && (
            <p className="text-xs text-mid font-mono mt-2">
              ✓ unlocked {new Date(unlockedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface AchievementGridProps {
  achievements: Array<{
    id: string;
    unlocked: boolean;
    unlockedAt?: Date;
    progress?: number;
  }>;
  showLocked?: boolean;
}

export function AchievementGrid({ achievements, showLocked = true }: AchievementGridProps) {
  const filteredAchievements = showLocked
    ? achievements
    : achievements.filter((a) => a.unlocked);

  return (
    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
      {filteredAchievements.map((a) => (
        <AchievementBadge
          key={a.id}
          achievementId={a.id}
          unlocked={a.unlocked}
          unlockedAt={a.unlockedAt}
          size="sm"
        />
      ))}
    </div>
  );
}
