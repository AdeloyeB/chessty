'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './useApi';
import { useDateRange } from './useDateRange';
import type { HistoryFilters, HistoryGame, HistoryStats, HistoryTransaction, FinancialSummary, DateRangePreset, Move } from '@chess-game/shared';
import { detectOpening } from '@/lib/history/openingDetector';

// ============================================================================
// MOCK DATA - Comprehensive mock data for development
// ============================================================================

const MOCK_OPPONENTS = [
  { id: 'opp1', username: 'GrandMaster_X', eloRating: 2450, peakEloRating: 2520, gamesPlayed: 1247, gamesWon: 892, gamesLost: 298, gamesDraw: 57 },
  { id: 'opp2', username: 'KnightRider99', eloRating: 2280, peakEloRating: 2340, gamesPlayed: 856, gamesWon: 512, gamesLost: 301, gamesDraw: 43 },
  { id: 'opp3', username: 'QueenGambit', eloRating: 2190, peakEloRating: 2250, gamesPlayed: 634, gamesWon: 378, gamesLost: 224, gamesDraw: 32 },
  { id: 'opp4', username: 'BishopSlayer', eloRating: 2150, peakEloRating: 2180, gamesPlayed: 423, gamesWon: 245, gamesLost: 156, gamesDraw: 22 },
  { id: 'opp5', username: 'PawnStorm', eloRating: 2080, peakEloRating: 2120, gamesPlayed: 312, gamesWon: 167, gamesLost: 128, gamesDraw: 17 },
  { id: 'opp6', username: 'RookieKing', eloRating: 1950, peakEloRating: 2010, gamesPlayed: 198, gamesWon: 98, gamesLost: 89, gamesDraw: 11 },
  { id: 'opp7', username: 'CastleMaster', eloRating: 1870, peakEloRating: 1920, gamesPlayed: 156, gamesWon: 72, gamesLost: 76, gamesDraw: 8 },
  { id: 'opp8', username: 'EnPassant_Pro', eloRating: 2320, peakEloRating: 2380, gamesPlayed: 987, gamesWon: 623, gamesLost: 312, gamesDraw: 52 },
  { id: 'opp9', username: 'CheckmateChamp', eloRating: 2410, peakEloRating: 2450, gamesPlayed: 1123, gamesWon: 756, gamesLost: 312, gamesDraw: 55 },
  { id: 'opp10', username: 'SicilianDefender', eloRating: 2050, peakEloRating: 2100, gamesPlayed: 267, gamesWon: 134, gamesLost: 118, gamesDraw: 15 },
  { id: 'opp11', username: 'FrenchAttack', eloRating: 1980, peakEloRating: 2040, gamesPlayed: 189, gamesWon: 92, gamesLost: 87, gamesDraw: 10 },
  { id: 'opp12', username: 'LondonSystem', eloRating: 2220, peakEloRating: 2270, gamesPlayed: 567, gamesWon: 334, gamesLost: 198, gamesDraw: 35 },
  { id: 'opp13', username: 'CaroKann_King', eloRating: 2100, peakEloRating: 2140, gamesPlayed: 345, gamesWon: 178, gamesLost: 145, gamesDraw: 22 },
  { id: 'opp14', username: 'IndianDefense', eloRating: 2340, peakEloRating: 2390, gamesPlayed: 892, gamesWon: 534, gamesLost: 312, gamesDraw: 46 },
  { id: 'opp15', username: 'ScandinavianPro', eloRating: 1920, peakEloRating: 1980, gamesPlayed: 234, gamesWon: 112, gamesLost: 108, gamesDraw: 14 },
];

const OPENINGS = [
  'Italian Game', 'Ruy Lopez', 'Sicilian Najdorf', 'Sicilian Dragon', 'French Defense',
  'Caro-Kann Defense', "Queen's Gambit Declined", 'King\'s Indian Defense', 'Nimzo-Indian Defense',
  'English Opening', 'London System', 'Scotch Game', 'Petrov Defense', 'Grunfeld Defense',
  'Dutch Defense', 'Pirc Defense', 'Alekhine\'s Defense', 'Scandinavian Defense', 'Vienna Game',
  'Four Knights Game', 'Italian Game', 'Ruy Lopez', 'Sicilian Defense', 'French Winawer',
];

