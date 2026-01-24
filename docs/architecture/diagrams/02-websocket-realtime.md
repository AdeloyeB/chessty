# WebSocket & Real-Time Architecture

How persistent connections enable instant game updates.

## Connection Lifecycle

```mermaid
sequenceDiagram
    participant Client as Browser
    participant WS as WebSocket Handler
    participant Auth as Auth Service
    participant ConnMgr as ConnectionManager
    participant RoomMgr as RoomManager

    Client->>WS: WebSocket upgrade request (with JWT)
    WS->>Auth: verifyToken(jwt)
    Auth-->>WS: {userId, sessionId}

    alt Token Valid
        WS->>ConnMgr: add(userId, ws)
        ConnMgr-->>WS: Connection stored
        WS-->>Client: Connection established
        Client->>WS: ping (every 30s)
        WS-->>Client: pong
    else Token Invalid
        WS-->>Client: Close (4001 Unauthorized)
    end

    Note over Client,RoomMgr: Player joins a game...

    Client->>WS: {type: "game:join", gameId}
    WS->>RoomMgr: joinGame(userId, gameId)
    RoomMgr-->>WS: Added to room

    Note over Client,RoomMgr: On disconnect...

    Client->>WS: Connection lost
    WS->>ConnMgr: remove(userId)
    WS->>RoomMgr: leaveAllRooms(userId)
```

## Room & Connection Architecture

```mermaid
graph TB
    subgraph ConnectionManager["ConnectionManager"]
        direction LR
        C1["userId_1 → ws1"]
        C2["userId_2 → ws2"]
        C3["userId_3 → ws3"]
        C4["userId_4 → ws4"]
        C5["userId_5 → ws5"]
    end

    subgraph RoomManager["RoomManager"]
        subgraph GameRooms["Game Rooms"]
            G1["game_abc → {userId_1, userId_2}"]
            G2["game_xyz → {userId_3, userId_4}"]
        end

        subgraph SpectatorRooms["Spectator Rooms"]
            S1["game_abc → {userId_5}"]
            S2["game_xyz → {userId_6, userId_7}"]
        end
    end

    subgraph BroadcastService["BroadcastService Methods"]
        Send["sendToUser(userId, msg)<br/>→ single connection"]
        Game["broadcastToGame(gameId, msg)<br/>→ both players"]
        Spec["broadcastToSpectators(gameId, msg)<br/>→ all watchers"]
        All["broadcastToAll(msg)<br/>→ everyone connected"]
    end

    Send --> ConnectionManager
    Game --> GameRooms
    Game --> ConnectionManager
    Spec --> SpectatorRooms
    Spec --> ConnectionManager
    All --> ConnectionManager
```

## Message Types & Routing

```mermaid
graph LR
    subgraph ClientMessages["Client → Server Messages"]
        GM["game:move<br/>{from, to, promotion?}"]
        GJ["game:join<br/>{gameId}"]
        GR["game:resign<br/>{gameId}"]
        GD["game:offer_draw<br/>{gameId}"]
        GA["game:accept_draw<br/>{gameId}"]
        QJ["queue:join<br/>{stakeAmount, timeControl}"]
        QL["queue:leave"]
        SJ["spectate:join<br/>{gameId}"]
        CC["challenge:create<br/>{stake, timeControl, elo}"]
        CA["challenge:accept<br/>{challengeId}"]
        CF["challenge:confirm<br/>{challengeId}"]
        CS["spectator:chat_send<br/>{gameId, message}"]
        CP["spectator:prediction_create<br/>{gameId, winner, amount}"]
        PING["ping"]
    end

    subgraph Router["handler.ts<br/>(Message Router)"]
        Route["Switch on<br/>message.type"]
    end

    subgraph Handlers["Coordinators"]
        GameCoord["GameCoordinator"]
        ChallengeCoord["ChallengeCoordinator"]
    end

    ClientMessages --> Route
    Route -->|"game:*"| GameCoord
    Route -->|"queue:*"| GameCoord
    Route -->|"spectate:*"| GameCoord
    Route -->|"spectator:*"| GameCoord
    Route -->|"challenge:*"| ChallengeCoord
```

## Server → Client Messages

```mermaid
graph LR
    subgraph ServerMessages["Server → Client Messages"]
        MM["game:move_made<br/>{move, fen, pgn, times}"]
        GS["game:started<br/>{game, whitePlayer, blackPlayer}"]
        GE["game:ended<br/>{result, winner, eloChanges}"]
        CT["clock:tick<br/>{whiteTime, blackTime}"]
        DO["game:draw_offered<br/>{offeredBy}"]
        DA["game:draw_accepted"]
        QM["queue:matched<br/>{game, opponent}"]
        CU["challenge:updated<br/>{challenges[]}"]
        SC["spectator:chat_message<br/>{user, message}"]
        SP["spectator:prediction_matched"]
        PONG["pong"]
    end

    subgraph Stores["Frontend Zustand Stores"]
        GameStore["gameStore<br/>(moves, fen, clocks)"]
        SpectatorStore["spectatorStore<br/>(watching state)"]
        ChallengeStore["challengeStore<br/>(marketplace)"]
        ChatStore["spectatorChatStore<br/>(messages)"]
    end

    MM --> GameStore
    GS --> GameStore
    GE --> GameStore
    CT --> GameStore
    DO --> GameStore
    QM --> GameStore
    CU --> ChallengeStore
    SC --> ChatStore
    SP --> SpectatorStore
```

## Reconnection Strategy

```mermaid
stateDiagram-v2
    [*] --> Connected: Initial connect

    Connected --> Disconnected: Connection lost
    Connected --> Connected: ping/pong (30s)

    Disconnected --> Reconnecting: Immediate retry

    Reconnecting --> Connected: Success
    Reconnecting --> Backoff: Failed

    Backoff --> Reconnecting: Wait (exponential)

    note right of Backoff
        1s → 2s → 4s → 8s → 16s → 30s (max)
    end note

    note right of Connected
        On reconnect: re-join active game room
        Server replays current game state
    end note
```
