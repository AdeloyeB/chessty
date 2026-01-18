-- Create achievement category enum
CREATE TYPE achievement_category AS ENUM ('games', 'elo', 'streaks', 'special_moves', 'milestones');

-- Create user achievements table
CREATE TABLE user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  category achievement_category NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for user achievements
CREATE INDEX user_achievements_user_idx ON user_achievements(user_id);
CREATE INDEX user_achievements_achievement_idx ON user_achievements(achievement_id);
CREATE UNIQUE INDEX user_achievements_unique ON user_achievements(user_id, achievement_id);

-- Create user profiles table (extended profile settings)
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  is_public INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  total_checkmates INTEGER NOT NULL DEFAULT 0,
  quickest_win INTEGER,
  biggest_stake_win DECIMAL(12, 2) DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add constraint for streak values
ALTER TABLE user_profiles ADD CONSTRAINT current_streak_non_negative CHECK (current_streak >= 0);
ALTER TABLE user_profiles ADD CONSTRAINT longest_streak_non_negative CHECK (longest_streak >= 0);
ALTER TABLE user_profiles ADD CONSTRAINT total_checkmates_non_negative CHECK (total_checkmates >= 0);
ALTER TABLE user_profiles ADD CONSTRAINT quickest_win_positive CHECK (quickest_win IS NULL OR quickest_win > 0);
ALTER TABLE user_profiles ADD CONSTRAINT biggest_stake_win_non_negative CHECK (biggest_stake_win >= 0);