const TIME_CONTROLS = [
  { initial: 60, increment: 0, label: '1 min' },
  { initial: 180, increment: 0, label: '3 min' },
  { initial: 180, increment: 2, label: '3+2' },
  { initial: 300, increment: 0, label: '5 min' },
  { initial: 300, increment: 3, label: '5+3' },
  { initial: 600, increment: 0, label: '10 min' },
  { initial: 600, increment: 5, label: '10+5' },
  { initial: 900, increment: 0, label: '15 min' },
  { initial: 1800, increment: 0, label: '30 min' },
];

const RESULTS: Array<'win' | 'loss' | 'draw'> = ['win', 'win', 'win', 'loss', 'loss', 'draw'];
const RESULT_DETAILS = ['white_wins', 'black_wins', 'resignation', 'timeout', 'checkmate', 'stalemate'];

// Generate realistic mock moves
function generateMockMoves(count: number): Move[] {
  const moves: Move[] = [];
  const sampleMoves = [
    { san: 'e4', from: 'e2', to: 'e4' },
    { san: 'e5', from: 'e7', to: 'e5' },
    { san: 'Nf3', from: 'g1', to: 'f3' },
    { san: 'Nc6', from: 'b8', to: 'c6' },
    { san: 'Bb5', from: 'f1', to: 'b5' },
    { san: 'a6', from: 'a7', to: 'a6' },
    { san: 'Ba4', from: 'b5', to: 'a4' },
    { san: 'Nf6', from: 'g8', to: 'f6' },
    { san: 'O-O', from: 'e1', to: 'g1' },
    { san: 'Be7', from: 'f8', to: 'e7' },
    { san: 'Re1', from: 'f1', to: 'e1' },
    { san: 'b5', from: 'b7', to: 'b5' },
    { san: 'Bb3', from: 'a4', to: 'b3' },
    { san: 'd6', from: 'd7', to: 'd6' },
    { san: 'c3', from: 'c2', to: 'c3' },
    { san: 'O-O', from: 'e8', to: 'g8' },
    { san: 'h3', from: 'h2', to: 'h3' },
    { san: 'Nb8', from: 'c6', to: 'b8' },
    { san: 'd4', from: 'd2', to: 'd4' },
    { san: 'Nbd7', from: 'b8', to: 'd7' },
    { san: 'Nbd2', from: 'b1', to: 'd2' },
    { san: 'Bb7', from: 'c8', to: 'b7' },
    { san: 'Bc2', from: 'b3', to: 'c2' },
    { san: 'Re8', from: 'f8', to: 'e8' },
    { san: 'Nf1', from: 'd2', to: 'f1' },
    { san: 'Bf8', from: 'e7', to: 'f8' },
    { san: 'Ng3', from: 'f1', to: 'g3' },
    { san: 'g6', from: 'g7', to: 'g6' },
    { san: 'a4', from: 'a2', to: 'a4' },
    { san: 'c5', from: 'c7', to: 'c5' },
  ];

  for (let i = 0; i < count && i < sampleMoves.length; i++) {
    moves.push({
      ...sampleMoves[i],
      fen: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - ${i} ${Math.floor(i / 2) + 1}`,
      timestamp: Date.now() - (count - i) * 30000,
    });
  }
  return moves;
}

// Generate mock games
function generateMockGames(count: number, userElo: number): HistoryGame[] {
  const games: HistoryGame[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const opponent = MOCK_OPPONENTS[i % MOCK_OPPONENTS.length];
    const result = RESULTS[i % RESULTS.length];
    const timeControl = TIME_CONTROLS[i % TIME_CONTROLS.length];
    const isWhite = i % 2 === 0;
    const moveCount = 20 + Math.floor(Math.random() * 60);
    const wagerAmount = [10, 25, 50, 100, 250, 500][i % 6];

    let eloChange = Math.floor(Math.random() * 20) + 5;
    if (result === 'loss') eloChange = -eloChange;
    else if (result === 'draw') eloChange = 0;

    const gameDate = new Date(now - i * 3600000 * (2 + Math.random() * 10));
    const duration = 120 + Math.floor(Math.random() * 1800);

    games.push({
      id: `game_${i}_${Date.now()}`,
      opponent,
      playerColor: isWhite ? 'white' : 'black',
      result,
      resultDetail: result === 'draw' ? 'stalemate' : (result === 'win' ? (isWhite ? 'white_wins' : 'black_wins') : (isWhite ? 'black_wins' : 'white_wins')),
      gameMode: i % 7 === 0 ? 'chess960' : 'standard',
      timeControlInitial: timeControl.initial,
      timeControlIncrement: timeControl.increment,
      timeControlLabel: timeControl.label,
      wagerAmount,
      totalPot: wagerAmount * 2,
      eloChange,
      eloAtStart: userElo - eloChange,
      opponentEloAtStart: opponent.eloRating,
      opening: OPENINGS[i % OPENINGS.length],
      moveCount,
      moves: generateMockMoves(moveCount),
      pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7`,
      startingFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      endedAt: gameDate,
      duration,
    });
  }

  return games;
}

