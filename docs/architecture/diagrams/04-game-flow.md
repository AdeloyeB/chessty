# Game Flow Architecture

Complete lifecycle of a chess game — from matchmaking to game end.

## Full Game Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Matchmaking: Player joins queue / accepts challenge

    state Matchmaking {
        Queue: In Queue<br/>(ELO + stake filtering)
        Matched: Opponent Found
        Queue --> Matched: findMatch() succeeds
    }

    Matchmaking --> GameCreated: createGame()

    state GameCreated {
        Waiting: Waiting for Players
        BothJoined: Both Connected
        Waiting --> BothJoined: game:join from both
    }

    GameCreated --> Active: startGame()

    state Active {
        WhiteTurn: White's Turn<br/>(clock ticking)
        BlackTurn: Black's Turn<br/>(clock ticking)
        DrawOffered: Draw Offered<br/>(waiting response)

        WhiteTurn --> BlackTurn: White moves
        BlackTurn --> WhiteTurn: Black moves
        WhiteTurn --> DrawOffered: offer_draw
        BlackTurn --> DrawOffered: offer_draw
        DrawOffered --> WhiteTurn: draw declined
        DrawOffered --> BlackTurn: draw declined
    }

    Active --> GameEnded: Checkmate / Stalemate / Resign / Timeout / Draw accepted

    state GameEnded {
        Settle: Settle bets & stakes
        ELO: Update ELO ratings
        Persist: Save to database
        Broadcast: Notify all clients

        Settle --> ELO
        ELO --> Persist
        Persist --> Broadcast
    }

    GameEnded --> [*]
```

## Move Round-Trip (Complete Data Flow)

```mermaid
sequenceDiagram
    participant UI as ChessBoard (React)
    participant Store as gameStore (Zustand)
    participant WS as useWebSocket
    participant Handler as handler.ts
    participant Coord as GameCoordinator
    participant State as GameStateManager
    participant Clock as ClockManager
    participant Events as GameEventEmitter
    participant DB as persistence.ts
    participant Bcast as broadcast.ts
    participant P2 as Player 2 WS

    UI->>Store: User clicks piece & square
    Store->>WS: send('game:move', {from: 'e2', to: 'e4'})
    WS->>Handler: WebSocket message received

    Handler->>Coord: handleMove(userId, {gameId, from, to})

    rect rgb(30, 30, 50)
        Note over Coord,State: Validation Phase
        Coord->>State: validateAndApplyMove(gameId, from, to)
        State->>State: Chess engine validates legality
        State-->>Coord: {move, fen, pgn, isGameOver, isCheckmate...}
    end

    alt Move is illegal
        Coord-->>Handler: Error: illegal move
        Handler-->>WS: send('error', {message})
        WS-->>UI: Show error toast
    else Move is legal
        rect rgb(30, 50, 30)
            Note over Coord,Clock: Clock Update
            Coord->>Clock: switchTurn(gameId, increment)
            Clock-->>Coord: {whiteTime, blackTime}
        end

        rect rgb(50, 30, 30)
            Note over Coord,Events: Event Emission
            Coord->>Events: emit('game:move_made', {move, fen, pgn, times...})
        end

        rect rgb(20, 20, 40)
            Note over Events,DB: Priority 10 (Blocking)
            Events->>DB: gameService.makeMove(gameId, move, fen, pgn, times)
            DB-->>Events: ✅ Saved
        end

        rect rgb(20, 40, 40)
            Note over Events,P2: Priority 50 (Broadcast)
            Events->>Bcast: broadcastToGame(gameId, 'game:move_made', data)
            Bcast->>WS: send to Player 1
            Bcast->>P2: send to Player 2
            Events->>Bcast: broadcastToSpectators(gameId, 'game:move_made', data)
        end

        WS-->>Store: Update game state
        Store-->>UI: Re-render board with new position
        P2-->>P2: Update opponent's board
    end
```

## Clock System

```mermaid
graph TD
    subgraph ClockInit["Clock Initialization"]
        Start["startClock(gameId, increment)"]
        Interval["setInterval every 100ms<br/>(CLOCK_SYNC_INTERVAL)"]
        Start --> Interval
    end

    subgraph ClockTick["Each Tick"]
        Dec["Decrement active player's time"]
        Check{"Time ≤ 0?"}
        Emit["emit('clock:tick', {whiteTime, blackTime})"]
        Timeout["emit('game:timeout', {loserId, winnerId})"]

        Dec --> Check
        Check -->|"No"| Emit
        Check -->|"Yes"| Timeout
    end

    subgraph OnMove["On Move Made"]
        Switch["Switch active color"]
        AddInc["Add increment to mover's clock"]
        Broadcast["Broadcast new times"]

        Switch --> AddInc --> Broadcast
    end

    Interval --> ClockTick
    Timeout --> EndGame["GameCoordinator.endGame()"]
```

## Challenge → Game Flow

```mermaid
sequenceDiagram
    participant A as Player A
    participant CC as ChallengeCoordinator
    participant CS as challengeService
    participant DB as Database
    participant B as Player B
    participant GC as GameCoordinator

    Note over A,B: Challenge Marketplace

    A->>CC: challenge:create {stake: 5, timeControl: {5,3}, minElo: 1000}
    CC->>CS: createChallenge(creatorId, params)
    CS->>DB: INSERT INTO challenges
    CC->>CC: broadcastToAll('challenge:updated')
    CC-->>A: Challenge created ✓

    Note over A,B: Player B sees challenge in marketplace

    B->>CC: challenge:accept {challengeId}
    CC->>CS: acceptChallenge(challengeId, opponentId)
    CS->>DB: UPDATE challenges SET opponent_id, status='accepted'
    CC-->>A: Notification: challenge accepted
    CC-->>B: Waiting for confirmations

    Note over A,B: Confirmation phase (30s timeout)

    A->>CC: challenge:confirm {challengeId}
    CC->>CS: confirmPlayer(challengeId, 'creator')
    B->>CC: challenge:confirm {challengeId}
    CC->>CS: confirmPlayer(challengeId, 'opponent')

    Note over CC,GC: Both confirmed → Start game

    CC->>CS: createGame(whiteId, blackId, stake, timeControl)
    CS->>DB: INSERT INTO games
    CC->>GC: joinGame(playerA, gameId)
    CC->>GC: joinGame(playerB, gameId)
    GC->>GC: startGame(gameId)
    GC-->>A: game:started {game, opponent}
    GC-->>B: game:started {game, opponent}
```
