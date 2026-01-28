'use client';

/**
 * DevDebugPanel
 *
 * Full-featured debug panel for testing every major app flow in development.
 * Organized into collapsible sections: Game, Challenges, Spectator, Wallet,
 * Notifications, and a global reset.
 *
 * Only visible when NODE_ENV === 'development'.
 */

import { useState, type ReactNode } from 'react';
import { useNotificationStore } from '@/store/notification';
import { useGameStore } from '@/store/game';
import { useChallengeStore } from '@/store/challenge';
import { useSpectatorStore } from '@/store/spectator';
import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { useSpectatorChatStore } from '@/store/spectatorChat';
import { useWalletStore } from '@/store/wallet';
import { useFeatureFlag } from '@/store/flags';
import { ACHIEVEMENTS } from '@chess-game/shared';
import type { PublicUser, ChallengeWithCreator } from '@chess-game/shared';
import {
  MOCK_PLAYERS,
  getRandomPlayers,
  generateMockChallenges,
  generateMockChatMessages,
  generateMockActiveGames,
  TIME_CONTROLS,
  SAMPLE_FENS,
} from '@/lib/mock/mockData';

// Only render in development
const isDev = process.env.NODE_ENV === 'development';

// ── Famous positions for the "set_position" dropdown ──────────────────────
const FAMOUS_POSITIONS: Record<string, string> = {
  'Italian Game':
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  'Sicilian Najdorf':
    'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  'French Defense':
    'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2',
  "Scholar's Mate":
    'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
  'Endgame (K+R vs K)':
    '8/8/8/4k3/8/8/8/4K2R w - - 0 1',
  'Mid-game Complex':
    'r1b2rk1/pp1nqppp/2pbpn2/3p4/2PP4/1PN1PN2/PBQ2PPP/R3KB1R w KQ - 2 9',
};

// ── Helper: convert MockPlayer → PublicUser ───────────────────────────────
function toPublicUser(p: (typeof MOCK_PLAYERS)[number]): PublicUser {
  return {
    id: p.id,
    username: p.username,
    displayName: p.username,
    eloRating: p.eloRating,
    peakEloRating: p.peakEloRating,
    gamesPlayed: p.gamesPlayed,
    gamesWon: p.gamesWon,
    gamesLost: p.gamesLost,
    gamesDraw: p.gamesDraw,
  };
}

// ── Collapsible section sub-component ─────────────────────────────────────
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs font-mono text-purple-400/70 hover:text-purple-300 transition-colors py-1"
      >
        <span>{title}</span>
        <span className="text-purple-500/50">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────
const btn =
  'w-full px-3 py-2 bg-purple-900/30 border border-purple-500/30 text-purple-300 font-mono text-xs hover:bg-purple-900/50 hover:border-purple-500/50 transition-colors text-left';
const btnDanger =
  'w-full px-3 py-2 bg-red-900/30 border border-red-500/30 text-red-300 font-mono text-xs hover:bg-red-900/50 hover:border-red-500/50 transition-colors text-left';
const btnSuccess =
  'w-full px-3 py-2 bg-green-900/30 border border-green-500/30 text-green-300 font-mono text-xs hover:bg-green-900/50 hover:border-green-500/50 transition-colors text-left';
const btnNeutral =
  'w-full px-3 py-2 bg-black border border-white/20 text-white/50 font-mono text-xs hover:border-white/40 hover:text-white/70 transition-colors';

