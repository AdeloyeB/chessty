'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  trendValue,
  highlight = 'neutral',
  size = 'md',
}: StatCardProps) {
  const highlightColors = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-pure-white',
  };

  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-mid-light',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  const sizes = {
    sm: { value: 'text-lg', label: 'text-xs', sub: 'text-xs' },
    md: { value: 'text-2xl', label: 'text-xs', sub: 'text-xs' },
    lg: { value: 'text-3xl', label: 'text-sm', sub: 'text-sm' },
  };

  return (
    <div className="p-4 bg-pure-black border border-mid/30">
      <p className={`font-mono ${sizes[size].label} text-mid-light mb-1`}>
        {label}
      </p>
      <div className="flex items-end gap-2">
        <p className={`font-mono font-medium ${sizes[size].value} ${highlightColors[highlight]}`}>
          {value}
        </p>
        {trend && trendValue && (
          <span className={`font-mono ${sizes[size].sub} ${trendColors[trend]} flex items-center gap-0.5`}>
            <span>{trendIcons[trend]}</span>
            <span>{trendValue}</span>
          </span>
        )}
      </div>
      {subValue && (
        <p className={`font-mono ${sizes[size].sub} text-mid-light mt-1`}>
          {subValue}
        </p>
      )}
    </div>
  );
}
