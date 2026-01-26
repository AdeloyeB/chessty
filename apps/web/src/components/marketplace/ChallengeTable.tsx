'use client';

import type { ChallengeWithCreator } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';

interface EnhancedChallenge extends ChallengeWithCreator {
  winProb: number;
  eloChange: { win: number; loss: number };
  riskPercent: number;
  eloDiff: number;
  creatorWinRate: number;
}

interface ChallengeTableProps {
  challenges: EnhancedChallenge[];
  userBalance: number;
  userElo: number;
  onAccept: (challengeId: string) => void;
  sortBy: 'wager' | 'elo' | 'time' | 'winProb';
  sortDir: 'asc' | 'desc';
  onSort: (column: 'wager' | 'elo' | 'time' | 'winProb') => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 inline-block ${active ? 'text-pure-white' : 'text-mid/50'}`}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function RiskBadge({ percent }: { percent: number }) {
  let color = 'text-green-400 bg-green-400/10';
  let label = 'low';

  if (percent > 50) {
    color = 'text-red-400 bg-red-400/10';
    label = 'high';
  } else if (percent > 25) {
    color = 'text-yellow-400 bg-yellow-400/10';
    label = 'med';
  }

  return (
    <span className={`text-xs font-mono px-2 py-0.5 ${color}`}>
      {label}
    </span>
  );
}

function WinProbIndicator({ prob }: { prob: number }) {
  const color = prob >= 60 ? 'text-green-400' :
                prob >= 45 ? 'text-yellow-400' :
                'text-red-400';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-pure-black border border-mid/30 overflow-hidden">
        <div
          className={`h-full ${prob >= 50 ? 'bg-green-400' : 'bg-red-400'}`}
          style={{ width: `${prob}%` }}
        />
      </div>
      <span className={`font-mono text-sm ${color}`}>{prob}%</span>
    </div>
  );
}

export function ChallengeTable({
  challenges,
  userBalance,
  userElo,
  onAccept,
  sortBy,
  sortDir,
  onSort,
}: ChallengeTableProps) {
  if (challenges.length === 0) {
    return (
      <div className="bg-off-black border border-mid/30 p-12 text-center">
        <p className="text-2xl mb-2">&#9812;</p>
        <p className="text-mid-light font-mono">no games available</p>
        <p className="text-xs text-mid font-mono mt-1">create a game to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-off-black border border-mid/30 overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 p-4 bg-pure-black border-b border-mid/30 text-xs font-mono text-mid-light">
        <div className="col-span-3">opponent</div>
        <button
          className="col-span-2 text-left hover:text-pure-white transition-colors flex items-center"
          onClick={() => onSort('wager')}
        >
          wager
          <SortIcon active={sortBy === 'wager'} dir={sortDir} />
        </button>
        <button
          className="col-span-1 text-left hover:text-pure-white transition-colors flex items-center"
          onClick={() => onSort('time')}
        >
          time
          <SortIcon active={sortBy === 'time'} dir={sortDir} />
        </button>
        <button
          className="col-span-2 text-left hover:text-pure-white transition-colors flex items-center"
          onClick={() => onSort('winProb')}
        >
          win_odds
          <SortIcon active={sortBy === 'winProb'} dir={sortDir} />
        </button>
        <div className="col-span-2">elo_change</div>
        <div className="col-span-2 text-right">action</div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-mid/20">
        {challenges.map((challenge) => {
          const timeControl = CHALLENGE_TIME_CONTROLS[
            challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS
          ];
          const canAfford = userBalance >= challenge.wagerAmount;
          const isHigherRated = challenge.creator.eloRating > userElo;

          return (
            <div
              key={challenge.id}
              className={`grid grid-cols-12 gap-4 p-4 hover:bg-pure-black/50 transition-colors ${
                !canAfford ? 'opacity-50' : ''
              }`}
            >
              {/* Opponent Info */}
              <div className="col-span-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-pure-white flex items-center justify-center text-pure-black font-mono">
                    {challenge.creator.username[0].toLowerCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-pure-white font-mono text-sm truncate">
                        {challenge.creator.username}
                      </p>
                      {challenge.gameMode === 'chess960' && (
                        <span className="text-xs font-mono text-usdc bg-usdc/10 px-1.5 py-0.5 shrink-0">
                          960
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className={isHigherRated ? 'text-red-400' : 'text-green-400'}>
                        {challenge.creator.eloRating}
                      </span>
                      <span className="text-mid/50">|</span>
                      <span className="text-mid-light">
                        {challenge.creatorWinRate}% WR
                      </span>
                      <span className="text-mid/50">|</span>
                      <span className="text-mid-light">
                        {challenge.creator.gamesPlayed} games
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stake */}
              <div className="col-span-2 flex flex-col justify-center">
                <USDCAmount amount={challenge.wagerAmount} size="sm" />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono text-mid-light">
                    {challenge.riskPercent.toFixed(1)}% of bal
                  </span>
                  <RiskBadge percent={challenge.riskPercent} />
                </div>
              </div>

              {/* Time Control */}
              <div className="col-span-1 flex flex-col justify-center">
                <span className="text-pure-white font-mono text-sm">
                  {timeControl?.label || challenge.timeControlKey}
                </span>
                <span className="text-xs font-mono text-mid-light">
                  {timeControl?.increment ? `+${timeControl.increment}s` : 'no inc'}
                </span>
              </div>

              {/* Win Probability */}
              <div className="col-span-2 flex flex-col justify-center">
                <WinProbIndicator prob={challenge.winProb} />
                <span className="text-xs font-mono text-mid-light mt-1">
                  {challenge.eloDiff > 0 ? '+' : ''}{challenge.eloDiff} ELO diff
                </span>
              </div>

              {/* Expected ELO Change */}
              <div className="col-span-2 flex flex-col justify-center">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-xs font-mono text-mid-light">W: </span>
                    <span className="text-green-400 font-mono text-sm">
                      +{challenge.eloChange.win}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-mid-light">L: </span>
                    <span className="text-red-400 font-mono text-sm">
                      {challenge.eloChange.loss}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono text-mid-light mt-1">
                  pot: <USDCAmount amount={challenge.wagerAmount * 2} size="sm" className="inline" />
                </span>
              </div>

              {/* Action */}
              <div className="col-span-2 flex items-center justify-end">
                {canAfford ? (
                  <button
                    onClick={() => onAccept(challenge.id)}
                    className="px-4 py-2 bg-pure-white text-pure-black font-mono text-sm hover:bg-off-white transition-colors"
                  >
                    accept
                  </button>
                ) : (
                  <span className="text-xs font-mono text-mid-light">
                    need <USDCAmount amount={challenge.wagerAmount - userBalance} size="sm" className="inline" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table Footer - Summary */}
      <div className="grid grid-cols-12 gap-4 p-4 bg-pure-black border-t border-mid/30 text-xs font-mono text-mid-light">
        <div className="col-span-3">
          {challenges.length} {challenges.length === 1 ? 'game' : 'games'}
        </div>
        <div className="col-span-2">
          total: <USDCAmount
            amount={challenges.reduce((sum, c) => sum + c.wagerAmount, 0)}
            size="sm"
            className="inline"
          />
        </div>
        <div className="col-span-1"></div>
        <div className="col-span-2">
          avg: {Math.round(challenges.reduce((sum, c) => sum + c.winProb, 0) / challenges.length)}%
        </div>
        <div className="col-span-2"></div>
        <div className="col-span-2 text-right">
          {challenges.filter(c => userBalance >= c.wagerAmount).length} affordable
        </div>
      </div>
    </div>
  );
}
