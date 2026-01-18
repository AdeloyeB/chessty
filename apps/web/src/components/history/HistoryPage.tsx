'use client';

import { useState } from 'react';
import type { HistoryGame } from '@chess-game/shared';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useExport } from '@/hooks/useExport';
import { HistoryStats } from './stats/HistoryStats';
import { DateRangePicker } from './filters/DateRangePicker';
import { HistoryFilters } from './filters/HistoryFilters';
import { GamesTable } from './table/GamesTable';
import { TablePagination } from './table/TablePagination';
import { FinancialSummary } from './financial/FinancialSummary';
import { GameDetailDrawer } from './detail/GameDetailDrawer';
import { ExportDropdown } from './export/ExportDropdown';
import { HistoryCharts } from './charts/HistoryCharts';

type Tab = 'analytics' | 'games' | 'financial';

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('analytics');
  const [selectedGame, setSelectedGame] = useState<HistoryGame | null>(null);

  const historyData = useHistoryData({ initialPreset: 'all', pageSize: 20 });
  const exportUtils = useExport();

  const handleExportGames = () => {
    exportUtils.exportGames(historyData.games, historyData.dateRange.dateRange);
  };

  const handleExportTransactions = () => {
    exportUtils.exportTransactions(historyData.transactions, historyData.dateRange.dateRange);
  };

  const handleExportBoth = () => {
    exportUtils.exportBoth(
      historyData.games,
      historyData.transactions,
      historyData.dateRange.dateRange
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-mid-light">your_history</p>
          <h1 className="text-2xl font-mono text-pure-white">Game History</h1>
        </div>
        <ExportDropdown
          onExportGames={handleExportGames}
          onExportTransactions={handleExportTransactions}
          onExportBoth={handleExportBoth}
          isExporting={exportUtils.isExporting}
        />
      </div>

      {/* Date Range Picker */}
      <div className="bg-off-black border border-mid/30 p-4">
        <DateRangePicker
          preset={historyData.dateRange.preset}
          onPresetChange={historyData.dateRange.setPreset}
          onCustomRange={historyData.dateRange.setCustomRange}
          formattedRange={historyData.dateRange.formattedRange}
        />
      </div>

      {/* Stats Overview */}
      <HistoryStats
        stats={historyData.stats}
        isLoading={historyData.isLoadingStats}
      />

      {/* Tabs */}
      <div className="flex gap-4 border-b border-mid/30">
        <TabButton
          active={activeTab === 'analytics'}
          onClick={() => setActiveTab('analytics')}
        >
          analytics
        </TabButton>
        <TabButton
          active={activeTab === 'games'}
          onClick={() => setActiveTab('games')}
        >
          games
        </TabButton>
        <TabButton
          active={activeTab === 'financial'}
          onClick={() => setActiveTab('financial')}
        >
          financial
        </TabButton>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <HistoryCharts />
      )}

      {/* Games Tab */}
      {activeTab === 'games' && (
        <div className="space-y-4">
          {/* Filters */}
          <HistoryFilters
            filters={historyData.filters}
            onResultChange={historyData.setResultFilter}
            onTimeControlChange={historyData.setTimeControlFilter}
            onGameModeChange={historyData.setGameModeFilter}
            onReset={historyData.resetFilters}
          />

          {/* Games Table */}
          <GamesTable
            games={historyData.games}
            isLoading={historyData.isLoadingGames}
            onGameClick={setSelectedGame}
          />

          {/* Pagination */}
          {!historyData.isLoadingGames && historyData.totalGames > 0 && (
            <TablePagination
              page={historyData.page}
              totalPages={historyData.totalPages}
              totalItems={historyData.totalGames}
              onPageChange={historyData.setPage}
              onPrevPage={historyData.prevPage}
              onNextPage={historyData.nextPage}
            />
          )}
        </div>
      )}

      {/* Financial Tab */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          <FinancialSummary
            summary={historyData.financialSummary}
            isLoading={historyData.isLoadingFinancial}
          />

          {/* Recent Transactions */}
          <div className="bg-off-black border border-mid/30">
            <div className="p-4 border-b border-mid/30">
              <p className="text-xs font-mono text-mid-light">recent_transactions</p>
            </div>
            <div className="divide-y divide-mid/20">
              {historyData.isLoadingTransactions ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="p-4">
                    <div className="h-4 bg-mid/30 rounded animate-pulse" />
                  </div>
                ))
              ) : historyData.transactions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-mid-light font-mono">no transactions found</p>
                </div>
              ) : (
                historyData.transactions.slice(0, 20).map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game Detail Drawer */}
      <GameDetailDrawer
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 font-mono text-sm transition-colors border-b-2 -mb-[1px] ${
        active
          ? 'text-pure-white border-pure-white'
          : 'text-mid-light border-transparent hover:text-pure-white'
      }`}
    >
      {children}
    </button>
  );
}

function TransactionRow({ transaction }: { transaction: any }) {
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const typeColors: Record<string, string> = {
    game_win: 'text-green-400',
    game_stake: 'text-red-400',
    deposit: 'text-green-400',
    withdrawal: 'text-red-400',
    bet_won: 'text-green-400',
    bet_lost: 'text-red-400',
    bonus: 'text-usdc',
  };

  const typeLabels: Record<string, string> = {
    game_win: 'Game Win',
    game_stake: 'Game Stake',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    bet_won: 'Bet Won',
    bet_lost: 'Bet Lost',
    bet_placed: 'Bet Placed',
    bet_refunded: 'Bet Refunded',
    bonus: 'Bonus',
  };

  return (
    <div className="grid grid-cols-4 gap-4 p-4 font-mono text-sm">
      <div className="text-mid-light">
        {formatDate(transaction.createdAt)}
      </div>
      <div className={typeColors[transaction.type] || 'text-pure-white'}>
        {typeLabels[transaction.type] || transaction.type}
      </div>
      <div className={transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
        {transaction.amount >= 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
      </div>
      <div className="text-mid-light text-right">
        bal: ${transaction.balanceAfter.toFixed(2)}
      </div>
    </div>
  );
}
