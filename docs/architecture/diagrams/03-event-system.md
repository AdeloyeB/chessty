# Event System Architecture

How game actions trigger side effects through an event-driven pipeline.

## Event Flow Overview

```mermaid
graph TD
    subgraph Trigger["Event Source"]
        Move["GameCoordinator.handleMove()"]
        Resign["GameCoordinator.handleResign()"]
        Timeout["ClockManager timeout"]
        Challenge["ChallengeCoordinator"]
    end

    subgraph Emitter["GameEventEmitter"]
        Emit["emit(eventName, payload)"]
        Queue["Handler Queue<br/>(sorted by priority)"]
    end

    subgraph Blocking["Blocking Handlers (Sequential)"]
        P10["Priority 10<br/>persistence.ts<br/>━━━━━━━━━━━━━<br/>DB writes MUST complete<br/>before broadcast"]
        P50["Priority 50<br/>broadcast.ts<br/>━━━━━━━━━━━━━<br/>Send WS messages<br/>to players/spectators"]
    end

    subgraph NonBlocking["Non-Blocking Handlers (Concurrent, Fire-and-Forget)"]
        P100a["Priority 100<br/>achievements.ts<br/>━━━━━━━━━━━━━<br/>Check badge unlocks"]
        P100b["Priority 100<br/>odds.ts<br/>━━━━━━━━━━━━━<br/>Recalculate betting odds"]
        P100c["Priority 100<br/>predictions.ts<br/>━━━━━━━━━━━━━<br/>Settle spectator bets"]
    end

    Trigger --> Emit
    Emit --> Queue
    Queue -->|"1st"| P10
    P10 -->|"2nd (after DB confirms)"| P50
    P50 -->|"3rd (don't wait)"| NonBlocking
    P100a ~~~ P100b
    P100b ~~~ P100c
```

## Event Types & Payloads

```mermaid
graph LR
    subgraph GameEvents["Game Lifecycle Events"]
        GS["game:started<br/>━━━━━━━━━━━━━<br/>gameId, whiteId, blackId,<br/>timeControl, stake"]
        GMM["game:move_made<br/>━━━━━━━━━━━━━<br/>gameId, userId, move,<br/>fen, pgn, whiteTime,<br/>blackTime"]
        GE["game:ended<br/>━━━━━━━━━━━━━<br/>gameId, result, winnerId,<br/>eloChanges, reason"]
        GT["game:timeout<br/>━━━━━━━━━━━━━<br/>gameId, loserId, winnerId"]
    end

    subgraph DrawEvents["Draw Flow Events"]
        DO["game:draw_offered<br/>━━━━━━━━━━━━━<br/>gameId, offeredBy"]
        DA["game:draw_accepted<br/>━━━━━━━━━━━━━<br/>gameId, acceptedBy"]
        DD["game:draw_declined<br/>━━━━━━━━━━━━━<br/>gameId, declinedBy"]
    end

    subgraph PlayerEvents["Player Events"]
        PC["player:connected<br/>━━━━━━━━━━━━━<br/>userId"]
        PD["player:disconnected<br/>━━━━━━━━━━━━━<br/>userId"]
        PJ["player:joined_game<br/>━━━━━━━━━━━━━<br/>userId, gameId"]
    end

    subgraph SpectatorEvents["Spectator Events"]
        SJ["spectator:joined<br/>━━━━━━━━━━━━━<br/>userId, gameId"]
        SL["spectator:left<br/>━━━━━━━━━━━━━<br/>userId, gameId"]
    end

    subgraph ChallengeEvents["Challenge Events"]
        CCr["challenge:created<br/>━━━━━━━━━━━━━<br/>challenge object"]
        CAc["challenge:accepted<br/>━━━━━━━━━━━━━<br/>challengeId, opponentId"]
        CCo["challenge:confirmed<br/>━━━━━━━━━━━━━<br/>challengeId, gameId"]
        CCa["challenge:cancelled<br/>━━━━━━━━━━━━━<br/>challengeId, reason"]
    end

    subgraph ClockEvents["Clock Events"]
        CTi["clock:tick<br/>━━━━━━━━━━━━━<br/>gameId, whiteTime, blackTime"]
        CSt["clock:started<br/>━━━━━━━━━━━━━<br/>gameId"]
        CSo["clock:stopped<br/>━━━━━━━━━━━━━<br/>gameId"]
    end
```

## Handler Registration

```mermaid
sequenceDiagram
    participant Server as Server Startup
    participant Registry as handlers/index.ts
    participant Emitter as GameEventEmitter
    participant P as persistence.ts
    participant B as broadcast.ts
    participant A as achievements.ts
    participant O as odds.ts
    participant Pr as predictions.ts

    Server->>Registry: registerAllHandlers(emitter, broadcast)

    Registry->>Emitter: on('game:move_made', persistMove, {priority: 10, blocking: true})
    Registry->>Emitter: on('game:ended', persistEnd, {priority: 10, blocking: true})
    Registry->>Emitter: on('game:move_made', broadcastMove, {priority: 50})
    Registry->>Emitter: on('game:ended', broadcastEnd, {priority: 50})
    Registry->>Emitter: on('clock:tick', broadcastClock, {priority: 50})
    Registry->>Emitter: on('game:move_made', checkAchievements, {priority: 100, nonBlocking: true})
    Registry->>Emitter: on('game:move_made', recalcOdds, {priority: 100, nonBlocking: true})
    Registry->>Emitter: on('game:ended', settleAllBets, {priority: 100, nonBlocking: true})

    Note over Emitter: All handlers registered at startup.<br/>Events dispatched in priority order.
```

## Priority Execution Model

```mermaid
graph TD
    subgraph Execution["When emit('game:move_made') is called"]
        Start["Event emitted"] --> Sort["Sort handlers by priority"]
        Sort --> B1["Execute Priority 10<br/>(persistence.ts)<br/>━━━━━━━━━━━━━<br/>BLOCKING: awaits completion"]
        B1 -->|"✅ DB write confirmed"| B2["Execute Priority 50<br/>(broadcast.ts)<br/>━━━━━━━━━━━━━<br/>NON-BLOCKING: don't await"]
        B2 --> B3["Execute Priority 100<br/>(achievements, odds, predictions)<br/>━━━━━━━━━━━━━<br/>CONCURRENT fire-and-forget"]
        B3 --> Done["emit() resolves"]

        B1 -->|"❌ DB write fails"| Error["Error propagates<br/>Event stops<br/>No broadcast sent"]
    end

    style Error fill:#2d0000,stroke:#ff0000,color:#ff6666
```
