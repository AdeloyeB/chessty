'use client';

import { useState } from 'react';
import type { DateRangePreset } from '@chess-game/shared';

interface DateRangePickerProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRange: (start: Date | null, end: Date | null) => void;
  formattedRange: string;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: '3months', label: '3 months' },
  { value: 'year', label: 'year' },
  { value: 'all', label: 'all time' },
];

export function DateRangePicker({
  preset,
  onPresetChange,
  onCustomRange,
  formattedRange,
}: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handlePresetClick = (newPreset: DateRangePreset) => {
    onPresetChange(newPreset);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    onCustomRange(start, end);
  };

  return (
    <div className="space-y-3">
      {/* Preset Buttons */}
      <div className="flex flex-wrap">
        {PRESETS.map(({ value, label }, index) => (
          <button
            key={value}
            onClick={() => handlePresetClick(value)}
            className={`px-3 py-1.5 font-mono text-xs transition-colors lowercase border border-white/15 ${
              index > 0 ? '-ml-px' : ''
            } ${
              preset === value && !showCustom
                ? 'bg-white text-black'
                : 'bg-black text-white/50 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-3 py-1.5 font-mono text-xs border border-white/15 -ml-px transition-colors lowercase ${
            preset === 'custom'
              ? 'bg-white text-black'
              : 'bg-black text-white/50 hover:text-white'
          }`}
        >
          custom
        </button>
      </div>

      {/* Custom Date Range Inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-3 bg-black border border-white/15">
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-white/50 lowercase">from:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-black border border-white/15 text-white font-mono text-sm focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-white/50 lowercase">to:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-black border border-white/15 text-white font-mono text-sm focus:border-white focus:outline-none"
            />
          </div>
          <button
            onClick={handleCustomApply}
            className="px-3 py-1 bg-white text-black font-mono text-sm hover:bg-white/90 transition-colors lowercase"
          >
            apply
          </button>
        </div>
      )}

      {/* Current Range Display */}
      <p className="text-xs font-mono text-white/50 lowercase">
        showing: <span className="text-white">{formattedRange}</span>
      </p>
    </div>
  );
}
