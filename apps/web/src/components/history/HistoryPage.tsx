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
import { OpeningsTab } from './openings/OpeningsTab';

type Tab = 'analytics' | 'games' | 'financial' | 'openings';

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
    <div className="border border-white/15">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/15">
        <div>
          <p className="text-xs font-mono text-white/50 lowercase">your_history</p>
          <h1 className="text-2xl font-mono text-white lowercase">game history</h1>
        </div>
        <ExportDropdown
          onExportGames={handleExportGames}
          onExportTransactions={handleExportTransactions}
          onExportBoth={handleExportBoth}
          isExporting={exportUtils.isExporting}
        />
      </div>

      {/* Date Range Picker */}
      <div className="bg-black p-4 border-b border-white/15">
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
      <div className="flex border-b border-white/15">
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
        <TabButton
          active={activeTab === 'openings'}
          onClick={() => setActiveTab('openings')}
        >
          openings
        </TabButton>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="p-4">
          <HistoryCharts />
        </div>
      )}

      {/* Games Tab */}
      {activeTab === 'games' && (
        <div>
          {/* Filters */}
          <div className="border-b border-white/15">
            <HistoryFilters
              filters={historyData.filters}
              onResultChange={historyData.setResultFilter}
              onTimeControlChange={historyData.setTimeControlFilter}
              onGameModeChange={historyData.setGameModeFilter}
              onReset={historyData.resetFilters}
            />
          </div>

          {/* Games Table */}
          <GamesTable
            games={historyData.games}
            isLoading={historyData.isLoadingGames}
            onGameClick={setSelectedGame}
          />

          {/* Pagination */}
          {!historyData.isLoadingGames && historyData.totalGames > 0 && (
            <div className="border-t border-white/15">
              <TablePagination
                page={historyData.page}
                totalPages={historyData.totalPages}
                totalItems={historyData.totalGames}
                onPageChange={historyData.setPage}
                onPrevPage={historyData.prevPage}
                onNextPage={historyData.nextPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Financial Tab */}
      {activeTab === 'financial' && (
        <div>
          <FinancialSummary
            summary={historyData.financialSummary}
            isLoading={historyData.isLoadingFinancial}
          />

          {/* Recent Transactions */}
          <div className="bg-black border-t border-white/15">
            <div className="p-4 border-b border-white/15">
              <p className="text-xs font-mono text-white/50 lowercase">recent_transactions</p>
            </div>
            <div>
              {historyData.isLoadingTransactions ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 border-b border-white/15">
                    <div className="h-4 bg-white/10 animate-pulse" />
                  </div>
                ))
              ) : historyData.transactions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-white/30 font-mono lowercase">no transactions found</p>
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

      {/* Openings Tab */}
      {activeTab === 'openings' && (
        <OpeningsTab
          games={historyData.allFilteredGames}
          isLoading={historyData.isLoadingAllGames}
        />
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
      className={`px-4 py-3 font-mono text-sm transition-all relative lowercase ${
        active
          ? 'text-white'
          : 'text-white/40 hover:text-white/70'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
      )}
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
    game_win: 'text-white',
    game_wager: 'text-white/50',
    deposit: 'text-white',
    withdrawal: 'text-white/50',
    bet_won: 'text-white',
    bet_lost: 'text-white/50',
    bet_placed: 'text-white/50',
    bet_refunded: 'text-white',
    bonus: 'text-usdc',
  };

  const typeLabels: Record<string, string> = {
    game_win: 'game win',
    game_wager: 'game wager',
    deposit: 'deposit',
    withdrawal: 'withdrawal',
    bet_won: 'bet won',
    bet_lost: 'bet lost',
    bet_placed: 'bet placed',
    bet_refunded: 'bet refunded',
    bonus: 'bonus',
  };

  return (
    <div className="grid grid-cols-4 gap-4 p-4 font-mono text-sm border-b border-white/15 last:border-b-0 hover:bg-white/5 transition-colors">
      <div className="text-white/30 lowercase">
        {formatDate(transaction.createdAt)}
      </div>
      <div className={typeColors[transaction.type] || 'text-white'}>
        {typeLabels[transaction.type] || transaction.type}
      </div>
      <div className={transaction.amount >= 0 ? 'text-white' : 'text-white/50'}>
        {transaction.amount >= 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
      </div>
      <div className="text-white/30 text-right lowercase">
        bal: ${transaction.balanceAfter.toFixed(2)}
      </div>
    </div>
  );
}
