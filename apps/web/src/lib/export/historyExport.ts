/**
 * History-specific export formatting
 */

import type { HistoryGame, HistoryTransaction, GameExportRow, TransactionExportRow } from '@chess-game/shared';
import { toCSV, downloadCSV, formatDateForCSV, formatDuration, formatAmount, type CSVColumn } from './csvExporter';

/**
 * Export game history to CSV
 */
export function exportGamesToCSV(games: HistoryGame[], filename: string = 'game_history.csv'): void {
  const columns: CSVColumn<GameExportRow>[] = [
    { header: 'Date (UTC)', accessor: 'date' },
    { header: 'Opponent', accessor: 'opponent' },
    { header: 'Opponent ELO', accessor: 'opponentElo' },
    { header: 'Your ELO', accessor: 'yourElo' },
    { header: 'Result', accessor: 'result' },
    { header: 'Result Detail', accessor: 'resultDetail' },
    { header: 'Game Mode', accessor: 'gameMode' },
    { header: 'Time Control', accessor: 'timeControl' },
    { header: 'Wager (USDC)', accessor: 'wager' },
    { header: 'Profit/Loss (USDC)', accessor: 'profit' },
    { header: 'ELO Change', accessor: 'eloChange' },
    { header: 'Opening', accessor: 'opening' },
    { header: 'Moves', accessor: 'moves' },
    { header: 'Duration', accessor: 'duration' },
    { header: 'Game ID', accessor: 'gameId' },
  ];

  const rows: GameExportRow[] = games.map(game => {
    let profit = 0;
    if (game.result === 'win') profit = game.wagerAmount;
    else if (game.result === 'loss') profit = -game.wagerAmount;

    return {
      date: formatDateForCSV(game.endedAt),
      opponent: game.opponent.username,
      opponentElo: game.opponentEloAtStart,
      yourElo: game.eloAtStart,
      result: game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw',
      resultDetail: formatResultDetail(game.resultDetail),
      gameMode: game.gameMode === 'chess960' ? 'Chess960' : 'Standard',
      timeControl: game.timeControlLabel,
      wager: parseFloat(formatAmount(game.wagerAmount)),
      profit: parseFloat(formatAmount(profit)),
      eloChange: game.eloChange,
      opening: game.opening || 'Unknown',
      moves: game.moveCount,
      duration: formatDuration(game.duration),
      gameId: game.id,
    };
  });

  const csv = toCSV(rows, columns);
  downloadCSV(csv, filename);
}

/**
 * Export transactions to CSV
 */
export function exportTransactionsToCSV(
  transactions: HistoryTransaction[],
  filename: string = 'transactions.csv'
): void {
  const columns: CSVColumn<TransactionExportRow>[] = [
    { header: 'Date (UTC)', accessor: 'date' },
    { header: 'Type', accessor: 'type' },
    { header: 'Amount (USDC)', accessor: 'amount' },
    { header: 'Balance After (USDC)', accessor: 'balance' },
    { header: 'Reference', accessor: 'reference' },
    { header: 'Description', accessor: 'description' },
  ];

  const rows: TransactionExportRow[] = transactions.map(tx => ({
    date: formatDateForCSV(tx.createdAt),
    type: formatTransactionType(tx.type),
    amount: parseFloat(formatAmount(tx.amount)),
    balance: parseFloat(formatAmount(tx.balanceAfter)),
    reference: tx.referenceId || '',
    description: tx.description || '',
  }));

  const csv = toCSV(rows, columns);
  downloadCSV(csv, filename);
}

/**
 * Format game result detail for display
 */
function formatResultDetail(result: string | null): string {
  if (!result) return '';

  const details: Record<string, string> = {
    white_wins: 'White wins',
    black_wins: 'Black wins',
    draw: 'Draw',
    stalemate: 'Stalemate',
    timeout: 'Timeout',
    resignation: 'Resignation',
    abandonment: 'Abandonment',
  };

  return details[result] || result;
}

/**
 * Format transaction type for display
 */
function formatTransactionType(type: string): string {
  const types: Record<string, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    bet_placed: 'Bet Placed',
    bet_won: 'Bet Won',
    bet_lost: 'Bet Lost',
    bet_refunded: 'Bet Refunded',
    game_wager: 'Game Wager',
    game_win: 'Game Win',
    bonus: 'Bonus',
  };

  return types[type] || type;
}

/**
 * Generate filename with date range
 */
export function generateExportFilename(
  prefix: string,
  startDate?: Date | null,
  endDate?: Date | null
): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const now = new Date();

  let suffix = formatDate(now);
  if (startDate && endDate) {
    suffix = `${formatDate(startDate)}_to_${formatDate(endDate)}`;
  } else if (startDate) {
    suffix = `from_${formatDate(startDate)}`;
  }

  return `${prefix}_${suffix}.csv`;
}