// Generate mock stats
function generateMockStats(userElo: number): HistoryStats {
  return {
    totalGames: 247,
    wins: 142,
    losses: 89,
    draws: 16,
    winRate: 57,

    totalWagered: 18450,
    totalWon: 21320,
    totalLost: 15890,
    netProfit: 2870,
    roi: 16,
    biggestWin: 500,
    biggestLoss: 250,

    currentElo: userElo,
    peakElo: userElo + 180,
    eloChange: 124,
    averageOpponentElo: 2089,

    bulletStats: { games: 45, winRate: 62 },
    blitzStats: { games: 98, winRate: 58 },
    rapidStats: { games: 78, winRate: 54 },
    classicalStats: { games: 26, winRate: 50 },

    currentStreak: 4,
    longestWinStreak: 12,
    longestLossStreak: 5,

    averageGameDuration: 487,
    mostActiveDay: 'Sat',
    mostActiveHour: 21,
  };
}

// Generate mock transactions
function generateMockTransactions(count: number): HistoryTransaction[] {
  const transactions: HistoryTransaction[] = [];
  const now = Date.now();
  let balance = 1000;

  const types = [
    { type: 'game_win', amountRange: [20, 1000] },
    { type: 'game_wager', amountRange: [-500, -10] },
    { type: 'deposit', amountRange: [100, 1000] },
    { type: 'withdrawal', amountRange: [-500, -100] },
    { type: 'bet_won', amountRange: [10, 200] },
    { type: 'bet_lost', amountRange: [-100, -5] },
  ];

  for (let i = 0; i < count; i++) {
    const typeInfo = types[i % types.length];
    const amount = typeInfo.amountRange[0] + Math.random() * (typeInfo.amountRange[1] - typeInfo.amountRange[0]);
    balance = Math.max(0, balance + amount);

    transactions.push({
      id: `tx_${i}_${Date.now()}`,
      type: typeInfo.type as any,
      amount: Math.round(amount * 100) / 100,
      balanceAfter: Math.round(balance * 100) / 100,
      referenceId: typeInfo.type.includes('game') ? `game_ref_${i}` : null,
      description: getTransactionDescription(typeInfo.type, i),
      createdAt: new Date(now - i * 1800000 * (1 + Math.random() * 3)),
    });
  }

  return transactions;
}

function getTransactionDescription(type: string, index: number): string {
  const opponents = MOCK_OPPONENTS.map(o => o.username);
  switch (type) {
    case 'game_win':
      return `Won vs ${opponents[index % opponents.length]}`;
    case 'game_wager':
      return `Wager for game vs ${opponents[index % opponents.length]}`;
    case 'deposit':
      return 'USDC Deposit';
    case 'withdrawal':
      return 'USDC Withdrawal';
    case 'bet_won':
      return `Bet won on ${opponents[index % opponents.length]}`;
    case 'bet_lost':
      return `Bet lost on ${opponents[index % opponents.length]}`;
    default:
      return 'Transaction';
  }
}

// Generate mock financial summary
function generateMockFinancialSummary(): FinancialSummary {
  return {
    dateRange: { start: null, end: null },
    totalGames: 247,
    gameWins: 21320,
    gameLosses: 15890,
    gameProfit: 5430,
    deposits: 5000,
    withdrawals: 2130,
    netChange: 2870,
    startingBalance: 1000,
    endingBalance: 3870,
  };
}

