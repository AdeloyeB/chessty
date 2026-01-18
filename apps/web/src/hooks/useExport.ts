'use client';

import { useState, useCallback } from 'react';
import type { HistoryGame, HistoryTransaction, DateRange } from '@chess-game/shared';
import { exportGamesToCSV, exportTransactionsToCSV, generateExportFilename } from '@/lib/export/historyExport';

interface UseExportReturn {
  isExporting: boolean;
  exportGames: (games: HistoryGame[], dateRange?: DateRange) => void;
  exportTransactions: (transactions: HistoryTransaction[], dateRange?: DateRange) => void;
  exportBoth: (games: HistoryGame[], transactions: HistoryTransaction[], dateRange?: DateRange) => void;
}

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportGames = useCallback((games: HistoryGame[], dateRange?: DateRange) => {
    setIsExporting(true);
    try {
      const filename = generateExportFilename('games', dateRange?.start, dateRange?.end);
      exportGamesToCSV(games, filename);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportTransactions = useCallback((transactions: HistoryTransaction[], dateRange?: DateRange) => {
    setIsExporting(true);
    try {
      const filename = generateExportFilename('transactions', dateRange?.start, dateRange?.end);
      exportTransactionsToCSV(transactions, filename);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportBoth = useCallback((
    games: HistoryGame[],
    transactions: HistoryTransaction[],
    dateRange?: DateRange
  ) => {
    setIsExporting(true);
    try {
      const gamesFilename = generateExportFilename('games', dateRange?.start, dateRange?.end);
      const transactionsFilename = generateExportFilename('transactions', dateRange?.start, dateRange?.end);

      exportGamesToCSV(games, gamesFilename);
      // Small delay between downloads to avoid browser blocking
      setTimeout(() => {
        exportTransactionsToCSV(transactions, transactionsFilename);
        setIsExporting(false);
      }, 500);
    } catch {
      setIsExporting(false);
    }
  }, []);

  return {
    isExporting,
    exportGames,
    exportTransactions,
    exportBoth,
  };
}
