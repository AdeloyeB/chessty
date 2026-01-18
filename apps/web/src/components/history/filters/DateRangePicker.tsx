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
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: '3months', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
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
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handlePresetClick(value)}
            className={`px-3 py-1.5 font-mono text-sm border transition-colors ${
              preset === value && !showCustom
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-pure-black text-mid-light border-mid/30 hover:border-pure-white hover:text-pure-white'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-3 py-1.5 font-mono text-sm border transition-colors ${
            preset === 'custom'
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black text-mid-light border-mid/30 hover:border-pure-white hover:text-pure-white'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Custom Date Range Inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-3 bg-pure-black border border-mid/30">
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-mid-light">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-off-black border border-mid/30 text-pure-white font-mono text-sm focus:border-pure-white focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-mid-light">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-off-black border border-mid/30 text-pure-white font-mono text-sm focus:border-pure-white focus:outline-none"
            />
          </div>
          <button
            onClick={handleCustomApply}
            className="px-3 py-1 bg-pure-white text-pure-black font-mono text-sm hover:bg-off-white transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Current Range Display */}
      <p className="text-xs font-mono text-mid-light">
        Showing: <span className="text-pure-white">{formattedRange}</span>
      </p>
    </div>
  );
}
