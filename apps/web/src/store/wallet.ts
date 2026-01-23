import { create } from 'zustand'
import { USE_MOCK_DATA } from '@/lib/mock/mockData'

export type BalanceChangeType =
  | 'game_win'
  | 'game_loss'
  | 'prediction_win'
  | 'prediction_loss'
  | 'deposit'
  | 'withdrawal'

export interface BalanceChange {
  id: string
  type: BalanceChangeType
  amount: number
  timestamp: Date
  description: string
  // Additional details
  opponent?: string
  gameId?: string
  prediction?: string
  txHash?: string
}

interface WalletState {
  // Connection state
  isConnected: boolean
  address: string | null
  chainId: number | null

  // Balance state
  usdcBalance: string
  isLoadingBalance: boolean

  // Balance history
  balanceHistory: BalanceChange[]

  // Modal state
  isWalletModalOpen: boolean

  // Dev mode
  isDevMode: boolean

  // Actions
  setConnected: (address: string, chainId: number) => void
  setDisconnected: () => void
  setBalance: (balance: string) => void
  setLoadingBalance: (loading: boolean) => void
  openWalletModal: () => void
  closeWalletModal: () => void
  setChainId: (chainId: number) => void
  addBalanceChange: (change: Omit<BalanceChange, 'id' | 'timestamp'>) => void
  initDevMode: () => void
}

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9)

// Dev mode fake history with more details
const DEV_BALANCE_HISTORY: BalanceChange[] = [
  {
    id: generateId(),
    type: 'deposit',
    amount: 500,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    description: 'Initial deposit',
    txHash: '0x1a2b...3c4d',
  },
  {
    id: generateId(),
    type: 'game_win',
    amount: 50,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    description: 'Won vs KnightRider99',
    opponent: 'KnightRider99',
    gameId: 'G-7823',
  },
  {
    id: generateId(),
    type: 'prediction_win',
    amount: 25,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20), // 20 hours ago
    description: 'Prediction: GrandMaster_X wins',
    prediction: 'GrandMaster_X',
    gameId: 'G-7819',
  },
  {
    id: generateId(),
    type: 'game_loss',
    amount: -30,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
    description: 'Lost vs QueenGambit',
    opponent: 'QueenGambit',
    gameId: 'G-7831',
  },
  {
    id: generateId(),
    type: 'prediction_loss',
    amount: -15,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    description: 'Prediction: BishopSlayer wins',
    prediction: 'BishopSlayer',
    gameId: 'G-7842',
  },
  {
    id: generateId(),
    type: 'game_win',
    amount: 75,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    description: 'Won vs PawnStorm',
    opponent: 'PawnStorm',
    gameId: 'G-7856',
  },
  {
    id: generateId(),
    type: 'prediction_win',
    amount: 40,
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    description: 'Prediction: RookieKing wins',
    prediction: 'RookieKing',
    gameId: 'G-7861',
  },
]

export const useWalletStore = create<WalletState>((set, get) => ({
  // Initial state - auto-enable dev mode when USE_MOCK_DATA is true
  isConnected: USE_MOCK_DATA,
  address: USE_MOCK_DATA ? '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD2e' : null,
  chainId: USE_MOCK_DATA ? 137 : null, // Polygon
  usdcBalance: USE_MOCK_DATA ? '1250.00' : '0',
  isLoadingBalance: false,
  isWalletModalOpen: false,
  balanceHistory: USE_MOCK_DATA ? DEV_BALANCE_HISTORY : [],
  isDevMode: USE_MOCK_DATA,

  // Actions
  setConnected: (address, chainId) =>
    set({
      isConnected: true,
      address,
      chainId,
    }),

  setDisconnected: () =>
    set({
      isConnected: false,
      address: null,
      chainId: null,
      usdcBalance: '0',
      balanceHistory: [],
      isDevMode: false,
    }),

  setBalance: (balance) =>
    set({
      usdcBalance: balance,
    }),

  setLoadingBalance: (loading) =>
    set({
      isLoadingBalance: loading,
    }),

  openWalletModal: () =>
    set({
      isWalletModalOpen: true,
    }),

  closeWalletModal: () =>
    set({
      isWalletModalOpen: false,
    }),

  setChainId: (chainId) =>
    set({
      chainId,
    }),

  addBalanceChange: (change) => {
    const newChange: BalanceChange = {
      ...change,
      id: generateId(),
      timestamp: new Date(),
    }

    const currentBalance = parseFloat(get().usdcBalance) || 0
    const newBalance = currentBalance + change.amount

    set((state) => ({
      balanceHistory: [newChange, ...state.balanceHistory].slice(0, 50), // Keep last 50
      usdcBalance: newBalance.toString(),
    }))
  },

  initDevMode: () =>
    set({
      isConnected: true,
      address: '0x1234567890abcdef1234567890abcdef12345678',
      chainId: 137, // Polygon
      usdcBalance: '645.00',
      balanceHistory: DEV_BALANCE_HISTORY,
      isDevMode: true,
    }),
}))
