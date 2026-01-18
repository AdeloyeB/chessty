'use client'

import { useEffect, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContracts, useChainId } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { useWalletStore } from '@/store/wallet'
import { USDC_ADDRESSES, type SupportedChainId } from '@/config/wagmi'

export function useWallet() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  const wagmiChainId = useChainId()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()

  const {
    isConnected: storeConnected,
    address: storeAddress,
    chainId: storeChainId,
    usdcBalance,
    isLoadingBalance,
    isWalletModalOpen,
    balanceHistory,
    isDevMode,
    setConnected,
    setDisconnected,
    setBalance,
    setLoadingBalance,
    openWalletModal,
    closeWalletModal,
    addBalanceChange,
    initDevMode,
  } = useWalletStore()

  // Use store state if in dev mode, otherwise use wagmi state
  const isConnected = isDevMode ? storeConnected : wagmiConnected
  const address = isDevMode ? storeAddress : wagmiAddress
  const chainId = isDevMode ? storeChainId : wagmiChainId

  // Get USDC address for current chain
  const usdcAddress = useMemo(() => {
    if (chainId && chainId in USDC_ADDRESSES) {
      return USDC_ADDRESSES[chainId as SupportedChainId]
    }
    return undefined
  }, [chainId])

  // Read USDC balance (only when not in dev mode)
  const { data: contractData, isLoading: isReadingBalance } = useReadContracts({
    contracts: usdcAddress && wagmiAddress && !isDevMode
      ? [
          {
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wagmiAddress],
          },
          {
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'decimals',
          },
        ]
      : [],
    query: {
      enabled: !!usdcAddress && !!wagmiAddress && wagmiConnected && !isDevMode,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  })

  // Sync wagmi state with Zustand store (only when not in dev mode)
  useEffect(() => {
    if (isDevMode) return

    if (wagmiConnected && wagmiAddress && wagmiChainId) {
      setConnected(wagmiAddress, wagmiChainId)
    } else {
      setDisconnected()
    }
  }, [wagmiConnected, wagmiAddress, wagmiChainId, setConnected, setDisconnected, isDevMode])

  // Sync balance loading state (only when not in dev mode)
  useEffect(() => {
    if (isDevMode) return
    setLoadingBalance(isReadingBalance)
  }, [isReadingBalance, setLoadingBalance, isDevMode])

  // Process balance data (only when not in dev mode)
  useEffect(() => {
    if (isDevMode) return

    if (contractData && contractData[0]?.result !== undefined && contractData[1]?.result !== undefined) {
      const balance = contractData[0].result as bigint
      const decimals = contractData[1].result as number
      const formattedBalance = formatUnits(balance, decimals)
      setBalance(formattedBalance)
    }
  }, [contractData, setBalance, isDevMode])

  // Truncated address for display
  const truncatedAddress = useMemo(() => {
    if (!address) return null
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }, [address])

  // Connect to a specific connector
  const connectWallet = (connectorId: string) => {
    const connector = connectors.find((c) => c.id === connectorId)
    if (connector) {
      connect({ connector })
    }
  }

  // Disconnect wallet
  const disconnectWallet = () => {
    if (isDevMode) {
      setDisconnected()
    } else {
      disconnect()
    }
    closeWalletModal()
  }

  return {
    // State
    isConnected,
    address,
    truncatedAddress,
    chainId,
    usdcBalance,
    isLoadingBalance,
    isConnecting,
    isWalletModalOpen,
    balanceHistory,
    isDevMode,

    // Available connectors
    connectors,

    // Actions
    connectWallet,
    disconnectWallet,
    openWalletModal,
    closeWalletModal,
    addBalanceChange,
    initDevMode,
  }
}
