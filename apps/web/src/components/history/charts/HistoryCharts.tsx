'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const MOCK_ELO_HISTORY = [
  { date: 'Jan 1', elo: 1200 },
  { date: 'Jan 8', elo: 1245 },
  { date: 'Jan 15', elo: 1220 },
  { date: 'Jan 22', elo: 1280 },
  { date: 'Jan 29', elo: 1310 },
  { date: 'Feb 5', elo: 1290 },
  { date: 'Feb 12', elo: 1350 },
  { date: 'Feb 19', elo: 1380 },
  { date: 'Feb 26', elo: 1420 },
  { date: 'Mar 4', elo: 1400 },
  { date: 'Mar 11', elo: 1450 },
  { date: 'Mar 18', elo: 1520 },
  { date: 'Mar 25', elo: 1480 },
  { date: 'Apr 1', elo: 1550 },
  { date: 'Apr 8', elo: 1620 },
  { date: 'Apr 15', elo: 1680 },
  { date: 'Apr 22', elo: 1720 },
  { date: 'Apr 29', elo: 1750 },
  { date: 'May 6', elo: 1790 },
  { date: 'May 13', elo: 1847 },
];

const MOCK_PROFIT_HISTORY = [
  { date: 'Jan', profit: -50, cumulative: -50 },
  { date: 'Feb', profit: 120, cumulative: 70 },
  { date: 'Mar', profit: -30, cumulative: 40 },
  { date: 'Apr', profit: 200, cumulative: 240 },
  { date: 'May', profit: 180, cumulative: 420 },
  { date: 'Jun', profit: -80, cumulative: 340 },
  { date: 'Jul', profit: 150, cumulative: 490 },
  { date: 'Aug', profit: 220, cumulative: 710 },
  { date: 'Sep', profit: -40, cumulative: 670 },
  { date: 'Oct', profit: 310, cumulative: 980 },
  { date: 'Nov', profit: 180, cumulative: 1160 },
  { date: 'Dec', profit: 240, cumulative: 1400 },
];

const MOCK_GAMES_BY_DAY = [
  { day: 'Mon', games: 12, wins: 7 },
  { day: 'Tue', games: 8, wins: 4 },
  { day: 'Wed', games: 15, wins: 10 },
  { day: 'Thu', games: 6, wins: 3 },
  { day: 'Fri', games: 18, wins: 11 },
  { day: 'Sat', games: 24, wins: 15 },
  { day: 'Sun', games: 20, wins: 12 },
];

const MOCK_WIN_LOSS_DRAW = [
  { name: 'Wins', value: 198, color: '#ffffff' },
  { name: 'Losses', value: 127, color: '#666666' },
  { name: 'Draws', value: 17, color: '#333333' },
];

const MOCK_TIME_CONTROL_PERFORMANCE = [
  { name: 'Bullet', games: 89, winRate: 52, avgElo: 1720 },
  { name: 'Blitz', games: 156, winRate: 58, avgElo: 1810 },
  { name: 'Rapid', games: 78, winRate: 62, avgElo: 1890 },
  { name: 'Classical', games: 19, winRate: 68, avgElo: 1950 },
];

const MOCK_HOURLY_ACTIVITY = [
  { hour: '00', games: 2 }, { hour: '02', games: 1 }, { hour: '04', games: 0 },
  { hour: '06', games: 3 }, { hour: '08', games: 8 }, { hour: '10', games: 15 },
  { hour: '12', games: 22 }, { hour: '14', games: 28 }, { hour: '16', games: 35 },
  { hour: '18', games: 42 }, { hour: '20', games: 38 }, { hour: '22', games: 18 },
];
// ============================================================================

