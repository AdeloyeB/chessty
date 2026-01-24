# Infrastructure & Deployment Architecture

Monorepo structure, Docker setup, and build pipeline.

## Monorepo Structure

```mermaid
graph TD
    subgraph Root["Root (Turborepo + pnpm workspaces)"]
        Turbo["turbo.json<br/>(task orchestration)"]
        PNPM["pnpm-workspace.yaml<br/>(workspace definitions)"]
        Docker["Dockerfile + docker-compose.yml"]
    end

    subgraph Apps["apps/ (Deployable Applications)"]
        Server["apps/server/<br/>━━━━━━━━━━━━━<br/>Bun.js HTTP + WebSocket<br/>Port 3001<br/>━━━━━━━━━━━━━<br/>drizzle/ events/ websocket/<br/>services/ routes/ redis/"]

        Web["apps/web/<br/>━━━━━━━━━━━━━<br/>Next.js 16 (React)<br/>Port 3000<br/>━━━━━━━━━━━━━<br/>components/ hooks/<br/>store/ config/"]

        Desktop["apps/desktop/<br/>━━━━━━━━━━━━━<br/>Electron wrapper<br/>━━━━━━━━━━━━━<br/>Loads localhost:3000<br/>Deep links, secure storage"]
    end

    subgraph Packages["packages/ (Shared Libraries)"]
        Engine["packages/chess-engine/<br/>━━━━━━━━━━━━━<br/>Pure TypeScript chess rules<br/>Zero external deps<br/>━━━━━━━━━━━━━<br/>ChessEngine class"]

        Shared["packages/shared/<br/>━━━━━━━━━━━━━<br/>Types, constants, utils<br/>Zod schemas<br/>━━━━━━━━━━━━━<br/>WSMessage types, ranks,<br/>achievements, time controls"]
    end

    Root --> Apps
    Root --> Packages

    Server -->|"imports"| Engine
    Server -->|"imports"| Shared
    Web -->|"imports"| Shared
    Web -->|"imports"| Engine
    Desktop -->|"loads"| Web

    style Engine fill:#1a2a1a,stroke:#4ecdc4
    style Shared fill:#1a2a1a,stroke:#4ecdc4
```

## Docker Architecture

```mermaid
graph TD
    subgraph DockerCompose["docker-compose.yml"]
        subgraph ServerContainer["server (container)"]
            BunRuntime["oven/bun:1-alpine<br/>(~50MB base)"]
            AppCode["apps/server/src/<br/>(mounted volume for dev)"]
            Port["Exposed: 3001"]
        end

        subgraph FutureContainers["Future Services (commented out)"]
            RedisContainer["redis:7-alpine<br/>Port: 6379"]
            WebContainer["apps/web<br/>Port: 3000"]
        end
    end

    subgraph Dockerfile["Dockerfile (Multi-layer Build)"]
        Layer1["Layer 1: Base Image<br/>FROM oven/bun:1-alpine"]
        Layer2["Layer 2: Dependencies<br/>COPY package.json, pnpm-lock<br/>RUN bun install"]
        Layer3["Layer 3: Source Code<br/>COPY apps/ packages/"]
        Layer4["Layer 4: Entrypoint<br/>CMD bun run apps/server/src/index.ts"]

        Layer1 --> Layer2
        Layer2 --> Layer3
        Layer3 --> Layer4
    end

    subgraph Network["Docker Network"]
        ServerContainer -->|"future"| RedisContainer
        ServerContainer -->|"connects to"| NeonCloud["Neon PostgreSQL<br/>(external cloud)"]
    end

    subgraph Volumes["Development Volumes"]
        V1["./apps/server/src → /app/apps/server/src<br/>(hot reload)"]
        V2["./packages → /app/packages<br/>(shared code)"]
    end

    Volumes --> ServerContainer
```

## Build Pipeline (Turbo)

