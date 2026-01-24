# Services Layer Architecture

Business logic layer between coordinators/routes and the database.

## Service Dependencies

```mermaid
graph TD
    subgraph Callers["Who Calls Services"]
        Routes["REST Routes<br/>(HTTP endpoints)"]
        Coords["Coordinators<br/>(Game, Challenge)"]
        EventH["Event Handlers<br/>(persistence, odds)"]
    end

    subgraph Services["Services Layer"]
        AuthSvc["auth.ts<br/>━━━━━━━━━━━━━<br/>register(), login()<br/>generateToken()<br/>verifyToken()<br/>hashPassword()"]

        GameSvc["game.ts<br/>━━━━━━━━━━━━━<br/>getGame(), startGame()<br/>makeMove(), endGame()<br/>getGameWithPlayers()"]

        MatchSvc["matchmaking.ts<br/>━━━━━━━━━━━━━<br/>joinQueue()<br/>leaveQueue()<br/>findMatch()<br/>createGame()"]

        BetSvc["betting.ts<br/>━━━━━━━━━━━━━<br/>calculateOdds()<br/>placeBet()<br/>settleBets()<br/>refundBets()"]

        WalletSvc["wallet.ts<br/>━━━━━━━━━━━━━<br/>getBalance()<br/>credit(), debit()<br/>getTransactions()"]

        ChallengeSvc["challenge.ts<br/>━━━━━━━━━━━━━<br/>createChallenge()<br/>acceptChallenge()<br/>confirmPlayer()<br/>cancelChallenge()"]

        EloSvc["elo.ts<br/>━━━━━━━━━━━━━<br/>calculateEloChange()<br/>(K-factor, expected score)"]

        AchieveSvc["achievements.ts<br/>━━━━━━━━━━━━━<br/>checkAndUnlock()<br/>getUserAchievements()"]

        SpectChatSvc["spectatorChat.ts<br/>━━━━━━━━━━━━━<br/>saveMessage()<br/>getMessages()"]

        SpectPredSvc["spectatorPrediction.ts<br/>━━━━━━━━━━━━━<br/>createPrediction()<br/>matchPrediction()<br/>settlePredictions()"]

        FlagSvc["featureFlags.ts<br/>━━━━━━━━━━━━━<br/>getFlag()<br/>setFlag()<br/>getAllFlags()"]

        RateSvc["rateLimit.ts<br/>━━━━━━━━━━━━━<br/>checkLimit()<br/>(token bucket algorithm)"]

        SecuritySvc["security.ts<br/>━━━━━━━━━━━━━<br/>validateOrigin()<br/>detectBot()<br/>sanitizeInput()"]

        LockoutSvc["accountLockout.ts<br/>━━━━━━━━━━━━━<br/>checkLockout()<br/>recordFailure()<br/>resetAttempts()"]
    end

    subgraph DB["Database (Drizzle ORM)"]
        DrizzleDB["db instance<br/>(Neon Pool)"]
    end

    Routes --> AuthSvc
    Routes --> GameSvc
    Routes --> WalletSvc
    Routes --> BetSvc
    Routes --> FlagSvc

    Coords --> GameSvc
    Coords --> MatchSvc
    Coords --> ChallengeSvc
    Coords --> SpectChatSvc
    Coords --> SpectPredSvc

    EventH --> GameSvc
    EventH --> BetSvc
    EventH --> AchieveSvc
    EventH --> SpectPredSvc
    EventH --> EloSvc

    AuthSvc --> LockoutSvc

    GameSvc --> EloSvc
    GameSvc --> WalletSvc

    BetSvc --> WalletSvc

    Services --> DrizzleDB
```

## Betting & Odds Flow

