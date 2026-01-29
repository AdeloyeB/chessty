import { create } from 'zustand';
import type { SpectatorPredictionWithUsers } from '@chess-game/shared';
import { USE_MOCK_DATA, MOCK_PLAYERS, getRandomPlayers } from '@/lib/mock/mockData';

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
      displayName: null,
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
      displayName: null,
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
      displayName: null,
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

interface SpectatorPredictionState {
  // Predictions
  predictions: SpectatorPredictionWithUsers[];

  // UI state
  predictionAmount: number;

  // Actions
  setPredictions: (predictions: SpectatorPredictionWithUsers[]) => void;
  addPrediction: (prediction: SpectatorPredictionWithUsers) => void;
  updatePrediction: (prediction: SpectatorPredictionWithUsers) => void;
  setPredictionAmount: (amount: number) => void;
  reset: () => void;
}

const initialState = {
  predictions: generateMockPredictions(),
  predictionAmount: 10,
};

export const useSpectatorPredictionStore = create<SpectatorPredictionState>((set) => ({
  ...initialState,

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

  setPredictionAmount: (amount) => set({ predictionAmount: amount }),

  reset: () => set(initialState),
}));
