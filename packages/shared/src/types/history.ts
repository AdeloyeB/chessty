import { z } from 'zod';
import type { GameMode, GameResult, GameStatus, PublicUser, Move, TransactionType } from './index';

// Date range for filtering
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

// History filters
export interface HistoryFilters {
  dateRange: DateRange;
  result: 'all' | 'win' | 'loss' | 'draw';
  timeControl: 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical';
  gameMode: 'all' | GameMode;
  minStake?: number;
  maxStake?: number;
}

// Enhanced game with opponent info for history display
export interface HistoryGame {
  id: string;
  opponent: PublicUser;
  playerColor: 'white' | 'black';
  result: 'win' | 'loss' | 'draw';
  resultDetail: GameResult | null;
  gameMode: GameMode;
  timeControlInitial: number;
  timeControlIncrement: number;
  timeControlLabel: string;
  stakeAmount: number;
  totalPot: number;
  eloChange: number;
  eloAtStart: number;
  opponentEloAtStart: number;
  opening: string | null;
  moveCount: number;
  moves: Move[];
  pgn: string;
  startingFen: string;
  endedAt: Date;
  duration: number; // in seconds
}

// History statistics
export interface HistoryStats {
  // Overall
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;

  // Financial
  totalWagered: number;
  totalWon: number;
  totalLost: number;
  netProfit: number;
  roi: number; // Return on investment percentage
  biggestWin: number;
  biggestLoss: number;

  // ELO
  currentElo: number;
  peakElo: number;
  eloChange: number; // Net change in period
  averageOpponentElo: number;

  // Performance by time control
  bulletStats: { games: number; winRate: number };
  blitzStats: { games: number; winRate: number };
  rapidStats: { games: number; winRate: number };
  classicalStats: { games: number; winRate: number };

  // Streaks
  currentStreak: number; // positive = winning, negative = losing
  longestWinStreak: number;
  longestLossStreak: number;

  // Time-based
  averageGameDuration: number; // in seconds
  mostActiveDay: string; // day of week
  mostActiveHour: number; // 0-23
}

// Financial summary for date range
export interface FinancialSummary {
  dateRange: DateRange;
  totalGames: number;

  // Game P&L
  gameWins: number;
  gameLosses: number;
  gameProfit: number;

  // Transaction breakdown
  deposits: number;
  withdrawals: number;

  // Net
  netChange: number;
  startingBalance: number;
  endingBalance: number;
}

// Transaction with enhanced info
export interface HistoryTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
  // Enhanced fields from join
  gameInfo?: {
    id: string;
    opponent: string;
    result: 'win' | 'loss' | 'draw';
  };
}

// Pagination
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

// API response types
export interface HistoryGameListResponse extends PaginatedResponse<HistoryGame> {}
export interface HistoryTransactionListResponse extends PaginatedResponse<HistoryTransaction> {}

// Export types for CSV
export interface GameExportRow {
  date: string; // ISO UTC
  opponent: string;
  opponentElo: number;
  yourElo: number;
  result: 'Win' | 'Loss' | 'Draw';
  resultDetail: string;
  gameMode: string;
  timeControl: string;
  stake: number;
  profit: number;
  eloChange: number;
  opening: string;
  moves: number;
  duration: string; // formatted
  gameId: string;
}

export interface TransactionExportRow {
  date: string; // ISO UTC
  type: string;
  amount: number;
  balance: number;
  reference: string;
  description: string;
}

// Move viewer state
export interface MoveViewerState {
  currentMoveIndex: number;
  isPlaying: boolean;
  playbackSpeed: number; // moves per second
}

// Time control categories
export type TimeControlCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';

export function getTimeControlCategory(initial: number): TimeControlCategory {
  if (initial < 180) return 'bullet';
  if (initial < 600) return 'blitz';
  if (initial < 1800) return 'rapid';
  return 'classical';
}

export function getTimeControlLabel(initial: number, increment: number): string {
  const minutes = Math.floor(initial / 60);
  if (increment > 0) {
    return `${minutes}+${increment}`;
  }
  return `${minutes} min`;
}

// Date range presets
export type DateRangePreset = 'today' | 'week' | 'month' | '3months' | 'year' | 'all' | 'custom';

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { start: startOfToday, end: null };
    case 'week': {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: weekAgo, end: null };
    }
    case 'month': {
      const monthAgo = new Date(startOfToday);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { start: monthAgo, end: null };
    }
    case '3months': {
      const threeMonthsAgo = new Date(startOfToday);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return { start: threeMonthsAgo, end: null };
    }
    case 'year': {
      const yearAgo = new Date(startOfToday);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      return { start: yearAgo, end: null };
    }
    case 'all':
    case 'custom':
    default:
      return { start: null, end: null };
  }
}
