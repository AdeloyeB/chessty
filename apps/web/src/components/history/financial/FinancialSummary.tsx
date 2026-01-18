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
      <div className="p-6 bg-off-black border border-mid/30 animate-pulse">
        <div className="h-4 bg-mid/30 rounded w-32 mb-4" />
        <div className="grid grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-mid/30 rounded w-20 mb-2" />
              <div className="h-6 bg-mid/30 rounded w-24" />
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
    <div className="bg-off-black border border-mid/30">
      <div className="p-4 border-b border-mid/30">
        <p className="text-xs font-mono text-mid-light">financial_summary</p>
      </div>

      <div className="p-6">
        {/* Primary Metrics */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-xs font-mono text-mid-light mb-1">net_change</p>
            <p className={`text-2xl font-mono ${summary.netChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.netChange >= 0 ? '+' : '-'}${formatMoney(summary.netChange).value}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-mid-light mb-1">starting_bal</p>
            <p className="text-2xl font-mono text-pure-white">
              ${formatMoney(summary.startingBalance).value}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-mid-light mb-1">ending_bal</p>
            <p className="text-2xl font-mono text-pure-white">
              ${formatMoney(summary.endingBalance).value}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-6">
          {/* Game P&L */}
          <div className="p-4 bg-pure-black border border-mid/30 flex flex-col">
            <p className="text-xs font-mono text-mid-light mb-3">game_p&l</p>
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex justify-between">
                <span className="text-sm font-mono text-mid-light">games played</span>
                <span className="text-sm font-mono text-pure-white">{summary.totalGames}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-mono text-mid-light">winnings</span>
                <span className="text-sm font-mono text-green-400">
                  +${formatMoney(summary.gameWins).value}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-mono text-mid-light">losses</span>
                <span className="text-sm font-mono text-red-400">
                  -${formatMoney(summary.gameLosses).value}
                </span>
              </div>
              <div className="flex justify-between pt-2 mt-auto border-t border-mid/30">
                <span className="text-sm font-mono text-mid-light">profit</span>
                <span className={`text-sm font-mono ${summary.gameProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.gameProfit >= 0 ? '+' : '-'}${formatMoney(summary.gameProfit).value}
                </span>
              </div>
            </div>
          </div>

          {/* Deposits & Withdrawals */}
          <div className="p-4 bg-pure-black border border-mid/30 flex flex-col">
            <p className="text-xs font-mono text-mid-light mb-3">transfers</p>
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex justify-between">
                <span className="text-sm font-mono text-mid-light">deposits</span>
                <span className="text-sm font-mono text-green-400">
                  +${formatMoney(summary.deposits).value}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-mono text-mid-light">withdrawals</span>
                <span className="text-sm font-mono text-red-400">
                  -${formatMoney(summary.withdrawals).value}
                </span>
              </div>
              <div className="flex justify-between pt-2 mt-auto border-t border-mid/30">
                <span className="text-sm font-mono text-mid-light">net transfers</span>
                <span className={`text-sm font-mono ${summary.deposits - summary.withdrawals >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.deposits - summary.withdrawals >= 0 ? '+' : '-'}${formatMoney(summary.deposits - summary.withdrawals).value}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
