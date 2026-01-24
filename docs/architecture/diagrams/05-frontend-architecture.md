# Frontend Architecture

Next.js app with Zustand state management and WebSocket real-time updates.

## Component Hierarchy

```mermaid
graph TD
    subgraph NextJS["Next.js App Router"]
        Layout["layout.tsx<br/>(Root layout + Providers)"]
        Home["page.tsx<br/>(Home → Dashboard)"]
        Profile["profile/page.tsx"]
    end

    subgraph Providers["Provider Wrappers"]
        WalletProvider["WalletProvider<br/>(Wagmi + RainbowKit)"]
        QueryProvider["QueryClientProvider<br/>(React Query)"]
    end

    subgraph Dashboard["Dashboard Tabs"]
        HomeDash["HomeDashboard<br/>(stats, quick actions)"]
        Play["MatchmakingPanel<br/>(find game)"]
        Marketplace["ChallengeMarketplace<br/>(browse/create)"]
        Spectate["SpectatorView<br/>(watch games)"]
        Practice["LocalGame<br/>(vs self, IDE layout)"]
        History["HistoryPage<br/>(game records)"]
    end

    subgraph GameUI["Active Game UI"]
        GameBoard["GameBoard<br/>(full-screen layout)"]
        ChessBoard["ChessBoard<br/>(board + pieces)"]
        GameClock["GameClock x2<br/>(white + black)"]
        MoveHistory["MoveHistory<br/>(move list)"]
        GameControls["GameControls<br/>(resign, draw)"]
        GameEndDialog["GameEndDialog<br/>(result modal)"]
        PromotionDialog["PromotionDialog<br/>(pawn → Q/R/B/N)"]
    end

    subgraph SpectatorUI["Spectator UI"]
        ActiveGames["ActiveGamesLobby<br/>(game list)"]
        SpectatorView["SpectatorView<br/>(board + extras)"]
        SpectatorChat["SpectatorChat<br/>(live messages)"]
        PredictionPanel["PredictionPanel<br/>(P2P bets)"]
    end

    subgraph WalletUI["Wallet UI"]
        WalletButton["WalletButton<br/>(connect)"]
        WalletModal["WalletModal<br/>(balance, txns)"]
        BalanceDisplay["BalanceDisplay<br/>(USDC amount)"]
    end

    Layout --> Providers
    Providers --> Home
    Providers --> Profile
    Home --> Dashboard

    Dashboard --> GameUI
    Dashboard --> SpectatorUI
    GameBoard --> ChessBoard
    GameBoard --> GameClock
    GameBoard --> MoveHistory
    GameBoard --> GameControls
    GameBoard --> GameEndDialog
    ChessBoard --> PromotionDialog

    SpectatorView --> SpectatorChat
    SpectatorView --> PredictionPanel

    Layout --> WalletUI
```

## State Management (Zustand Stores)