const CHART_COLORS = {
  primary: '#ffffff',
  secondary: '#666666',
  accent: '#999999',
  grid: '#333333',
  background: '#0a0a0a',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-off-black border border-mid/50 p-3 font-mono text-xs">
        <p className="text-mid-light mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color || CHART_COLORS.primary }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function HistoryCharts() {
  return (
    <div className="space-y-6">
      {/* Top Row - ELO and W/L/D */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EloProgressionChart />
        </div>
        <div>
          <WinLossDrawChart />
        </div>
      </div>

      {/* Middle Row - Profit and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProfitChart />
        <GamesPerDayChart />
      </div>

      {/* Bottom Row - Time Control and Hourly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeControlChart />
        <HourlyActivityChart />
      </div>
    </div>
  );
}

function EloProgressionChart() {
  const data = MOCK_ELO_HISTORY;
  const minElo = Math.min(...data.map(d => d.elo)) - 50;
  const maxElo = Math.max(...data.map(d => d.elo)) + 50;

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-mono text-mid-light">elo_progression</p>
          <p className="text-lg font-mono text-pure-white">Rating Over Time</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-mid-light">Start: <span className="text-pure-white">1200</span></span>
          <span className="text-mid-light">Current: <span className="text-pure-white">1847</span></span>
          <span className="text-green-400">+647</span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minElo, maxElo]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="elo"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              fill="url(#eloGradient)"
              name="ELO"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WinLossDrawChart() {
  const data = MOCK_WIN_LOSS_DRAW;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-off-black border border-mid/30 p-4 h-full">
      <div className="mb-4">
        <p className="text-xs font-mono text-mid-light">results_breakdown</p>
        <p className="text-lg font-mono text-pure-white">Win/Loss/Draw</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-2">
        {data.map((entry) => (
          <div key={entry.name} className="text-center">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3" style={{ backgroundColor: entry.color }} />
              <span className="text-xs font-mono text-mid-light">{entry.name}</span>
            </div>
            <p className="text-sm font-mono text-pure-white">{entry.value}</p>
            <p className="text-xs font-mono text-mid">{Math.round((entry.value / total) * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfitChart() {
  const data = MOCK_PROFIT_HISTORY;

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-mono text-mid-light">profit_loss</p>
          <p className="text-lg font-mono text-pure-white">Monthly P&L</p>
        </div>
        <div className="text-xs font-mono">
          <span className="text-mid-light">Total: </span>
          <span className="text-green-400">+$1,400</span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              width={40}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="profit"
              name="Profit"
              fill={CHART_COLORS.primary}
              radius={[2, 2, 0, 0]}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.profit >= 0 ? '#ffffff' : '#666666'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GamesPerDayChart() {
  const data = MOCK_GAMES_BY_DAY;

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-mono text-mid-light">activity</p>
          <p className="text-lg font-mono text-pure-white">Games by Day</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-pure-white" /> Games
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-mid" /> Wins
          </span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="games" name="Games" fill={CHART_COLORS.primary} radius={[2, 2, 0, 0]} />
            <Bar dataKey="wins" name="Wins" fill={CHART_COLORS.secondary} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TimeControlChart() {
  const data = MOCK_TIME_CONTROL_PERFORMANCE;

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      <div className="mb-4">
        <p className="text-xs font-mono text-mid-light">time_control</p>
        <p className="text-lg font-mono text-pure-white">Performance by Format</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 60, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="winRate"
              name="Win Rate"
              fill={CHART_COLORS.primary}
              radius={[0, 2, 2, 0]}
              label={{
                position: 'right',
                fill: CHART_COLORS.secondary,
                fontSize: 10,
                formatter: (value) => `${value}%`
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4">
        {data.map((tc) => (
          <div key={tc.name} className="text-center">
            <p className="text-xs font-mono text-mid-light">{tc.games} games</p>
            <p className="text-xs font-mono text-mid">avg {tc.avgElo}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HourlyActivityChart() {
  const data = MOCK_HOURLY_ACTIVITY;
  const maxGames = Math.max(...data.map(d => d.games));

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      <div className="mb-4">
        <p className="text-xs font-mono text-mid-light">hourly_activity</p>
        <p className="text-lg font-mono text-pure-white">Games by Hour</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#666666" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#666666" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              tickFormatter={(value) => `${value}:00`}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_COLORS.secondary, fontSize: 10 }}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="games"
              stroke={CHART_COLORS.secondary}
              strokeWidth={2}
              fill="url(#hourlyGradient)"
              name="Games"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-2 text-xs font-mono text-mid-light">
        <span>Peak: 18:00 ({data.find(d => d.games === maxGames)?.games} games)</span>
        <span>Total: {data.reduce((sum, d) => sum + d.games, 0)} games</span>
      </div>
    </div>
  );
}