// ============================================================================
// END MOCK DATA
// ============================================================================

interface UseHistoryDataOptions {
  initialPreset?: DateRangePreset;
  pageSize?: number;
  useMockData?: boolean;
}

interface UseHistoryDataReturn {
  // Data
  games: HistoryGame[];
  stats: HistoryStats | undefined;
  transactions: HistoryTransaction[];
  financialSummary: FinancialSummary | undefined;

  // Loading states
  isLoadingGames: boolean;
  isLoadingStats: boolean;
  isLoadingTransactions: boolean;
  isLoadingFinancial: boolean;

  // Pagination
  page: number;
  totalGames: number;
  totalPages: number;
  hasMore: boolean;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;

  // Filters
  filters: HistoryFilters;
  setResultFilter: (result: HistoryFilters['result']) => void;
  setTimeControlFilter: (tc: HistoryFilters['timeControl']) => void;
  setGameModeFilter: (mode: HistoryFilters['gameMode']) => void;
  setWagerRange: (min?: number, max?: number) => void;
  resetFilters: () => void;

  // Date range
  dateRange: ReturnType<typeof useDateRange>;

  // Refetch
  refetchAll: () => void;
}

const DEFAULT_FILTERS: HistoryFilters = {
  dateRange: { start: null, end: null },
  result: 'all',
  timeControl: 'all',
  gameMode: 'all',
};

// Use mock data in development or when API fails
const USE_MOCK_DATA = true; // Toggle this for development

