/**
 * Centralized mock data for development and demos
 * Set USE_MOCK_DATA to true to enable mock data across all components
 */

export const USE_MOCK_DATA = true;

// Simulated network delay (ms)
export const MOCK_DELAY = 300;

// Helper to simulate async delay
export const mockDelay = (ms: number = MOCK_DELAY) =>
  new Promise(resolve => setTimeout(resolve, ms));

// ========================================
// MOCK PLAYERS (used across all components)
// ========================================

export interface MockPlayer {
  id: string;
  username: string;
  eloRating: number;
  peakEloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  totalWinnings: number;
  walletAddress?: string;
}

export const MOCK_PLAYERS: MockPlayer[] = [
  { id: 'mp1', username: 'GrandMaster_X', eloRating: 2450, peakEloRating: 2520, gamesPlayed: 1247, gamesWon: 892, gamesLost: 298, gamesDraw: 57, totalWinnings: 48250 },
  { id: 'mp2', username: 'KnightRider99', eloRating: 2280, peakEloRating: 2350, gamesPlayed: 843, gamesWon: 512, gamesLost: 289, gamesDraw: 42, totalWinnings: 23500 },
  { id: 'mp3', username: 'QueenGambit', eloRating: 2180, peakEloRating: 2230, gamesPlayed: 621, gamesWon: 352, gamesLost: 241, gamesDraw: 28, totalWinnings: 15800 },
  { id: 'mp4', username: 'CryptoKing', eloRating: 2120, peakEloRating: 2200, gamesPlayed: 534, gamesWon: 298, gamesLost: 212, gamesDraw: 24, totalWinnings: 31200 },
  { id: 'mp5', username: 'SilentBishop', eloRating: 2050, peakEloRating: 2100, gamesPlayed: 428, gamesWon: 231, gamesLost: 178, gamesDraw: 19, totalWinnings: 12400 },
  { id: 'mp6', username: 'BlitzMaster', eloRating: 1980, peakEloRating: 2050, gamesPlayed: 1892, gamesWon: 1021, gamesLost: 812, gamesDraw: 59, totalWinnings: 8750 },
  { id: 'mp7', username: 'EndgameWizard', eloRating: 1920, peakEloRating: 1980, gamesPlayed: 367, gamesWon: 187, gamesLost: 162, gamesDraw: 18, totalWinnings: 6200 },
  { id: 'mp8', username: 'PawnStorm', eloRating: 1850, peakEloRating: 1920, gamesPlayed: 298, gamesWon: 148, gamesLost: 138, gamesDraw: 12, totalWinnings: 4100 },
  { id: 'mp9', username: 'RookieMove', eloRating: 1780, peakEloRating: 1850, gamesPlayed: 245, gamesWon: 118, gamesLost: 115, gamesDraw: 12, totalWinnings: 2800 },
  { id: 'mp10', username: 'ChessNinja', eloRating: 1720, peakEloRating: 1800, gamesPlayed: 412, gamesWon: 198, gamesLost: 198, gamesDraw: 16, totalWinnings: 3500 },
  { id: 'mp11', username: 'TacticalMind', eloRating: 1650, peakEloRating: 1750, gamesPlayed: 189, gamesWon: 87, gamesLost: 92, gamesDraw: 10, totalWinnings: 1200 },
  { id: 'mp12', username: 'CastleKing', eloRating: 1580, peakEloRating: 1650, gamesPlayed: 156, gamesWon: 71, gamesLost: 78, gamesDraw: 7, totalWinnings: 850 },
  { id: 'mp13', username: 'CheckMateChad', eloRating: 1520, peakEloRating: 1600, gamesPlayed: 234, gamesWon: 102, gamesLost: 121, gamesDraw: 11, totalWinnings: 1650 },
  { id: 'mp14', username: 'BishopPair', eloRating: 1450, peakEloRating: 1550, gamesPlayed: 145, gamesWon: 61, gamesLost: 77, gamesDraw: 7, totalWinnings: 420 },
  { id: 'mp15', username: 'KnightFork', eloRating: 1380, peakEloRating: 1480, gamesPlayed: 112, gamesWon: 45, gamesLost: 61, gamesDraw: 6, totalWinnings: 280 },
  { id: 'mp16', username: 'PawnPusher', eloRating: 1320, peakEloRating: 1400, gamesPlayed: 98, gamesWon: 38, gamesLost: 55, gamesDraw: 5, totalWinnings: 150 },
  { id: 'mp17', username: 'RookRoller', eloRating: 1260, peakEloRating: 1350, gamesPlayed: 87, gamesWon: 32, gamesLost: 51, gamesDraw: 4, totalWinnings: 75 },
  { id: 'mp18', username: 'QueenSac', eloRating: 1890, peakEloRating: 1950, gamesPlayed: 312, gamesWon: 162, gamesLost: 132, gamesDraw: 18, totalWinnings: 5400 },
  { id: 'mp19', username: 'FischerFan', eloRating: 2320, peakEloRating: 2400, gamesPlayed: 567, gamesWon: 378, gamesLost: 156, gamesDraw: 33, totalWinnings: 35600 },
  { id: 'mp20', username: 'CarlsenClone', eloRating: 2580, peakEloRating: 2650, gamesPlayed: 892, gamesWon: 698, gamesLost: 142, gamesDraw: 52, totalWinnings: 72400 },
];

