'use client';

import type { FinancialSummary as FinancialSummaryType } from '@chess-game/shared';
import { USDCAmount } from '@/components/wallet/USDCAmount';

interface FinancialSummaryProps {
  summary: FinancialSummaryType | undefined;
  isLoading: boolean;
}

export function FinancialSummary({ summary, isLoading }: FinancialSummaryProps) {
  if (isLoading) {
    return (
      <div className="bg-black animate-pulse">
        <div className="p-4 border-b border-white/15">
          <div className="h-4 bg-white/10 w-32" />
        </div>
        <div className="grid grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`p-4 ${i < 2 ? 'border-r border-white/15' : ''}`}>
              <div className="h-3 bg-white/10 w-20 mb-2" />
              <div className="h-6 bg-white/10 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const formatMoney = (amount: number) => {
    const isPositive = amount >= 0;
    const formatted = Math.abs(amount).toFixed(2);
    return { value: formatted, isPositive };
  };

  return (
    <div className="bg-black">
      <div className="p-4 border-b border-white/15">
        <p className="text-xs font-mono text-white/50 lowercase">financial_summary</p>
      </div>

      {/* Primary Metrics - bento grid */}
      <div className="grid grid-cols-3 border-b border-white/15">
        <div className="p-4 border-r border-white/15">
          <p className="text-xs font-mono text-white/30 mb-1 lowercase">net_change</p>
          <p className={`text-2xl font-mono ${summary.netChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.netChange >= 0 ? '+' : '-'}${formatMoney(summary.netChange).value}
          </p>
        </div>
        <div className="p-4 border-r border-white/15">
          <p className="text-xs font-mono text-white/30 mb-1 lowercase">starting_bal</p>
          <p className="text-2xl font-mono text-white">
            ${formatMoney(summary.startingBalance).value}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-mono text-white/30 mb-1 lowercase">ending_bal</p>
          <p className="text-2xl font-mono text-white">
            ${formatMoney(summary.endingBalance).value}
          </p>
        </div>
      </div>

      {/* Breakdown - two columns with shared border */}
      <div className="grid grid-cols-2">
        {/* Game P&L */}
        <div className="p-4 border-r border-white/15 flex flex-col">
          <p className="text-xs font-mono text-white/50 mb-3 lowercase">game_p&l</p>
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex justify-between">
              <span className="text-sm font-mono text-white/30 lowercase">games played</span>
              <span className="text-sm font-mono text-white">{summary.totalGames}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-mono text-white/30 lowercase">winnings</span>
              <span className="text-sm font-mono text-green-400">
                +${formatMoney(summary.gameWins).value}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-mono text-white/30 lowercase">losses</span>
              <span className="text-sm font-mono text-red-400">
                -${formatMoney(summary.gameLosses).value}
              </span>
            </div>
            <div className="flex justify-between pt-2 mt-auto border-t border-white/15">
              <span className="text-sm font-mono text-white/30 lowercase">profit</span>
              <span className={`text-sm font-mono ${summary.gameProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.gameProfit >= 0 ? '+' : '-'}${formatMoney(summary.gameProfit).value}
              </span>
            </div>
          </div>
        </div>

        {/* Deposits & Withdrawals */}
        <div className="p-4 flex flex-col">
          <p className="text-xs font-mono text-white/50 mb-3 lowercase">transfers</p>
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex justify-between">
              <span className="text-sm font-mono text-white/30 lowercase">deposits</span>
              <span className="text-sm font-mono text-green-400">
                +${formatMoney(summary.deposits).value}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-mono text-white/30 lowercase">withdrawals</span>
              <span className="text-sm font-mono text-red-400">
                -${formatMoney(summary.withdrawals).value}
              </span>
            </div>
            <div className="flex justify-between pt-2 mt-auto border-t border-white/15">
              <span className="text-sm font-mono text-white/30 lowercase">net transfers</span>
              <span className={`text-sm font-mono ${summary.deposits - summary.withdrawals >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.deposits - summary.withdrawals >= 0 ? '+' : '-'}${formatMoney(summary.deposits - summary.withdrawals).value}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