export function useHistoryData({
  initialPreset = 'all',
  pageSize = 20,
  useMockData = USE_MOCK_DATA,
}: UseHistoryDataOptions = {}): UseHistoryDataReturn {
  const api = useApi();
  const dateRange = useDateRange(initialPreset);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Omit<HistoryFilters, 'dateRange'>>({
    result: 'all',
    timeControl: 'all',
    gameMode: 'all',
  });

  // Mock data (generated once)
  const mockData = useMemo(() => {
    const userElo = 2150;
    const allGames = generateMockGames(87, userElo);
    return {
      games: allGames,
      stats: generateMockStats(userElo),
      transactions: generateMockTransactions(150),
      financialSummary: generateMockFinancialSummary(),
    };
  }, []);

  // Combine filters with date range
  const fullFilters = useMemo<HistoryFilters>(() => ({
    ...filters,
    dateRange: dateRange.dateRange,
  }), [filters, dateRange.dateRange]);

  // Apply filters to mock data
  const filteredMockGames = useMemo(() => {
    if (!useMockData) return [];

    let filtered = [...mockData.games];

    // Result filter
    if (filters.result !== 'all') {
      filtered = filtered.filter(g => g.result === filters.result);
    }

    // Time control filter
    if (filters.timeControl !== 'all') {
      filtered = filtered.filter(g => {
        const category = g.timeControlInitial < 180 ? 'bullet' :
          g.timeControlInitial < 600 ? 'blitz' :
          g.timeControlInitial < 1800 ? 'rapid' : 'classical';
        return category === filters.timeControl;
      });
    }

    // Game mode filter
    if (filters.gameMode !== 'all') {
      filtered = filtered.filter(g => g.gameMode === filters.gameMode);
    }

    return filtered;
  }, [useMockData, mockData.games, filters]);

  // Paginated mock games
  const paginatedMockGames = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMockGames.slice(start, start + pageSize);
  }, [filteredMockGames, page, pageSize]);

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(1), []);

  // Games query (falls back to mock data)
  const gamesQuery = useQuery({
    queryKey: ['historyGames', fullFilters, page, pageSize, useMockData],
    queryFn: async () => {
      if (useMockData) {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 300));
        return {
          data: paginatedMockGames,
          total: filteredMockGames.length,
          hasMore: page * pageSize < filteredMockGames.length,
        };
      }

      try {
        const result = await api.getGameHistoryFiltered(fullFilters, pageSize, (page - 1) * pageSize);
        const enhancedGames = result.data.map(game => ({
          ...game,
          opening: game.opening || detectOpening(game.moves),
        }));
        return { ...result, data: enhancedGames };
      } catch {
        // Fall back to mock data on error
        return {
          data: paginatedMockGames,
          total: filteredMockGames.length,
          hasMore: page * pageSize < filteredMockGames.length,
        };
      }
    },
  });

  // Stats query
  const statsQuery = useQuery({
    queryKey: ['historyStats', dateRange.dateRange, useMockData],
    queryFn: async () => {
      if (useMockData) {
        await new Promise(r => setTimeout(r, 200));
        return mockData.stats;
      }
      try {
        return await api.getHistoryStats(dateRange.dateRange);
      } catch {
        return mockData.stats;
      }
    },
  });

  // Transactions query
  const transactionsQuery = useQuery({
    queryKey: ['historyTransactions', dateRange.dateRange, useMockData],
    queryFn: async () => {
      if (useMockData) {
        await new Promise(r => setTimeout(r, 250));
        return { data: mockData.transactions, total: mockData.transactions.length, hasMore: false };
      }
      try {
        return await api.getTransactionsFiltered(dateRange.dateRange, 100, 0);
      } catch {
        return { data: mockData.transactions, total: mockData.transactions.length, hasMore: false };
      }
    },
  });

  // Financial summary query
  const financialQuery = useQuery({
    queryKey: ['financialSummary', dateRange.dateRange, useMockData],
    queryFn: async () => {
      if (useMockData) {
        await new Promise(r => setTimeout(r, 200));
        return mockData.financialSummary;
      }
      try {
        return await api.getFinancialSummary(dateRange.dateRange);
      } catch {
        return mockData.financialSummary;
      }
    },
  });

  // Filter setters
  const setResultFilter = useCallback((result: HistoryFilters['result']) => {
    setFilters(prev => ({ ...prev, result }));
    resetPage();
  }, [resetPage]);

  const setTimeControlFilter = useCallback((timeControl: HistoryFilters['timeControl']) => {
    setFilters(prev => ({ ...prev, timeControl }));
    resetPage();
  }, [resetPage]);

  const setGameModeFilter = useCallback((gameMode: HistoryFilters['gameMode']) => {
    setFilters(prev => ({ ...prev, gameMode }));
    resetPage();
  }, [resetPage]);

  const setWagerRange = useCallback((minWager?: number, maxWager?: number) => {
    setFilters(prev => ({ ...prev, minWager, maxWager }));
    resetPage();
  }, [resetPage]);

  const resetFilters = useCallback(() => {
    setFilters({
      result: 'all',
      timeControl: 'all',
      gameMode: 'all',
    });
    dateRange.clearRange();
    resetPage();
  }, [dateRange, resetPage]);

  // Pagination
  const totalGames = gamesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalGames / pageSize);
  const hasMore = gamesQuery.data?.hasMore ?? false;

  const nextPage = useCallback(() => {
    if (page < totalPages) setPage(p => p + 1);
  }, [page, totalPages]);

  const prevPage = useCallback(() => {
    if (page > 1) setPage(p => p - 1);
  }, [page]);

  // Refetch all
  const refetchAll = useCallback(() => {
    gamesQuery.refetch();
    statsQuery.refetch();
    transactionsQuery.refetch();
    financialQuery.refetch();
  }, [gamesQuery, statsQuery, transactionsQuery, financialQuery]);

  return {
    // Data
    games: gamesQuery.data?.data ?? [],
    stats: statsQuery.data,
    transactions: transactionsQuery.data?.data ?? [],
    financialSummary: financialQuery.data,

    // Loading states
    isLoadingGames: gamesQuery.isLoading,
    isLoadingStats: statsQuery.isLoading,
    isLoadingTransactions: transactionsQuery.isLoading,
    isLoadingFinancial: financialQuery.isLoading,

    // Pagination
    page,
    totalGames,
    totalPages,
    hasMore,
    setPage,
    nextPage,
    prevPage,

    // Filters
    filters: fullFilters,
    setResultFilter,
    setTimeControlFilter,
    setGameModeFilter,
    setWagerRange,
    resetFilters,

    // Date range
    dateRange,

    // Refetch
    refetchAll,
  };
}
