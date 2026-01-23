'use client';

import React from 'react';
import { getRankTier, type RankTier } from '@chess-game/shared';

interface RankBadgeProps {
  elo: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  showElo?: boolean;
}

const sizeConfig = {
  sm: { badge: 32, icon: 16, text: 'text-xs' },
  md: { badge: 48, icon: 24, text: 'text-sm' },
  lg: { badge: 64, icon: 32, text: 'text-base' },
  xl: { badge: 96, icon: 48, text: 'text-lg' },
};

// Chess piece SVG paths for each rank
const rankIcons: Record<string, (color: string) => React.JSX.Element> = {
  pawn: (color) => (
    <path
      d="M22 9c-1.5 0-3 .5-4 1.5-1-1-2.5-1.5-4-1.5s-3 .5-4 1.5c-1-1-2.5-1.5-4-1.5v3c1 0 2 .5 2.5 1.5.5 1 .5 2 0 3-.5 1-1.5 1.5-2.5 1.5v3h20v-3c-1 0-2-.5-2.5-1.5-.5-1-.5-2 0-3 .5-1 1.5-1.5 2.5-1.5V9zM12 6a3 3 0 100-6 3 3 0 000 6z"
      fill={color}
      transform="scale(0.8) translate(3, 3)"
    />
  ),
  squire: (color) => (
    <g transform="scale(0.75) translate(4, 4)">
      <path
        d="M12 2L4 8v10h16V8l-8-6zm0 3l5 3.75V16H7V8.75L12 5z"
        fill={color}
      />
      <circle cx="12" cy="12" r="2" fill={color} />
    </g>
  ),
  knight: (color) => (
    <path
      d="M19 22H5v-2h14v2zM13 2v2h1.5l-.75 1.5L16 7l-2 2 1 3-2-1-2 1 1-3-2-2 2.25-1.5L12 4h1.5V2h-.5zm1.75 6.25L16 7l-1.5 1.5.25-.25z"
      fill={color}
      transform="scale(0.85) translate(2, 2)"
    />
  ),
  bishop: (color) => (
    <g transform="scale(0.8) translate(3, 2)">
      <path
        d="M12 2c1.1 0 2 .9 2 2 0 .7-.4 1.4-1 1.7V7h1l2 3-3 3h-2l-3-3 2-3h1V5.7c-.6-.3-1-1-1-1.7 0-1.1.9-2 2-2z"
        fill={color}
      />
      <path d="M9 13h6l1 5H8l1-5z" fill={color} />
      <path d="M7 19h10v2H7v-2z" fill={color} />
    </g>
  ),
  rook: (color) => (
    <g transform="scale(0.8) translate(3, 2)">
      <path d="M5 3h2v2h2V3h2v2h2V3h2v2h2v3H5V5h0V3z" fill={color} />
      <path d="M6 8h12v2l-2 2v6H8v-6L6 10V8z" fill={color} />
      <path d="M5 19h14v2H5v-2z" fill={color} />
    </g>
  ),
  queen: (color) => (
    <g transform="scale(0.8) translate(3, 2)">
      <circle cx="12" cy="3" r="2" fill={color} />
      <path
        d="M4 6l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3v4l-3 2v6H7v-6l-3-2V6z"
        fill={color}
      />
      <path d="M6 19h12v2H6v-2z" fill={color} />
    </g>
  ),
  king: (color) => (
    <g transform="scale(0.8) translate(3, 2)">
      <path d="M11 1h2v3h3v2h-3v3h-2V6H8V4h3V1z" fill={color} />
      <path
        d="M6 10c0-1.5 2.5-3 6-3s6 1.5 6 3v2l-2 1v5H8v-5l-2-1v-2z"
        fill={color}
      />
      <path d="M5 19h14v2H5v-2z" fill={color} />
    </g>
  ),
  grandmaster: (color) => (
    <g transform="scale(0.8) translate(3, 2)">
      <path d="M11 0h2v2h2v2h-2v2h-2V4H9V2h2V0z" fill={color} />
      <circle cx="12" cy="8" r="2" fill={color} />
      <path
        d="M5 11c0-1.5 3-3 7-3s7 1.5 7 3v2l-3 1v4H8v-4l-3-1v-2z"
        fill={color}
      />
      <path d="M4 19h16v2H4v-2z" fill={color} />
      <circle cx="6" cy="8" r="1.5" fill={color} />
      <circle cx="18" cy="8" r="1.5" fill={color} />
    </g>
  ),
  legend: (color) => (
    <g transform="scale(0.75) translate(4, 3)">
      <path d="M12 0l2.5 7.5H22l-6 4.5 2.5 7.5-6.5-5-6.5 5 2.5-7.5-6-4.5h7.5L12 0z" fill={color} />
      <path d="M11 1h2v2h2v2h-2v2h-2V5H9V3h2V1z" fill={color} opacity="0.5" />
    </g>
  ),
};

function RankIcon({ tier, size }: { tier: RankTier; size: number }) {
  const iconFn = rankIcons[tier.id];
  if (!iconFn) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {iconFn(tier.color)}
    </svg>
  );
}

export function RankBadge({ elo, size = 'md', showLabel = true, showElo = false }: RankBadgeProps) {
  const safeElo = elo ?? 1200;
  const tier = getRankTier(safeElo);
  const config = sizeConfig[size];

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative flex items-center justify-center bg-pure-black border-2 transition-all"
        style={{
          width: config.badge,
          height: config.badge,
          borderColor: tier.color,
          boxShadow: `0 0 ${size === 'xl' ? '12px' : '8px'} ${tier.color}40`,
        }}
      >
        <RankIcon tier={tier} size={config.icon} />
        {/* Corner accents for larger sizes */}
        {(size === 'lg' || size === 'xl') && (
          <>
            <div
              className="absolute top-0 left-0 w-2 h-2"
              style={{ borderTop: `2px solid ${tier.color}`, borderLeft: `2px solid ${tier.color}` }}
            />
            <div
              className="absolute top-0 right-0 w-2 h-2"
              style={{ borderTop: `2px solid ${tier.color}`, borderRight: `2px solid ${tier.color}` }}
            />
            <div
              className="absolute bottom-0 left-0 w-2 h-2"
              style={{ borderBottom: `2px solid ${tier.color}`, borderLeft: `2px solid ${tier.color}` }}
            />
            <div
              className="absolute bottom-0 right-0 w-2 h-2"
              style={{ borderBottom: `2px solid ${tier.color}`, borderRight: `2px solid ${tier.color}` }}
            />
          </>
        )}
      </div>
      {(showLabel || showElo) && (
        <div className="flex flex-col">
          {showLabel && (
            <span className={`font-mono text-pure-white ${config.text}`}>
              {tier.name}
            </span>
          )}
          {showElo && (
            <span className={`font-mono text-mid-light ${config.text}`}>
              {safeElo} ELO
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function RankBadgeCompact({ elo }: { elo: number }) {
  const safeElo = elo ?? 1200;
  const tier = getRankTier(safeElo);
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-pure-black border font-mono text-xs"
      style={{ borderColor: tier.color }}
    >
      <RankIcon tier={tier} size={12} />
      <span style={{ color: tier.color }}>{tier.name}</span>
    </div>
  );
}
