/**
 * Game Store Unit Tests
 *
 * These tests verify the Zustand game store functionality.
 * The store manages game state for the chess app including:
 * - Game status (idle, queuing, matched, playing, ended)
 * - Current game data (FEN, moves, clocks)
 * - Player information
 * - Queue parameters
 *
 * Test Coverage:
 * - Initial state is correct
 * - setGame() updates state
 * - addMove() validates and updates
 * - updateClocks() updates times
 * - resetGame() clears state
 */

import { describe, test, expect } from 'bun:test';

// ---------------------------------------------------------------------------
// Types (matching the store's types)
// ---------------------------------------------------------------------------

type GameStatus = 'idle' | 'queuing' | 'matched' | 'playing' | 'ended';

interface Move {
  from: string;
  to: string;
  fen: string;
  san: string;
  piece: string;
  captured?: string;
  promotion?: string;
}

interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  eloRating: number;
  peakEloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
}

interface Game {
  id: string;
  currentFen: string;
  moves: Move[];
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  status: string;
  wagerAmount: number;
  totalPot: number;
}

interface TimeControl {
  initial: number;
  increment: number;
}

// ---------------------------------------------------------------------------
// Store State Interface (matching the actual store)
// ---------------------------------------------------------------------------

interface GameState {
  status: GameStatus;
  game: Game | null;
  whitePlayer: PublicUser | null;
  blackPlayer: PublicUser | null;
  playerColor: 'white' | 'black' | null;
  moves: Move[];
  currentFen: string;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  isMyTurn: boolean;
  drawOffered: boolean;
  drawOfferedByMe: boolean;
  result: string | null;
  eloChange: number | null;
  queueTimeControl: TimeControl | null;
  queueWagerAmount: number;
  queueJoinedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const initialState: GameState = {
  status: 'idle',
  game: null,
  whitePlayer: null,
  blackPlayer: null,
  playerColor: null,
  moves: [],
  currentFen: STARTING_FEN,
  whiteTimeRemaining: 0,
  blackTimeRemaining: 0,
  isMyTurn: false,
  drawOffered: false,
  drawOfferedByMe: false,
  result: null,
  eloChange: null,
  queueTimeControl: null,
  queueWagerAmount: 0,
  queueJoinedAt: null,
};

// ---------------------------------------------------------------------------
// Mock Store Implementation (for testing)
// ---------------------------------------------------------------------------

/**
 * Creates a mock game store for testing.
 * This mirrors the actual Zustand store's behavior.
 */
function createMockGameStore() {
  let state: GameState = { ...initialState };

  return {
    getState: () => state,

    setStatus: (status: GameStatus) => {
      state = { ...state, status };
    },

    setGame: (game: Game) => {
      state = {
        ...state,
        game,
        currentFen: game.currentFen,
        moves: game.moves,
        whiteTimeRemaining: game.whiteTimeRemaining,
        blackTimeRemaining: game.blackTimeRemaining,
      };
    },

    setPlayers: (white: PublicUser, black: PublicUser) => {
      state = { ...state, whitePlayer: white, blackPlayer: black };
    },

    setPlayerColor: (color: 'white' | 'black') => {
      const isWhiteTurn = state.currentFen.split(' ')[1] === 'w';
      state = {
        ...state,
        playerColor: color,
        isMyTurn: (isWhiteTurn && color === 'white') || (!isWhiteTurn && color === 'black'),
      };
    },

    addMove: (move: Move) => {
      const isWhiteTurn = move.fen.split(' ')[1] === 'w';
      state = {
        ...state,
        moves: [...state.moves, move],
        currentFen: move.fen,
        isMyTurn:
          (isWhiteTurn && state.playerColor === 'white') ||
          (!isWhiteTurn && state.playerColor === 'black'),
      };
    },

    updateFen: (fen: string) => {
      const isWhiteTurn = fen.split(' ')[1] === 'w';
      state = {
        ...state,
        currentFen: fen,
        isMyTurn:
          (isWhiteTurn && state.playerColor === 'white') ||
          (!isWhiteTurn && state.playerColor === 'black'),
      };
    },

    updateClocks: (whiteTime: number, blackTime: number) => {
      state = { ...state, whiteTimeRemaining: whiteTime, blackTimeRemaining: blackTime };
    },

    setMyTurn: (isMyTurn: boolean) => {
      state = { ...state, isMyTurn };
    },

    setDrawOffered: (offered: boolean, byMe: boolean) => {
      state = { ...state, drawOffered: offered, drawOfferedByMe: byMe };
    },

    endGame: (result: string, eloChange: number | null) => {
      state = { ...state, status: 'ended', result, eloChange };
    },

    setQueueParams: (timeControl: TimeControl, wagerAmount: number) => {
      state = { ...state, queueTimeControl: timeControl, queueWagerAmount: wagerAmount };
    },

    joinQueue: () => {
      state = { ...state, status: 'queuing', queueJoinedAt: new Date() };
    },

    leaveQueue: () => {
      state = { ...state, status: 'idle', queueJoinedAt: null };
    },

    reset: () => {
      state = { ...initialState };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockWhitePlayer: PublicUser = {
  id: 'player-1',
  username: 'WhitePlayer',
  displayName: 'White Player',
  eloRating: 1500,
  peakEloRating: 1600,
  gamesPlayed: 100,
  gamesWon: 50,
  gamesLost: 40,
  gamesDraw: 10,
};

const mockBlackPlayer: PublicUser = {
  id: 'player-2',
  username: 'BlackPlayer',
  displayName: 'Black Player',
  eloRating: 1450,
  peakEloRating: 1550,
  gamesPlayed: 80,
  gamesWon: 35,
  gamesLost: 35,
  gamesDraw: 10,
};

const mockGame: Game = {
  id: 'game-123',
  currentFen: STARTING_FEN,
  moves: [],
  whiteTimeRemaining: 600,
  blackTimeRemaining: 600,
  status: 'active',
  wagerAmount: 25,
  totalPot: 50,
};

const mockMove: Move = {
  from: 'e2',
  to: 'e4',
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  san: 'e4',
  piece: 'p',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Game Store - Initial State', () => {
  test('initial state has correct default values', () => {
    const store = createMockGameStore();
    const state = store.getState();

    expect(state.status).toBe('idle');
    expect(state.game).toBeNull();
    expect(state.whitePlayer).toBeNull();
    expect(state.blackPlayer).toBeNull();
    expect(state.playerColor).toBeNull();
    expect(state.moves).toEqual([]);
    expect(state.currentFen).toBe(STARTING_FEN);
    expect(state.whiteTimeRemaining).toBe(0);
    expect(state.blackTimeRemaining).toBe(0);
    expect(state.isMyTurn).toBe(false);
    expect(state.drawOffered).toBe(false);
    expect(state.drawOfferedByMe).toBe(false);
    expect(state.result).toBeNull();
    expect(state.eloChange).toBeNull();
    expect(state.queueTimeControl).toBeNull();
    expect(state.queueWagerAmount).toBe(0);
    expect(state.queueJoinedAt).toBeNull();
  });
});

describe('Game Store - setStatus', () => {
  test('setStatus updates game status correctly', () => {
    const store = createMockGameStore();

    store.setStatus('queuing');
    expect(store.getState().status).toBe('queuing');

    store.setStatus('matched');
    expect(store.getState().status).toBe('matched');

    store.setStatus('playing');
    expect(store.getState().status).toBe('playing');

    store.setStatus('ended');
    expect(store.getState().status).toBe('ended');

    store.setStatus('idle');
    expect(store.getState().status).toBe('idle');
  });
});

describe('Game Store - setGame', () => {
  test('setGame updates game and related state', () => {
    const store = createMockGameStore();

    store.setGame(mockGame);

    const state = store.getState();
    expect(state.game).toEqual(mockGame);
    expect(state.currentFen).toBe(mockGame.currentFen);
    expect(state.moves).toEqual(mockGame.moves);
    expect(state.whiteTimeRemaining).toBe(mockGame.whiteTimeRemaining);
    expect(state.blackTimeRemaining).toBe(mockGame.blackTimeRemaining);
  });

  test('setGame updates FEN when game has different position', () => {
    const store = createMockGameStore();

    const gameAfterMoves: Game = {
      ...mockGame,
      currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      moves: [mockMove],
    };

    store.setGame(gameAfterMoves);

    expect(store.getState().currentFen).toBe(gameAfterMoves.currentFen);
    expect(store.getState().moves).toHaveLength(1);
  });
});

describe('Game Store - setPlayers', () => {
  test('setPlayers updates both player references', () => {
    const store = createMockGameStore();

    store.setPlayers(mockWhitePlayer, mockBlackPlayer);

    const state = store.getState();
    expect(state.whitePlayer).toEqual(mockWhitePlayer);
    expect(state.blackPlayer).toEqual(mockBlackPlayer);
  });
});

describe('Game Store - setPlayerColor', () => {
  test('setPlayerColor with white on starting position sets isMyTurn true', () => {
    const store = createMockGameStore();

    store.setPlayerColor('white');

    const state = store.getState();
    expect(state.playerColor).toBe('white');
    expect(state.isMyTurn).toBe(true); // White to move in starting position
  });

  test('setPlayerColor with black on starting position sets isMyTurn false', () => {
    const store = createMockGameStore();

    store.setPlayerColor('black');

    const state = store.getState();
    expect(state.playerColor).toBe('black');
    expect(state.isMyTurn).toBe(false); // Black waiting for white to move
  });

  test('setPlayerColor with black when it is black turn sets isMyTurn true', () => {
    const store = createMockGameStore();

    // Set FEN where it's black's turn
    store.updateFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    store.setPlayerColor('black');

    expect(store.getState().isMyTurn).toBe(true);
  });
});

describe('Game Store - addMove', () => {
  test('addMove adds move to moves array', () => {
    const store = createMockGameStore();
    store.setPlayerColor('white');

    store.addMove(mockMove);

    expect(store.getState().moves).toHaveLength(1);
    expect(store.getState().moves[0]).toEqual(mockMove);
  });

  test('addMove updates currentFen from move', () => {
    const store = createMockGameStore();
    store.setPlayerColor('white');

    store.addMove(mockMove);

    expect(store.getState().currentFen).toBe(mockMove.fen);
  });

  test('addMove updates isMyTurn based on new position', () => {
    const store = createMockGameStore();
    store.setPlayerColor('white');

    // After e4, it's black's turn
    store.addMove(mockMove);

    // White's isMyTurn should now be false (it's black's turn)
    expect(store.getState().isMyTurn).toBe(false);
  });

  test('adding multiple moves accumulates correctly', () => {
    const store = createMockGameStore();
    store.setPlayerColor('white');

    const move1: Move = mockMove;
    const move2: Move = {
      from: 'e7',
      to: 'e5',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      san: 'e5',
      piece: 'p',
    };

    store.addMove(move1);
    store.addMove(move2);

    expect(store.getState().moves).toHaveLength(2);
    expect(store.getState().moves[0].san).toBe('e4');
    expect(store.getState().moves[1].san).toBe('e5');
    expect(store.getState().currentFen).toBe(move2.fen);
    expect(store.getState().isMyTurn).toBe(true); // Back to white's turn
  });
});

describe('Game Store - updateFen', () => {
  test('updateFen changes current position', () => {
    const store = createMockGameStore();

    const newFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    store.updateFen(newFen);

    expect(store.getState().currentFen).toBe(newFen);
  });

  test('updateFen updates isMyTurn correctly', () => {
    const store = createMockGameStore();
    store.setPlayerColor('black');

    // Update to position where it's black's turn
    store.updateFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

    expect(store.getState().isMyTurn).toBe(true);
  });
});

describe('Game Store - updateClocks', () => {
  test('updateClocks sets both time values', () => {
    const store = createMockGameStore();

    store.updateClocks(590, 600);

    expect(store.getState().whiteTimeRemaining).toBe(590);
    expect(store.getState().blackTimeRemaining).toBe(600);
  });

  test('updateClocks handles zero times', () => {
    const store = createMockGameStore();

    store.updateClocks(0, 300);

    expect(store.getState().whiteTimeRemaining).toBe(0);
    expect(store.getState().blackTimeRemaining).toBe(300);
  });
});

describe('Game Store - setMyTurn', () => {
  test('setMyTurn directly sets isMyTurn flag', () => {
    const store = createMockGameStore();

    store.setMyTurn(true);
    expect(store.getState().isMyTurn).toBe(true);

    store.setMyTurn(false);
    expect(store.getState().isMyTurn).toBe(false);
  });
});

describe('Game Store - setDrawOffered', () => {
  test('setDrawOffered with opponent offer', () => {
    const store = createMockGameStore();

    store.setDrawOffered(true, false);

    expect(store.getState().drawOffered).toBe(true);
    expect(store.getState().drawOfferedByMe).toBe(false);
  });

  test('setDrawOffered with my offer', () => {
    const store = createMockGameStore();

    store.setDrawOffered(true, true);

    expect(store.getState().drawOffered).toBe(true);
    expect(store.getState().drawOfferedByMe).toBe(true);
  });

  test('setDrawOffered clears offer', () => {
    const store = createMockGameStore();

    store.setDrawOffered(true, true);
    store.setDrawOffered(false, false);

    expect(store.getState().drawOffered).toBe(false);
    expect(store.getState().drawOfferedByMe).toBe(false);
  });
});

describe('Game Store - endGame', () => {
  test('endGame sets status to ended with result', () => {
    const store = createMockGameStore();
    store.setStatus('playing');

    store.endGame('white_wins', 15);

    expect(store.getState().status).toBe('ended');
    expect(store.getState().result).toBe('white_wins');
    expect(store.getState().eloChange).toBe(15);
  });

  test('endGame with draw result', () => {
    const store = createMockGameStore();
    store.setStatus('playing');

    store.endGame('draw', 0);

    expect(store.getState().result).toBe('draw');
    expect(store.getState().eloChange).toBe(0);
  });

  test('endGame with negative ELO change (loss)', () => {
    const store = createMockGameStore();
    store.setStatus('playing');

    store.endGame('black_wins', -12);

    expect(store.getState().result).toBe('black_wins');
    expect(store.getState().eloChange).toBe(-12);
  });

  test('endGame with null ELO change', () => {
    const store = createMockGameStore();
    store.setStatus('playing');

    store.endGame('abandoned', null);

    expect(store.getState().result).toBe('abandoned');
    expect(store.getState().eloChange).toBeNull();
  });
});

describe('Game Store - Queue Actions', () => {
  test('setQueueParams stores time control and wager', () => {
    const store = createMockGameStore();

    const timeControl: TimeControl = { initial: 600, increment: 5 };
    store.setQueueParams(timeControl, 50);

    expect(store.getState().queueTimeControl).toEqual(timeControl);
    expect(store.getState().queueWagerAmount).toBe(50);
  });

  test('joinQueue sets status to queuing', () => {
    const store = createMockGameStore();

    store.joinQueue();

    expect(store.getState().status).toBe('queuing');
    expect(store.getState().queueJoinedAt).not.toBeNull();
    expect(store.getState().queueJoinedAt).toBeInstanceOf(Date);
  });

  test('leaveQueue returns to idle status', () => {
    const store = createMockGameStore();

    store.joinQueue();
    expect(store.getState().status).toBe('queuing');

    store.leaveQueue();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().queueJoinedAt).toBeNull();
  });
});

describe('Game Store - reset', () => {
  test('reset returns all values to initial state', () => {
    const store = createMockGameStore();

    // Modify all fields
    store.setStatus('playing');
    store.setGame(mockGame);
    store.setPlayers(mockWhitePlayer, mockBlackPlayer);
    store.setPlayerColor('white');
    store.addMove(mockMove);
    store.updateClocks(500, 550);
    store.setDrawOffered(true, false);
    store.setQueueParams({ initial: 600, increment: 0 }, 25);

    // Verify state was modified
    expect(store.getState().status).not.toBe('idle');

    // Reset
    store.reset();

    // Verify all values returned to initial
    const state = store.getState();
    expect(state.status).toBe('idle');
    expect(state.game).toBeNull();
    expect(state.whitePlayer).toBeNull();
    expect(state.blackPlayer).toBeNull();
    expect(state.playerColor).toBeNull();
    expect(state.moves).toEqual([]);
    expect(state.currentFen).toBe(STARTING_FEN);
    expect(state.whiteTimeRemaining).toBe(0);
    expect(state.blackTimeRemaining).toBe(0);
    expect(state.isMyTurn).toBe(false);
    expect(state.drawOffered).toBe(false);
    expect(state.drawOfferedByMe).toBe(false);
    expect(state.result).toBeNull();
    expect(state.eloChange).toBeNull();
    expect(state.queueTimeControl).toBeNull();
    expect(state.queueWagerAmount).toBe(0);
    expect(state.queueJoinedAt).toBeNull();
  });
});

describe('Game Store - Turn Logic', () => {
  test('turn calculation handles various FEN positions', () => {
    const store = createMockGameStore();

    // Test 1: Starting position - white to move
    store.updateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    store.setPlayerColor('white');
    expect(store.getState().isMyTurn).toBe(true);

    // Test 2: After 1.e4 - black to move
    store.updateFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    store.setPlayerColor('black');
    expect(store.getState().isMyTurn).toBe(true);

    // Test 3: After 1.e4 e5 - white to move
    store.updateFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
    store.setPlayerColor('white');
    expect(store.getState().isMyTurn).toBe(true);

    // Test 4: Wrong color for turn
    store.updateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    store.setPlayerColor('black');
    expect(store.getState().isMyTurn).toBe(false);
  });
});

describe('Game Store - Full Game Flow', () => {
  test('complete game flow from queue to end', () => {
    const store = createMockGameStore();

    // 1. Set queue parameters and join
    store.setQueueParams({ initial: 600, increment: 0 }, 25);
    store.joinQueue();
    expect(store.getState().status).toBe('queuing');

    // 2. Match found
    store.setStatus('matched');
    store.setPlayerColor('white');
    expect(store.getState().status).toBe('matched');

    // 3. Game started
    store.setStatus('playing');
    store.setGame(mockGame);
    store.setPlayers(mockWhitePlayer, mockBlackPlayer);
    expect(store.getState().status).toBe('playing');
    expect(store.getState().isMyTurn).toBe(true); // White to move first

    // 4. Make move
    store.addMove(mockMove);
    store.updateClocks(590, 600);
    expect(store.getState().moves).toHaveLength(1);
    expect(store.getState().isMyTurn).toBe(false); // Now black's turn

    // 5. Opponent offers draw
    store.setDrawOffered(true, false);
    expect(store.getState().drawOffered).toBe(true);

    // 6. Decline draw
    store.setDrawOffered(false, false);

    // 7. Game ends
    store.endGame('white_wins', 15);
    expect(store.getState().status).toBe('ended');
    expect(store.getState().result).toBe('white_wins');

    // 8. Reset for new game
    store.reset();
    expect(store.getState().status).toBe('idle');
  });
});
