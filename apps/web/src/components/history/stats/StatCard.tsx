'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  trendValue,
  highlight = 'neutral',
  size = 'md',
  className = '',
}: StatCardProps) {
  // Main value colors - green/red for positive/negative, white for neutral
  const highlightColors = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-white',
  };

  // Trend indicator colors - green for up, red for down
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-white/30',
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
    <div className={`p-4 bg-black ${className}`}>
      <p className={`font-mono ${sizes[size].label} text-white/50 mb-1 lowercase`}>
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
        <p className={`font-mono ${sizes[size].sub} text-white/30 mt-1 lowercase`}>
          {subValue}
        </p>
      )}
    </div>
  );
}
