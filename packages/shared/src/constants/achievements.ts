// Achievement definitions with chess-themed retro aesthetic
// Categories: games, elo, streaks, special_moves, milestones

export type AchievementCategory = 'games' | 'elo' | 'streaks' | 'special_moves' | 'milestones';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string; // Chess piece or symbol
  requirement: number;
  hidden?: boolean; // Hidden until unlocked
}

export const ACHIEVEMENTS: Achievement[] = [
  // Games Played
  {
    id: 'first_game',
    name: 'First Move',
    description: 'Play your first game',
    category: 'games',
    icon: '♟',
    requirement: 1,
  },
  {
    id: 'games_10',
    name: 'Getting Started',
    description: 'Play 10 games',
    category: 'games',
    icon: '♟',
    requirement: 10,
  },
  {
    id: 'games_50',
    name: 'Regular Player',
    description: 'Play 50 games',
    category: 'games',
    icon: '♞',
    requirement: 50,
  },
  {
    id: 'games_100',
    name: 'Century Club',
    description: 'Play 100 games',
    category: 'games',
    icon: '♝',
    requirement: 100,
  },
  {
    id: 'games_500',
    name: 'Veteran',
    description: 'Play 500 games',
    category: 'games',
    icon: '♜',
    requirement: 500,
  },
  {
    id: 'games_1000',
    name: 'Grandmaster Grinder',
    description: 'Play 1000 games',
    category: 'games',
    icon: '♛',
    requirement: 1000,
  },

  // Wins
  {
    id: 'first_win',
    name: 'First Blood',
    description: 'Win your first game',
    category: 'games',
    icon: '⚔',
    requirement: 1,
  },
  {
    id: 'wins_10',
    name: 'Winning Ways',
    description: 'Win 10 games',
    category: 'games',
    icon: '⚔',
    requirement: 10,
  },
  {
    id: 'wins_50',
    name: 'Conqueror',
    description: 'Win 50 games',
    category: 'games',
    icon: '🏆',
    requirement: 50,
  },
  {
    id: 'wins_100',
    name: 'Champion',
    description: 'Win 100 games',
    category: 'games',
    icon: '👑',
    requirement: 100,
  },
  {
    id: 'wins_500',
    name: 'Dominator',
    description: 'Win 500 games',
    category: 'games',
    icon: '⭐',
    requirement: 500,
  },

  // ELO Milestones
  {
    id: 'elo_1200',
    name: 'Breaking Through',
    description: 'Reach 1200 ELO',
    category: 'elo',
    icon: '♞',
    requirement: 1200,
  },
  {
    id: 'elo_1400',
    name: 'Rising Star',
    description: 'Reach 1400 ELO',
    category: 'elo',
    icon: '♝',
    requirement: 1400,
  },
  {
    id: 'elo_1600',
    name: 'Club Player',
    description: 'Reach 1600 ELO',
    category: 'elo',
    icon: '♜',
    requirement: 1600,
  },
  {
    id: 'elo_1800',
    name: 'Expert Class',
    description: 'Reach 1800 ELO',
    category: 'elo',
    icon: '♛',
    requirement: 1800,
  },
  {
    id: 'elo_2000',
    name: 'Master Tier',
    description: 'Reach 2000 ELO',
    category: 'elo',
    icon: '♚',
    requirement: 2000,
  },
  {
    id: 'elo_2200',
    name: 'Grandmaster Status',
    description: 'Reach 2200 ELO',
    category: 'elo',
    icon: '💎',
    requirement: 2200,
  },
  {
    id: 'elo_2500',
    name: 'Legendary',
    description: 'Reach 2500 ELO',
    category: 'elo',
    icon: '🌟',
    requirement: 2500,
  },

  // Streaks
  {
    id: 'streak_3',
    name: 'Hot Streak',
    description: 'Win 3 games in a row',
    category: 'streaks',
    icon: '🔥',
    requirement: 3,
  },
  {
    id: 'streak_5',
    name: 'On Fire',
    description: 'Win 5 games in a row',
    category: 'streaks',
    icon: '🔥',
    requirement: 5,
  },
  {
    id: 'streak_10',
    name: 'Unstoppable',
    description: 'Win 10 games in a row',
    category: 'streaks',
    icon: '💥',
    requirement: 10,
  },
  {
    id: 'streak_20',
    name: 'Invincible',
    description: 'Win 20 games in a row',
    category: 'streaks',
    icon: '⚡',
    requirement: 20,
    hidden: true,
  },

  // Special Moves / Checkmates
  {
    id: 'checkmate_10',
    name: 'Checkmate Artist',
    description: 'Deliver 10 checkmates',
    category: 'special_moves',
    icon: '♚',
    requirement: 10,
  },
  {
    id: 'checkmate_50',
    name: 'Execution Expert',
    description: 'Deliver 50 checkmates',
    category: 'special_moves',
    icon: '⚔',
    requirement: 50,
  },
  {
    id: 'checkmate_100',
    name: 'Finishing Master',
    description: 'Deliver 100 checkmates',
    category: 'special_moves',
    icon: '💀',
    requirement: 100,
  },

  // Milestones / Special
  {
    id: 'first_wager',
    name: 'Skin in the Game',
    description: 'Play your first wagered game',
    category: 'milestones',
    icon: '💰',
    requirement: 1,
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    description: 'Win a game with 100+ USDC wager',
    category: 'milestones',
    icon: '💎',
    requirement: 100,
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'Win after being down significant material',
    category: 'milestones',
    icon: '🔄',
    requirement: 1,
    hidden: true,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Win a game in under 20 moves',
    category: 'milestones',
    icon: '⚡',
    requirement: 1,
  },
];

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function getAchievementsByCategory(category: AchievementCategory): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.category === category);
}

export function getVisibleAchievements(): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !a.hidden);
}
