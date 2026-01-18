import { create } from 'zustand';
import type { SpectatorChatMessage, SpectatorPredictionWithUsers } from '@chess-game/shared';
import { USE_MOCK_DATA, MOCK_PLAYERS, getRandomPlayers } from '@/lib/mock/mockData';

// Generate mock chat messages for demo
const generateMockChatMessages = (): SpectatorChatMessage[] => {
  if (!USE_MOCK_DATA) return [];

  const chatters = getRandomPlayers(8);
  const messages = [
    'This is gonna be a great game!',
    'Let\'s go white!',
    'Black has the better position',
    'That was a brilliant sacrifice',
    'Who do you think wins this?',
    'The endgame will be interesting',
    'Nice opening choice',
    'Wow, didn\'t see that coming',
  ];

  return chatters.map((chatter, index) => ({
    id: `mock-chat-${index}`,
    gameId: 'active-game-1', // Will be updated when spectating
    userId: chatter.id,
    username: chatter.username,
    message: messages[index],
    createdAt: new Date(Date.now() - (8 - index) * 45000), // Staggered times
  }));
};

// Generate mock predictions for demo
const generateMockPredictions = (): SpectatorPredictionWithUsers[] => {
  if (!USE_MOCK_DATA) return [];

  const predictors = getRandomPlayers(5);
  const players = getRandomPlayers(2);
  const amounts = [10, 25, 50, 20, 100];

  return predictors.map((predictor, index) => ({
    id: `mock-pred-${index}`,
    gameId: 'active-game-1',
    creatorId: predictor.id,
    creator: {
      id: predictor.id,
      username: predictor.username,
      eloRating: predictor.eloRating,
      peakEloRating: predictor.peakEloRating,
      gamesPlayed: predictor.gamesPlayed,
      gamesWon: predictor.gamesWon,
      gamesLost: predictor.gamesLost,
      gamesDraw: predictor.gamesDraw,
    },
    predictedWinnerId: players[index % 2].id,
    predictedWinner: {
      id: players[index % 2].id,
      username: players[index % 2].username,
      eloRating: players[index % 2].eloRating,
      peakEloRating: players[index % 2].peakEloRating,
      gamesPlayed: players[index % 2].gamesPlayed,
      gamesWon: players[index % 2].gamesWon,
      gamesLost: players[index % 2].gamesLost,
      gamesDraw: players[index % 2].gamesDraw,
    },
    amount: amounts[index],
    status: index < 3 ? 'open' : 'matched',
    acceptorId: index >= 3 ? MOCK_PLAYERS[10 + index].id : null,
    acceptor: index >= 3 ? {
      id: MOCK_PLAYERS[10 + index].id,
      username: MOCK_PLAYERS[10 + index].username,
      eloRating: MOCK_PLAYERS[10 + index].eloRating,
      peakEloRating: MOCK_PLAYERS[10 + index].peakEloRating,
      gamesPlayed: MOCK_PLAYERS[10 + index].gamesPlayed,
      gamesWon: MOCK_PLAYERS[10 + index].gamesWon,
      gamesLost: MOCK_PLAYERS[10 + index].gamesLost,
      gamesDraw: MOCK_PLAYERS[10 + index].gamesDraw,
    } : undefined,
    createdAt: new Date(Date.now() - (5 - index) * 60000),
    settledAt: null,
  })) as SpectatorPredictionWithUsers[];
};

interface SpectatorChatState {
  // Chat messages
  messages: SpectatorChatMessage[];

  // Predictions
  predictions: SpectatorPredictionWithUsers[];

  // UI state
  chatInputValue: string;
  predictionAmount: number;

  // Actions
  addMessage: (message: SpectatorChatMessage) => void;
  setMessages: (messages: SpectatorChatMessage[]) => void;
  clearMessages: () => void;

  setPredictions: (predictions: SpectatorPredictionWithUsers[]) => void;
  addPrediction: (prediction: SpectatorPredictionWithUsers) => void;
  updatePrediction: (prediction: SpectatorPredictionWithUsers) => void;

  setChatInputValue: (value: string) => void;
  setPredictionAmount: (amount: number) => void;

  reset: () => void;
}

const initialState = {
  messages: generateMockChatMessages(),
  predictions: generateMockPredictions(),
  chatInputValue: '',
  predictionAmount: 10,
};

export const useSpectatorChatStore = create<SpectatorChatState>((set) => ({
  ...initialState,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message].slice(-100), // Keep last 100 messages
    })),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  setPredictions: (predictions) => set({ predictions }),

  addPrediction: (prediction) =>
    set((state) => ({
      predictions: [prediction, ...state.predictions],
    })),

  updatePrediction: (prediction) =>
    set((state) => ({
      predictions: state.predictions.map((p) =>
        p.id === prediction.id ? prediction : p
      ),
    })),

  setChatInputValue: (value) => set({ chatInputValue: value }),

  setPredictionAmount: (amount) => set({ predictionAmount: amount }),

  reset: () => set(initialState),
}));