```mermaid
sequenceDiagram
    participant Spectator as Spectator
    participant API as REST API
    participant BetSvc as betting.ts
    participant WalletSvc as wallet.ts
    participant DB as Database
    participant Events as Event System

    Note over Spectator,Events: Placing a Bet

    Spectator->>API: POST /api/betting/place {gameId, winnerId, amount: 10}
    API->>BetSvc: placeBet(userId, gameId, winnerId, amount)
    BetSvc->>BetSvc: calculateOdds(gameId) based on ELO difference
    BetSvc->>WalletSvc: debit(userId, amount)
    WalletSvc->>DB: UPDATE users SET balance -= 10
    WalletSvc->>DB: INSERT INTO transactions {type: 'bet', amount: -10}
    BetSvc->>DB: INSERT INTO bets {userId, gameId, winnerId, amount, odds}
    BetSvc-->>Spectator: {bet, potentialPayout}

    Note over Spectator,Events: Game Ends → Settle

    Events->>BetSvc: settleBets(gameId, winnerId)
    BetSvc->>DB: SELECT all bets WHERE gameId
    loop Each winning bet
        BetSvc->>WalletSvc: credit(userId, amount * odds)
        WalletSvc->>DB: UPDATE balance, INSERT transaction
        BetSvc->>DB: UPDATE bet SET status='won', payout
    end
    loop Each losing bet
        BetSvc->>DB: UPDATE bet SET status='lost'
    end
```

## ELO Rating Calculation

```mermaid
graph TD
    subgraph Inputs["Inputs"]
        WE["White ELO: 1200"]
        BE["Black ELO: 1350"]
        Result["Result: white_wins"]
    end

    subgraph Calc["ELO Calculation (elo.ts)"]
        Expected["Expected Score<br/>━━━━━━━━━━━━━<br/>E = 1 / (1 + 10^((opponent - player) / 400))<br/>━━━━━━━━━━━━━<br/>White expected: 0.29<br/>Black expected: 0.71"]

        KFactor["K-Factor<br/>━━━━━━━━━━━━━<br/>New player (<30 games): K=40<br/>Normal: K=20<br/>Master (>2400 ELO): K=10"]

        Change["Rating Change<br/>━━━━━━━━━━━━━<br/>Δ = K × (actual - expected)<br/>━━━━━━━━━━━━━<br/>White: +20 × (1 - 0.29) = +14<br/>Black: +20 × (0 - 0.71) = -14"]
    end

    subgraph Output["Results"]
        WNew["White: 1200 → 1214 (+14)"]
        BNew["Black: 1350 → 1336 (-14)"]
    end

    Inputs --> Expected
    Expected --> KFactor
    KFactor --> Change
    Change --> Output
```

## Matchmaking Algorithm

```mermaid
graph TD
    subgraph Queue["Matchmaking Queue"]
        P1["Player A<br/>ELO: 1200, Stake: $5<br/>TimeControl: 5+3"]
        P2["Player B<br/>ELO: 1180, Stake: $5<br/>TimeControl: 5+3"]
        P3["Player C<br/>ELO: 1500, Stake: $10<br/>TimeControl: 10+5"]
        P4["Player D<br/>ELO: 1220, Stake: $5<br/>TimeControl: 5+3"]
    end

    subgraph Matching["findMatch() Algorithm"]
        Filter1["1. Filter by TimeControl<br/>(must match exactly)"]
        Filter2["2. Filter by StakeAmount<br/>(must match exactly)"]
        Filter3["3. Filter by ELO Range<br/>(within min/max preferences)"]
        Sort["4. Sort by ELO proximity<br/>(closest rating first)"]
        Select["5. Select best match"]
    end

    subgraph Result["Match Result"]
        Match["Player A ↔ Player B<br/>ELO diff: 20 (within range)<br/>Same stake, same time control"]
        NoMatch["Player C: No match<br/>(unique stake + time control)"]
    end

    Queue --> Filter1
    Filter1 --> Filter2
    Filter2 --> Filter3
    Filter3 --> Sort
    Sort --> Select
    Select --> Result
```
