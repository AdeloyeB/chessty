import { create } from 'zustand';
import type { ChallengeWithCreator, GameMode } from '@chess-game/shared';
import { USE_MOCK_DATA, generateMockChallenges } from '@/lib/mock/mockData';

type ChallengeUIState =
  | 'idle'           // No active challenge, browsing marketplace
  | 'creating'       // Creating a new challenge
  | 'waiting'        // Waiting for someone to accept our challenge
  | 'accepted'       // Someone accepted our challenge, awaiting confirmations
  | 'confirming'     // We accepted a challenge, awaiting confirmations
  | 'starting';      // Both confirmed, game is starting

interface ChallengeState {
  // UI state
  uiState: ChallengeUIState;

  // Challenge list (marketplace)
  challenges: ChallengeWithCreator[];

  // User's active challenge (if any)
  myChallenge: ChallengeWithCreator | null;

  // Challenge creation form state
  formGameMode: GameMode;
  formTimeControlKey: string;
  formStakeAmount: number;
  formMinElo: number | null;
  formMaxElo: number | null;

  // Confirmation state
  creatorConfirmed: boolean;
  acceptorConfirmed: boolean;

  // Actions
  setUIState: (state: ChallengeUIState) => void;
  setChallenges: (challenges: ChallengeWithCreator[]) => void;
  setMyChallenge: (challenge: ChallengeWithCreator | null) => void;

  // Form actions
  setFormGameMode: (mode: GameMode) => void;
  setFormTimeControlKey: (key: string) => void;
  setFormStakeAmount: (amount: number) => void;
  setFormMinElo: (elo: number | null) => void;
  setFormMaxElo: (elo: number | null) => void;

  // Challenge flow actions
  challengeCreated: (challenge: ChallengeWithCreator) => void;
  challengeAccepted: (challenge: ChallengeWithCreator) => void;
  challengeConfirmed: () => void;
  challengeDeclined: () => void;
  challengeCancelled: () => void;
  challengeExpired: () => void;

  // Reset
  reset: () => void;
}

// Generate initial mock challenges if mock data is enabled
const mockChallenges = USE_MOCK_DATA ? generateMockChallenges(15) : [];

const initialState = {
  uiState: 'idle' as ChallengeUIState,
  challenges: USE_MOCK_DATA ? (mockChallenges as unknown as ChallengeWithCreator[]) : [],
  myChallenge: null,
  formGameMode: 'standard' as GameMode,
  formTimeControlKey: 'blitz_5',
  formStakeAmount: 25,
  formMinElo: null,
  formMaxElo: null,
  creatorConfirmed: false,
  acceptorConfirmed: false,
};

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  ...initialState,

  setUIState: (uiState) => set({ uiState }),

  setChallenges: (challenges) => set({ challenges }),

  setMyChallenge: (challenge) => set({ myChallenge: challenge }),

  // Form actions
  setFormGameMode: (mode) => set({ formGameMode: mode }),
  setFormTimeControlKey: (key) => set({ formTimeControlKey: key }),
  setFormStakeAmount: (amount) => set({ formStakeAmount: amount }),
  setFormMinElo: (elo) => set({ formMinElo: elo }),
  setFormMaxElo: (elo) => set({ formMaxElo: elo }),

  // Challenge flow
  challengeCreated: (challenge) =>
    set({
      uiState: 'waiting',
      myChallenge: challenge,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    }),

  challengeAccepted: (challenge) => {
    const { myChallenge } = get();
    const isCreator = myChallenge?.id === challenge.id;

    set({
      uiState: isCreator ? 'accepted' : 'confirming',
      myChallenge: challenge,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    });
  },

  challengeConfirmed: () =>
    set((state) => {
      const isCreator = state.myChallenge?.creatorId === state.myChallenge?.creatorId;
      return {
        creatorConfirmed: isCreator ? true : state.creatorConfirmed,
        acceptorConfirmed: !isCreator ? true : state.acceptorConfirmed,
      };
    }),

  challengeDeclined: () =>
    set({
      uiState: 'idle',
      myChallenge: null,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    }),

  challengeCancelled: () =>
    set({
      uiState: 'idle',
      myChallenge: null,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    }),

  challengeExpired: () =>
    set({
      uiState: 'idle',
      myChallenge: null,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    }),

  reset: () => set(initialState),
}));