export function DevDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFen, setSelectedFen] = useState(Object.keys(FAMOUS_POSITIONS)[0]);

  // ── Store hooks (only call at top level) ──────────────────────────────
  const { addAchievementNotification, addNotification, clearAll } =
    useNotificationStore();
  const game = useGameStore();
  const challenge = useChallengeStore();
  const spectator = useSpectatorStore();
  const multiSpectator = useMultiSpectatorStore();
  const spectatorChat = useSpectatorChatStore();
  const wallet = useWalletStore();
  const multiGameEnabled = useFeatureFlag('spectator_multi_game');

  if (!isDev) return null;

  // ── Game simulation handlers ──────────────────────────────────────────
  const handleJoinQueue = () => {
    const tc = TIME_CONTROLS.blitz_5;
    game.setQueueParams({ initial: tc.initial, increment: tc.increment }, 50);
    game.joinQueue();
  };

  const handleMatchFound = () => {
    const [p1, p2] = getRandomPlayers(2);
    const white = toPublicUser(p1);
    const black = toPublicUser(p2);
    game.setPlayers(white, black);
    game.setPlayerColor('white');
    game.updateClocks(300, 300);
    game.updateFen(
      'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    );
    game.setStatus('playing');
  };

  const handleSetPosition = () => {
    const fen = FAMOUS_POSITIONS[selectedFen];
    if (fen) game.updateFen(fen);
  };

  const handleEndGame = (
    result: string,
    eloChange: number
  ) => {
    game.endGame(result, eloChange);
  };

  // ── Challenge handlers ────────────────────────────────────────────────
  const handleFillMarketplace = () => {
    const mocks = generateMockChallenges(15);
    // Convert MockChallenge to ChallengeWithCreator shape
    const asChallenge: ChallengeWithCreator[] = mocks.map((m) => ({
      id: m.id,
      creatorId: m.creatorId,
      gameMode: m.gameMode,
      timeControlKey: m.timeControlKey,
      timeControl: m.timeControl,
      wagerAmount: m.wagerAmount,
      minElo: m.minElo,
      maxElo: m.maxElo,
      status: m.status,
      acceptedById: null,
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
      creator: toPublicUser(m.creator),
    }));
    challenge.setChallenges(asChallenge);
  };

  const handleCreateMyChallenge = () => {
    const me = toPublicUser(MOCK_PLAYERS[0]);
    const myChallenge: ChallengeWithCreator = {
      id: 'my-challenge-1',
      creatorId: me.id,
      gameMode: 'standard',
      timeControlKey: 'blitz_5',
      timeControl: { initial: 300, increment: 0 },
      wagerAmount: 50,
      minElo: null,
      maxElo: null,
      status: 'open',
      acceptedById: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      creator: me,
    };
    challenge.challengeCreated(myChallenge);
  };

  const handleSimulateAccept = () => {
    const current = challenge.myChallenge;
    if (!current) return;
    const acceptor = toPublicUser(MOCK_PLAYERS[3]);
    const accepted: ChallengeWithCreator = {
      ...current,
      status: 'accepted',
      acceptedById: acceptor.id,
      acceptedBy: acceptor,
    };
    challenge.challengeAccepted(accepted);
  };

  const handleSimulateConfirm = () => {
    challenge.setUIState('starting');
  };

  const handleClearMarketplace = () => {
    challenge.reset();
  };

  // ── Spectator handlers ────────────────────────────────────────────────
  const handleStartSpectating = () => {
    const [p1, p2] = getRandomPlayers(2);
    spectator.startSpectating('spectated-game-1');
    spectator.setPlayers(toPublicUser(p1), toPublicUser(p2));
    spectator.updateGameState(
      'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      243,
      271
    );
    spectator.updateOdds(1.8, 2.2);
    spectator.setSpectatorCount(47);
  };

  const handleUpdateOdds = () => {
    // Random shift in odds to simulate a move changing evaluation
    const whiteBase = 1.5 + Math.random() * 1.0; // 1.5 – 2.5
    const blackBase = 1.5 + Math.random() * 1.0;
    spectator.updateOdds(
      parseFloat(whiteBase.toFixed(2)),
      parseFloat(blackBase.toFixed(2))
    );
  };

  // ── Multi-game spectator handlers ────────────────────────────────────
  const handleAddMultiGame = () => {
    // Generate a mock game with random players and add it to the multi-spectator store
    const [p1, p2] = getRandomPlayers(2);
    const gameId = `mock-game-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fen = SAMPLE_FENS[Math.floor(Math.random() * SAMPLE_FENS.length)];
    const whiteTime = Math.floor(150 + Math.random() * 200);
    const blackTime = Math.floor(150 + Math.random() * 200);

    multiSpectator.addGame(gameId);
    multiSpectator.setGamePlayers(gameId, toPublicUser(p1), toPublicUser(p2));
    multiSpectator.updateGameState(gameId, fen, whiteTime, blackTime);
    multiSpectator.updateGameOdds(
      gameId,
      parseFloat((1.5 + Math.random()).toFixed(2)),
      parseFloat((1.5 + Math.random()).toFixed(2))
    );
  };

  const handleAdd3MultiGames = () => {
    for (let i = 0; i < 3; i++) {
      // Stagger so each gets unique players & gameId
      setTimeout(() => handleAddMultiGame(), i * 50);
    }
  };

  const handleClearMultiGames = () => {
    multiSpectator.removeAllGames();
  };

  const handleAddChatMessages = () => {
    const msgs = generateMockChatMessages('spectated-game-1', 5);
    msgs.forEach((m) => {
      spectatorChat.addMessage({
        id: m.id,
        gameId: m.gameId,
        userId: m.userId,
        username: m.username,
        message: m.message,
        createdAt: m.createdAt,
      });
    });
  };

  // ── Wallet handlers ───────────────────────────────────────────────────
  const handleAddWin = () => {
    wallet.addBalanceChange({
      type: 'game_win',
      amount: 50,
      description: 'Won vs BlitzMaster',
      opponent: 'BlitzMaster',
      gameId: `G-${Math.floor(Math.random() * 9000) + 1000}`,
    });
  };

  const handleAddLoss = () => {
    wallet.addBalanceChange({
      type: 'game_loss',
      amount: -30,
      description: 'Lost vs KnightRider99',
      opponent: 'KnightRider99',
      gameId: `G-${Math.floor(Math.random() * 9000) + 1000}`,
    });
  };

  // ── Notification handlers (existing) ──────────────────────────────────
  const triggerRandomAchievement = () => {
    const randomAchievement =
      ACHIEVEMENTS[Math.floor(Math.random() * ACHIEVEMENTS.length)];
    addAchievementNotification({
      id: randomAchievement.id,
      name: randomAchievement.name,
      description: randomAchievement.description,
      icon: randomAchievement.icon,
      category: randomAchievement.category,
    });
  };

  const triggerSpecificAchievement = (id: string) => {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (achievement) {
      addAchievementNotification({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
      });
    }
  };

  const triggerMultipleAchievements = () => {
    const shuffled = [...ACHIEVEMENTS].sort(() => Math.random() - 0.5);
    shuffled.slice(0, 3).forEach((achievement, index) => {
      setTimeout(() => {
        addAchievementNotification({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          category: achievement.category,
        });
      }, index * 500);
    });
  };

  // ── Reset all stores ──────────────────────────────────────────────────
  const handleResetAll = () => {
    game.reset();
    challenge.reset();
    spectator.stopSpectating();
    multiSpectator.removeAllGames();
    spectatorChat.reset();
    wallet.setDisconnected();
    clearAll();
  };

  // Quick achievement picks
  const quickAchievements = [
    'first_win',
    'streak_5',
    'elo_1800',
    'high_roller',
    'speed_demon',
  ];

  return (
    <>
      {/* Toggle Button - Fixed bottom left */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 bg-purple-600 hover:bg-purple-500 text-white font-mono text-sm flex items-center justify-center border border-purple-400 transition-colors"
        title="Dev Debug Panel"
      >
        {isOpen ? '×' : '🛠'}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-16 left-4 z-50 w-80 bg-black border border-purple-500/50 shadow-lg shadow-purple-500/20">
          {/* Header */}
          <div className="p-3 border-b border-purple-500/30 flex items-center justify-between">
            <span className="text-purple-400 font-mono text-sm">
              dev_debug
            </span>
            <span className="text-purple-400/30 font-mono text-xs">
              {game.status !== 'idle' && `game:${game.status}`}
            </span>
          </div>

          {/* Content */}
          <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
            {/* ═══ Section 1: Game Simulation ═══ */}
            <Section title="game_simulation" defaultOpen>
              <button onClick={handleJoinQueue} className={btn}>
                ▶ join_queue (blitz 5|0, $50)
              </button>
              <button onClick={handleMatchFound} className={btn}>
                ⚔ match_found (you = white)
              </button>

              {/* Position picker */}
              <div className="flex gap-1">
                <select
                  value={selectedFen}
                  onChange={(e) => setSelectedFen(e.target.value)}
                  className="flex-1 px-2 py-2 bg-purple-900/20 border border-purple-500/30 text-purple-300 font-mono text-xs focus:outline-none focus:border-purple-500/60"
                >
                  {Object.keys(FAMOUS_POSITIONS).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSetPosition}
                  className="px-3 py-2 bg-purple-900/30 border border-purple-500/30 text-purple-300 font-mono text-xs hover:bg-purple-900/50 transition-colors"
                >
                  set
                </button>
              </div>

              {/* End game buttons in a row */}
              <div className="flex gap-1">
                <button
                  onClick={() => handleEndGame('checkmate', 15)}
                  className={btnSuccess + ' flex-1'}
                >
                  win +15
                </button>
                <button
                  onClick={() => handleEndGame('checkmate', -12)}
                  className={btnDanger + ' flex-1'}
                >
                  loss -12
                </button>
                <button
                  onClick={() => handleEndGame('draw', 2)}
                  className={btn + ' flex-1'}
                >
                  draw +2
                </button>
              </div>

              <button onClick={() => game.reset()} className={btnNeutral}>
                reset_game
              </button>
            </Section>

            <div className="border-t border-purple-500/10" />

            {/* ═══ Section 2: Challenge Marketplace ═══ */}
            <Section title="challenge_marketplace">
              <button onClick={handleFillMarketplace} className={btn}>
                ▶ fill_marketplace (15 challenges)
              </button>
              <button onClick={handleCreateMyChallenge} className={btn}>
                + create_my_challenge
              </button>
              <button onClick={handleSimulateAccept} className={btn}>
                ✓ simulate_accept
              </button>
              <button onClick={handleSimulateConfirm} className={btn}>
                ⚡ simulate_confirm → starting
              </button>
              <button onClick={handleClearMarketplace} className={btnNeutral}>
                clear_marketplace
              </button>
            </Section>

            <div className="border-t border-purple-500/10" />

            {/* ═══ Section 3: Spectator Mode ═══ */}
            <Section title="spectator_mode">
              {multiGameEnabled ? (
                <>
                  {/* Multi-game spectator controls */}
                  <p className="text-xs font-mono text-purple-400/40 px-1">
                    multi-game mode ({Object.keys(multiSpectator.games).length}/5 games)
                  </p>
                  <button onClick={handleAddMultiGame} className={btn}>
                    + add_game (random players)
                  </button>
                  <button onClick={handleAdd3MultiGames} className={btn}>
                    +++ add_3_games
                  </button>
                  <button onClick={handleUpdateOdds} className={btn}>
                    ↻ update_odds (legacy store)
                  </button>
                  <button onClick={handleAddChatMessages} className={btn}>
                    💬 add_chat_messages (5)
                  </button>
                  <button onClick={handleClearMultiGames} className={btnNeutral}>
                    clear_all_games
                  </button>
                </>
              ) : (
                <>
                  {/* Legacy single-game spectator controls */}
                  <button onClick={handleStartSpectating} className={btn}>
                    ▶ start_spectating (2 players, odds, 47 viewers)
                  </button>
                  <button onClick={handleUpdateOdds} className={btn}>
                    ↻ update_odds (random shift)
                  </button>
                  <button onClick={handleAddChatMessages} className={btn}>
                    💬 add_chat_messages (5)
                  </button>
                  <button
                    onClick={() => spectator.stopSpectating()}
                    className={btnNeutral}
                  >
                    stop_spectating
                  </button>
                </>
              )}
            </Section>

            <div className="border-t border-purple-500/10" />

            {/* ═══ Section 4: Wallet ═══ */}
            <Section title="wallet">
              <button
                onClick={() => wallet.initDevMode()}
                className={btn}
              >
                ▶ connect_wallet ($645 + history)
              </button>
              <div className="flex gap-1">
                <button onClick={handleAddWin} className={btnSuccess + ' flex-1'}>
                  +$50 win
                </button>
                <button onClick={handleAddLoss} className={btnDanger + ' flex-1'}>
                  -$30 loss
                </button>
              </div>
              <button
                onClick={() => wallet.setDisconnected()}
                className={btnNeutral}
              >
                disconnect
              </button>
              {wallet.isConnected && (
                <p className="text-xs font-mono text-purple-400/40 px-1">
                  balance: ${wallet.usdcBalance}
                </p>
              )}
            </Section>

            <div className="border-t border-purple-500/10" />

            {/* ═══ Section 5: Notifications (existing) ═══ */}
            <Section title="notifications">
              <button onClick={triggerRandomAchievement} className={btn}>
                🎲 random_achievement
              </button>
              <button onClick={triggerMultipleAchievements} className={btn}>
                🎯 trigger_3_achievements
              </button>

              {/* Quick achievement picks */}
              <p className="text-xs font-mono text-purple-400/50 mt-1">
                quick_picks
              </p>
              <div className="flex flex-wrap gap-1">
                {quickAchievements.map((id) => {
                  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
                  return (
                    <button
                      key={id}
                      onClick={() => triggerSpecificAchievement(id)}
                      className="px-2 py-1 bg-purple-900/20 border border-purple-500/20 text-purple-300/70 font-mono text-xs hover:bg-purple-900/40 hover:text-purple-300 transition-colors"
                      title={achievement?.name}
                    >
                      {achievement?.icon}
                    </button>
                  );
                })}
              </div>

              {/* Toast types */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() =>
                    addNotification({
                      type: 'success',
                      title: 'game_saved',
                      message: 'your progress has been saved',
                    })
                  }
                  className="flex-1 px-2 py-1.5 bg-green-900/30 border border-green-500/30 text-green-300 font-mono text-xs hover:bg-green-900/50 transition-colors"
                >
                  ✓ success
                </button>
                <button
                  onClick={() =>
                    addNotification({
                      type: 'error',
                      title: 'connection_lost',
                      message: 'failed to connect to server',
                    })
                  }
                  className="flex-1 px-2 py-1.5 bg-red-900/30 border border-red-500/30 text-red-300 font-mono text-xs hover:bg-red-900/50 transition-colors"
                >
                  ! error
                </button>
              </div>

              <button onClick={clearAll} className={btnNeutral}>
                clear_all_notifications
              </button>
            </Section>

            <div className="border-t border-purple-500/10" />

            {/* ═══ Section 6: State Reset ═══ */}
            <Section title="state_reset">
              <button onClick={handleResetAll} className={btnDanger}>
                ⚠ reset_all_stores
              </button>
            </Section>
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-purple-500/30">
            <p className="text-xs font-mono text-purple-400/30 text-center">
              dev mode only
            </p>
          </div>
        </div>
      )}
    </>
  );
}
