// Chess-themed ranking tiers with retro arcade aesthetic
// Each rank has an ELO range, display name, and badge identifier

export interface RankTier {
  id: string;
  name: string;
  minElo: number;
  maxElo: number;
  description: string;
  color: string; // For badge accent
}

export const RANK_TIERS: RankTier[] = [
  {
    id: 'pawn',
    name: 'Pawn',
    minElo: 0,
    maxElo: 999,
    description: 'Every grandmaster was once a pawn',
    color: '#6B7280', // gray
  },
  {
    id: 'squire',
    name: 'Squire',
    minElo: 1000,
    maxElo: 1199,
    description: 'Learning the ways of the board',
    color: '#78716C', // stone
  },
  {
    id: 'knight',
    name: 'Knight',
    minElo: 1200,
    maxElo: 1399,
    description: 'Cunning moves in unexpected directions',
    color: '#A1A1AA', // zinc
  },
  {
    id: 'bishop',
    name: 'Bishop',
    minElo: 1400,
    maxElo: 1599,
    description: 'Diagonal dominance achieved',
    color: '#7C3AED', // violet
  },
  {
    id: 'rook',
    name: 'Rook',
    minElo: 1600,
    maxElo: 1799,
    description: 'A fortress of strategic power',
    color: '#2563EB', // blue
  },
  {
    id: 'queen',
    name: 'Queen',
    minElo: 1800,
    maxElo: 1999,
    description: 'Ruling the board with authority',
    color: '#DC2626', // red
  },
  {
    id: 'king',
    name: 'King',
    minElo: 2000,
    maxElo: 2199,
    description: 'The crown sits heavy, but earned',
    color: '#F59E0B', // amber
  },
  {
    id: 'grandmaster',
    name: 'Grandmaster',
    minElo: 2200,
    maxElo: 2499,
    description: 'Elite mastery of the 64 squares',
    color: '#FBBF24', // yellow/gold
  },
  {
    id: 'legend',
    name: 'Legend',
    minElo: 2500,
    maxElo: 9999,
    description: 'Immortalized in chess history',
    color: '#E5E5E5', // platinum/white
  },
];

export function getRankTier(elo: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) {
      return RANK_TIERS[i];
    }
  }
  return RANK_TIERS[0];
}

export function getNextRankTier(elo: number): RankTier | null {
  const currentTier = getRankTier(elo);
  const currentIndex = RANK_TIERS.findIndex((t) => t.id === currentTier.id);
  if (currentIndex < RANK_TIERS.length - 1) {
    return RANK_TIERS[currentIndex + 1];
  }
  return null;
}

export function getProgressToNextRank(elo: number): number {
  const currentTier = getRankTier(elo);
  const nextTier = getNextRankTier(elo);
  if (!nextTier) return 100; // Already at max rank

  const tierRange = nextTier.minElo - currentTier.minElo;
  const progress = elo - currentTier.minElo;
  return Math.min(100, Math.floor((progress / tierRange) * 100));
}