// Get random player
export const getRandomPlayer = () => MOCK_PLAYERS[Math.floor(Math.random() * MOCK_PLAYERS.length)];

// Get random players (without duplicates)
export const getRandomPlayers = (count: number): MockPlayer[] => {
  const shuffled = [...MOCK_PLAYERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// ========================================
// TIME CONTROLS
// ========================================

export const TIME_CONTROLS = {
  bullet_1: { initial: 60, increment: 0, label: '1 min', category: 'bullet' },
  bullet_2: { initial: 120, increment: 1, label: '2+1', category: 'bullet' },
  blitz_3: { initial: 180, increment: 0, label: '3 min', category: 'blitz' },
  blitz_3_2: { initial: 180, increment: 2, label: '3+2', category: 'blitz' },
  blitz_5: { initial: 300, increment: 0, label: '5 min', category: 'blitz' },
  blitz_5_3: { initial: 300, increment: 3, label: '5+3', category: 'blitz' },
  rapid_10: { initial: 600, increment: 0, label: '10 min', category: 'rapid' },
  rapid_15: { initial: 900, increment: 10, label: '15+10', category: 'rapid' },
  classical_30: { initial: 1800, increment: 0, label: '30 min', category: 'classical' },
};

export const TIME_CONTROL_KEYS = Object.keys(TIME_CONTROLS) as (keyof typeof TIME_CONTROLS)[];

export const getRandomTimeControlKey = () => TIME_CONTROL_KEYS[Math.floor(Math.random() * TIME_CONTROL_KEYS.length)];

// ========================================
// OPENINGS
// ========================================

export const OPENINGS = [
  'Italian Game', 'Ruy Lopez', 'Sicilian Najdorf', 'Sicilian Dragon', 'French Defense',
  'Caro-Kann Defense', 'Queen\'s Gambit Declined', 'Queen\'s Gambit Accepted', 'King\'s Indian Defense',
  'Nimzo-Indian Defense', 'English Opening', 'Reti Opening', 'Catalan Opening', 'London System',
  'Scotch Game', 'Petroff Defense', 'Pirc Defense', 'Modern Defense', 'Scandinavian Defense',
  'Alekhine\'s Defense', 'Dutch Defense', 'Slav Defense', 'Grunfeld Defense', 'Benoni Defense',
];

export const getRandomOpening = () => OPENINGS[Math.floor(Math.random() * OPENINGS.length)];

// ========================================
// MOCK CHALLENGES
// ========================================

export interface MockChallenge {
  id: string;
  creatorId: string;
  creator: MockPlayer;
  gameMode: 'standard' | 'chess960';
  timeControlKey: string;
  timeControl: { initial: number; increment: number };
  stakeAmount: number;
  minElo: number | null;
  maxElo: number | null;
  status: 'open';
  createdAt: Date;
  expiresAt: Date;
}

export function generateMockChallenges(count: number = 12): MockChallenge[] {
  const players = getRandomPlayers(Math.min(count, MOCK_PLAYERS.length));
  const now = new Date();

  return players.slice(0, count).map((player, index) => {
    const tcKey = getRandomTimeControlKey();
    const tc = TIME_CONTROLS[tcKey];
    const createdMinutesAgo = Math.floor(Math.random() * 25) + 1;
    const createdAt = new Date(now.getTime() - createdMinutesAgo * 60 * 1000);

    // Stake amounts with realistic distribution
    const stakeAmounts = [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500];
    const stakeAmount = stakeAmounts[Math.floor(Math.random() * stakeAmounts.length)];

    return {
      id: `challenge-${index + 1}`,
      creatorId: player.id,
      creator: player,
      gameMode: Math.random() > 0.7 ? 'chess960' : 'standard',
      timeControlKey: tcKey,
      timeControl: { initial: tc.initial, increment: tc.increment },
      stakeAmount,
      minElo: Math.random() > 0.6 ? Math.floor(player.eloRating - 200) : null,
      maxElo: Math.random() > 0.6 ? Math.floor(player.eloRating + 200) : null,
      status: 'open' as const,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 30 * 60 * 1000), // 30 min expiry
    };
  });
}

// ========================================
// MOCK ACTIVE GAMES
// ========================================

export interface MockActiveGame {
  id: string;
  whitePlayer: MockPlayer;
  blackPlayer: MockPlayer;
  gameMode: 'standard' | 'chess960';
  stakeAmount: number;
  totalPot: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  moveCount: number;
  currentFen: string;
  startedAt: Date;
}

const SAMPLE_FENS = [
  'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  'r1bqkb1r/pppppppp/2n2n2/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2',
  'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
];

export function generateMockActiveGames(count: number = 6): MockActiveGame[] {
  const games: MockActiveGame[] = [];
  const usedPlayers = new Set<string>();

  for (let i = 0; i < count; i++) {
    // Get two different players
    let whitePlayer: MockPlayer, blackPlayer: MockPlayer;

    do {
      whitePlayer = getRandomPlayer();
    } while (usedPlayers.has(whitePlayer.id));
    usedPlayers.add(whitePlayer.id);

    do {
      blackPlayer = getRandomPlayer();
    } while (usedPlayers.has(blackPlayer.id) || blackPlayer.id === whitePlayer.id);
    usedPlayers.add(blackPlayer.id);

    const tcKey = getRandomTimeControlKey();
    const tc = TIME_CONTROLS[tcKey];
    const moveCount = Math.floor(Math.random() * 40) + 5;

    // Calculate remaining time (realistic based on move count)
    const avgMoveTime = tc.initial / 40; // Assume 40 moves average
    const whiteMovesUsed = Math.ceil(moveCount / 2);
    const blackMovesUsed = Math.floor(moveCount / 2);
    const whiteTimeUsed = whiteMovesUsed * avgMoveTime * (0.5 + Math.random());
    const blackTimeUsed = blackMovesUsed * avgMoveTime * (0.5 + Math.random());

    const stakeAmounts = [10, 25, 50, 100, 200, 500];
    const stakeAmount = stakeAmounts[Math.floor(Math.random() * stakeAmounts.length)];

    games.push({
      id: `active-game-${i + 1}`,
      whitePlayer,
      blackPlayer,
      gameMode: Math.random() > 0.75 ? 'chess960' : 'standard',
      stakeAmount,
      totalPot: stakeAmount * 2,
      whiteTimeRemaining: Math.max(tc.initial - whiteTimeUsed + (whiteMovesUsed * tc.increment), 10),
      blackTimeRemaining: Math.max(tc.initial - blackTimeUsed + (blackMovesUsed * tc.increment), 10),
      moveCount,
      currentFen: SAMPLE_FENS[Math.floor(Math.random() * SAMPLE_FENS.length)],
      startedAt: new Date(Date.now() - (moveCount * 30 * 1000)), // ~30 sec per move
    });
  }

  return games;
}

// ========================================
// MOCK LEADERBOARD
// ========================================

export function generateMockEloLeaderboard(count: number = 50) {
  const sortedPlayers = [...MOCK_PLAYERS]
    .sort((a, b) => b.eloRating - a.eloRating)
    .slice(0, count);

  return sortedPlayers.map((player, index) => ({
    rank: index + 1,
    value: player.eloRating,
    user: {
      id: player.id,
      username: player.username,
      eloRating: player.eloRating,
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      gamesLost: player.gamesLost,
      gamesDraw: player.gamesDraw,
    },
  }));
}

export function generateMockWinningsLeaderboard(count: number = 50) {
  const sortedPlayers = [...MOCK_PLAYERS]
    .sort((a, b) => b.totalWinnings - a.totalWinnings)
    .slice(0, count);

  return sortedPlayers.map((player, index) => ({
    rank: index + 1,
    value: player.totalWinnings,
    user: {
      id: player.id,
      username: player.username,
      eloRating: player.eloRating,
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      gamesLost: player.gamesLost,
      gamesDraw: player.gamesDraw,
    },
  }));
}

// ========================================
// MOCK SPECTATOR PREDICTIONS
// ========================================

export interface MockPrediction {
  id: string;
  gameId: string;
  creatorId: string;
  creator: MockPlayer;
  predictedWinnerId: string;
  predictedWinner: MockPlayer;
  amount: number;
  odds: number;
  status: 'open' | 'matched' | 'settled';
  createdAt: Date;
}

export function generateMockPredictions(gameId: string, whitePlayer: MockPlayer, blackPlayer: MockPlayer, count: number = 5): MockPrediction[] {
  const predictions: MockPrediction[] = [];
  const spectators = getRandomPlayers(count).filter(p => p.id !== whitePlayer.id && p.id !== blackPlayer.id);

  spectators.forEach((spectator, index) => {
    const predictedWinner = Math.random() > 0.5 ? whitePlayer : blackPlayer;
    const amounts = [5, 10, 20, 25, 50, 100];

    predictions.push({
      id: `pred-${gameId}-${index}`,
      gameId,
      creatorId: spectator.id,
      creator: spectator,
      predictedWinnerId: predictedWinner.id,
      predictedWinner,
      amount: amounts[Math.floor(Math.random() * amounts.length)],
      odds: 1.8 + Math.random() * 0.4, // 1.8x - 2.2x
      status: Math.random() > 0.3 ? 'open' : 'matched',
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 600000)),
    });
  });

  return predictions;
}

// ========================================
// MOCK SPECTATOR CHAT
// ========================================

export interface MockChatMessage {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  message: string;
  createdAt: Date;
}

const CHAT_MESSAGES = [
  'Nice opening!',
  'That knight move was risky',
  'This is getting intense',
  'I think white has the advantage here',
  'Black is playing solid defense',
  'What an exchange!',
  'Great game so far',
  'The endgame should be interesting',
  'That was unexpected!',
  'Classic position here',
  'Who do you think will win?',
  'Both playing really well',
  'Time pressure building up',
  'Brilliant sacrifice!',
  'This is a must-watch game',
];

export function generateMockChatMessages(gameId: string, count: number = 8): MockChatMessage[] {
  const chatters = getRandomPlayers(count);
  const now = Date.now();

  return chatters.map((chatter, index) => ({
    id: `chat-${gameId}-${index}`,
    gameId,
    userId: chatter.id,
    username: chatter.username,
    message: CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)],
    createdAt: new Date(now - (count - index) * 30000), // Messages every ~30 sec
  }));
}
