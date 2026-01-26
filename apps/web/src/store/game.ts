import { create } from 'zustand';
import type { Game, Move, PublicUser, TimeControl } from '@chess-game/shared';

type GameStatus = 'idle' | 'queuing' | 'matched' | 'playing' | 'ended';

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

  // Queue state
  queueTimeControl: TimeControl | null;
  queueWagerAmount: number;
  queueJoinedAt: Date | null;

  // Actions
  setStatus: (status: GameStatus) => void;
  setGame: (game: Game) => void;
  setPlayers: (white: PublicUser, black: PublicUser) => void;
  setPlayerColor: (color: 'white' | 'black') => void;
  addMove: (move: Move) => void;
  updateFen: (fen: string) => void;
  updateClocks: (whiteTime: number, blackTime: number) => void;
  setMyTurn: (isMyTurn: boolean) => void;
  setDrawOffered: (offered: boolean, byMe: boolean) => void;
  endGame: (result: string, eloChange: number | null) => void;
  setQueueParams: (timeControl: TimeControl, wagerAmount: number) => void;
  joinQueue: () => void;
  leaveQueue: () => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as GameStatus,
  game: null,
  whitePlayer: null,
  blackPlayer: null,
  playerColor: null,
  moves: [],
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setStatus: (status) => set({ status }),

  setGame: (game) =>
    set({
      game,
      currentFen: game.currentFen,
      moves: game.moves,
      whiteTimeRemaining: game.whiteTimeRemaining,
      blackTimeRemaining: game.blackTimeRemaining,
    }),

  setPlayers: (white, black) => set({ whitePlayer: white, blackPlayer: black }),

  setPlayerColor: (color) => {
    const currentFen = get().currentFen;
    const isWhiteTurn = currentFen.split(' ')[1] === 'w';
    set({
      playerColor: color,
      isMyTurn: (isWhiteTurn && color === 'white') || (!isWhiteTurn && color === 'black'),
    });
  },

  addMove: (move) => {
    const { playerColor } = get();
    const isWhiteTurn = move.fen.split(' ')[1] === 'w';
    set((state) => ({
      moves: [...state.moves, move],
      currentFen: move.fen,
      isMyTurn: (isWhiteTurn && playerColor === 'white') || (!isWhiteTurn && playerColor === 'black'),
    }));
  },

  updateFen: (fen) => {
    const { playerColor } = get();
    const isWhiteTurn = fen.split(' ')[1] === 'w';
    set({
      currentFen: fen,
      isMyTurn: (isWhiteTurn && playerColor === 'white') || (!isWhiteTurn && playerColor === 'black'),
    });
  },

  updateClocks: (whiteTime, blackTime) =>
    set({ whiteTimeRemaining: whiteTime, blackTimeRemaining: blackTime }),

  setMyTurn: (isMyTurn) => set({ isMyTurn }),

  setDrawOffered: (offered, byMe) =>
    set({ drawOffered: offered, drawOfferedByMe: byMe }),

  endGame: (result, eloChange) =>
    set({ status: 'ended', result, eloChange }),

  setQueueParams: (timeControl, wagerAmount) =>
    set({ queueTimeControl: timeControl, queueWagerAmount: wagerAmount }),

  joinQueue: () => set({ status: 'queuing', queueJoinedAt: new Date() }),

  leaveQueue: () => set({ status: 'idle', queueJoinedAt: null }),

  reset: () => set(initialState),
}));
