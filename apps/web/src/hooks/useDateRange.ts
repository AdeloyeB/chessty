'use client';

import { useState, useCallback, useMemo } from 'react';
import type { DateRange, DateRangePreset } from '@chess-game/shared';
import { getDateRangeFromPreset } from '@chess-game/shared';

interface UseDateRangeReturn {
  dateRange: DateRange;
  preset: DateRangePreset;
  setPreset: (preset: DateRangePreset) => void;
  setCustomRange: (start: Date | null, end: Date | null) => void;
  clearRange: () => void;
  isCustom: boolean;
  formattedRange: string;
}

export function useDateRange(initialPreset: DateRangePreset = 'all'): UseDateRangeReturn {
  const [preset, setPresetState] = useState<DateRangePreset>(initialPreset);
  const [customRange, setCustomRangeState] = useState<DateRange>({ start: null, end: null });

  const dateRange = useMemo(() => {
    if (preset === 'custom') {
      return customRange;
    }
    return getDateRangeFromPreset(preset);
  }, [preset, customRange]);

  const setPreset = useCallback((newPreset: DateRangePreset) => {
    setPresetState(newPreset);
    if (newPreset !== 'custom') {
      setCustomRangeState({ start: null, end: null });
    }
  }, []);

  const setCustomRange = useCallback((start: Date | null, end: Date | null) => {
    setPresetState('custom');
    setCustomRangeState({ start, end });
  }, []);

  const clearRange = useCallback(() => {
    setPresetState('all');
    setCustomRangeState({ start: null, end: null });
  }, []);

  const formattedRange = useMemo(() => {
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (preset === 'all') return 'All time';
    if (preset === 'today') return 'Today';
    if (preset === 'week') return 'Last 7 days';
    if (preset === 'month') return 'Last 30 days';
    if (preset === '3months') return 'Last 3 months';
    if (preset === 'year') return 'Last year';

    if (dateRange.start && dateRange.end) {
      return `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    }
    if (dateRange.start) {
      return `From ${formatDate(dateRange.start)}`;
    }
    if (dateRange.end) {
      return `Until ${formatDate(dateRange.end)}`;
    }

    return 'All time';
  }, [preset, dateRange]);

  return {
    dateRange,
    preset,
    setPreset,
    setCustomRange,
    clearRange,
    isCustom: preset === 'custom',
    formattedRange,
  };
}