```mermaid
graph TB
    subgraph Stores["Zustand Stores (Client State)"]
        AuthStore["authStore<br/>━━━━━━━━━━━━━<br/>user: User | null<br/>token: string | null<br/>━━━━━━━━━━━━━<br/>login(), logout()<br/>setUser(), setToken()"]

        GameStore["gameStore<br/>━━━━━━━━━━━━━<br/>status: idle|queuing|playing|ended<br/>game: Game | null<br/>moves: Move[]<br/>currentFen: string<br/>whiteTime, blackTime: number<br/>isMyTurn: boolean<br/>playerColor: white|black<br/>drawOffered: boolean<br/>━━━━━━━━━━━━━<br/>addMove(), updateClocks()<br/>startGame(), endGame()"]

        SpectatorStore["spectatorStore<br/>━━━━━━━━━━━━━<br/>isSpectating: boolean<br/>currentGameId: string<br/>gameList: SpectatorGame[]<br/>━━━━━━━━━━━━━<br/>joinSpectate(), leave()<br/>updateGameState()"]

        ChallengeStore["challengeStore<br/>━━━━━━━━━━━━━<br/>challenges: Challenge[]<br/>myChallenges: Challenge[]<br/>statusFilter: string<br/>━━━━━━━━━━━━━<br/>setChallenges()<br/>addChallenge()"]

        ChatStore["spectatorChatStore<br/>━━━━━━━━━━━━━<br/>messages: Map<gameId, Msg[]><br/>━━━━━━━━━━━━━<br/>addMessage()"]

        WalletStore["walletStore<br/>━━━━━━━━━━━━━<br/>address: string | null<br/>balance: number (USDC)<br/>chainId: 137 (Polygon)<br/>isConnected: boolean<br/>━━━━━━━━━━━━━<br/>connect(), disconnect()"]

        FlagStore["flagStore<br/>━━━━━━━━━━━━━<br/>flags: Map<name, bool><br/>━━━━━━━━━━━━━<br/>isEnabled(name)"]
    end

    subgraph DataSources["Data Sources"]
        WSHook["useWebSocket<br/>(real-time updates)"]
        APIHook["useApi<br/>(REST fetches)"]
        WagmiHook["useWallet<br/>(blockchain state)"]
        LocalStorage["localStorage<br/>(persist auth token)"]
    end

    WSHook -->|"game:move_made"| GameStore
    WSHook -->|"game:started"| GameStore
    WSHook -->|"game:ended"| GameStore
    WSHook -->|"clock:tick"| GameStore
    WSHook -->|"challenge:updated"| ChallengeStore
    WSHook -->|"spectator:chat"| ChatStore
    WSHook -->|"queue:matched"| GameStore

    APIHook -->|"GET /auth/me"| AuthStore
    APIHook -->|"GET /games/history"| GameStore
    APIHook -->|"GET /leaderboard"| SpectatorStore

    WagmiHook -->|"wallet state"| WalletStore
    LocalStorage -->|"hydrate token"| AuthStore
```

## WebSocket Hook Architecture

```mermaid
sequenceDiagram
    participant Component as React Component
    participant Hook as useWebSocket()
    participant WS as WebSocket Connection
    participant Server as Bun Server
    participant Stores as Zustand Stores

    Note over Component,Stores: App mounts

    Component->>Hook: useWebSocket()
    Hook->>WS: new WebSocket(WS_URL)
    WS->>Server: Upgrade (JWT in query)
    Server-->>WS: Connected

    Note over Component,Stores: Incoming message routing

    Server->>WS: {type: 'game:move_made', payload}
    WS->>Hook: onmessage(event)
    Hook->>Hook: JSON.parse(event.data)

    alt type === 'game:move_made'
        Hook->>Stores: gameStore.addMove(payload)
    else type === 'clock:tick'
        Hook->>Stores: gameStore.updateClocks(payload)
    else type === 'game:ended'
        Hook->>Stores: gameStore.endGame(payload)
    else type === 'challenge:updated'
        Hook->>Stores: challengeStore.setChallenges(payload)
    else type === 'spectator:chat_message'
        Hook->>Stores: chatStore.addMessage(payload)
    end

    Note over Component,Stores: Component sends message

    Component->>Hook: send('game:move', {from, to})
    Hook->>WS: ws.send(JSON.stringify({type, payload}))
    WS->>Server: Message delivered
```

## Wallet Integration (Polygon USDC)

```mermaid
graph TD
    subgraph Config["wagmi.ts Configuration"]
        Chain["chains: [polygon]<br/>chainId: 137"]
        Transport["transports: { 137: http() }"]
        USDC["USDC_ADDRESS:<br/>0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"]
        WC["WalletConnect projectId"]
    end

    subgraph Providers_W["Provider Stack"]
        WagmiProv["WagmiProvider<br/>(config)"]
        QueryProv["QueryClientProvider"]
        RainbowProv["RainbowKitProvider<br/>(dark theme)"]
    end

    subgraph Wallets["Supported Wallets"]
        MM["MetaMask"]
        WCW["WalletConnect"]
        CB["Coinbase Wallet"]
        Rainbow["Rainbow"]
    end

    subgraph Actions["User Actions"]
        Connect["Connect Wallet"]
        Balance["View USDC Balance"]
        Deposit["Deposit USDC"]
        Withdraw["Withdraw USDC"]
    end

    Config --> Providers_W
    Providers_W --> Wallets
    Wallets --> Actions
    Actions -->|"on-chain"| Polygon["Polygon Network"]
```