```mermaid
graph LR
    subgraph TurboPipeline["turbo run build"]
        direction LR
        B1["packages/chess-engine<br/>tsc → dist/"]
        B2["packages/shared<br/>tsc → dist/"]
        B3["apps/server<br/>tsc (type check)"]
        B4["apps/web<br/>next build"]
        B5["apps/desktop<br/>electron-builder"]
    end

    B1 --> B3
    B2 --> B3
    B1 --> B4
    B2 --> B4
    B4 --> B5

    subgraph Deps["Dependency Graph"]
        direction TB
        D1["chess-engine<br/>(zero deps)"]
        D2["shared<br/>(depends on chess-engine)"]
        D3["server<br/>(depends on both)"]
        D4["web<br/>(depends on both)"]
        D5["desktop<br/>(depends on web)"]

        D1 --> D2
        D1 --> D3
        D1 --> D4
        D2 --> D3
        D2 --> D4
        D4 --> D5
    end
```

## Server Network Architecture

```mermaid
graph TD
    subgraph Clients["Client Connections"]
        Browser["Browser<br/>(HTTPS + WSS)"]
        ElectronApp["Electron App<br/>(localhost)"]
    end

    subgraph BunServer["Bun.serve() — Port 3001"]
        HTTPHandler["HTTP Handler<br/>(REST API)"]
        WSHandler["WebSocket Handler<br/>(Persistent connections)"]
        CORS["CORS Middleware<br/>(origin validation)"]
        RateLimit["Rate Limiter<br/>(token bucket per IP)"]
        BotDetect["Bot Detection<br/>(User-Agent filtering)"]
    end

    subgraph Security["Security Layer"]
        JWT["JWT Auth<br/>(HS256, 7-day expiry)"]
        Argon["Password Hashing<br/>(Argon2id)"]
        Lockout["Account Lockout<br/>(5 failed attempts)"]
        PathGuard["Path Traversal<br/>Protection"]
    end

    subgraph External["External Services"]
        NeonDB["Neon PostgreSQL<br/>(us-east-1)"]
        Polygon["Polygon RPC<br/>(blockchain)"]
    end

    Browser --> CORS
    ElectronApp --> CORS
    CORS --> RateLimit
    RateLimit --> BotDetect
    BotDetect --> HTTPHandler
    BotDetect --> WSHandler

    HTTPHandler --> Security
    WSHandler --> Security
    Security --> NeonDB
    Browser --> Polygon
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant Client as Browser
    participant API as REST API
    participant Auth as auth.ts
    participant DB as Neon PostgreSQL
    participant Session as sessions table

    Note over Client,Session: Registration

    Client->>API: POST /api/auth/register {email, username, password}
    API->>Auth: register(email, username, password)
    Auth->>Auth: hashPassword(password) [Argon2id]
    Auth->>DB: INSERT INTO users
    Auth->>Session: INSERT INTO sessions {userId, tokenHash, ip, ua}
    Auth->>Auth: sign JWT {userId, sessionId}
    Auth-->>Client: {token, user}

    Note over Client,Session: Login

    Client->>API: POST /api/auth/login {email, password}
    API->>Auth: login(email, password)
    Auth->>Auth: Check lockout (5 attempts max)
    Auth->>DB: SELECT user WHERE email
    Auth->>Auth: verifyPassword(password, hash)

    alt Password correct
        Auth->>Session: INSERT INTO sessions
        Auth->>Auth: sign JWT
        Auth-->>Client: {token, user}
    else Wrong password
        Auth->>Auth: Increment failed attempts
        Auth-->>Client: 401 Unauthorized
    end

    Note over Client,Session: WebSocket Auth

    Client->>API: WebSocket upgrade (JWT in query param)
    API->>Auth: verifyToken(jwt)
    Auth->>Auth: Verify signature + expiry
    Auth->>Session: Check session is_valid
    Auth-->>API: {userId, sessionId}
    API-->>Client: WebSocket connected ✓
```
