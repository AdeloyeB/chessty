/**
 * Generic CSV export utilities
 */

export interface CSVColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => string | number);
}

/**
 * Convert data array to CSV string
 */
export function toCSV<T extends Record<string, any>>(
  data: T[],
  columns: CSVColumn<T>[]
): string {
  const headers = columns.map(col => escapeCSVField(col.header));
  const headerRow = headers.join(',');

  const dataRows = data.map(row => {
    return columns.map(col => {
      let value: string | number;
      if (typeof col.accessor === 'function') {
        value = col.accessor(row);
      } else {
        value = row[col.accessor] as string | number;
      }
      return escapeCSVField(String(value ?? ''));
    }).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Escape a field for CSV format
 * - Wrap in quotes if contains comma, newline, or quote
 * - Double any existing quotes
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Download CSV file in browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date for CSV export (ISO UTC format)
 */
export function formatDateForCSV(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Format duration in seconds to readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Format currency amount
 */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}
