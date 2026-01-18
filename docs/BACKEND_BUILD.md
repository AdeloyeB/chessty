# Backend Build Guide: Replacing Mock Data with Real APIs

**Last Updated:** 2026-01-18

---

## Overview

This guide outlines the steps to transition from mock data to a fully functional backend. The backend is already built (`apps/server`) but the frontend currently uses mock data by default.

---

## Current Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend       │────▶│   PostgreSQL    │
│   (Next.js)     │     │   (Bun + WS)    │     │   Database      │
│   Port 3000     │     │   Port 3001     │     │   Port 5432     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Mock Data     │  ◀── Currently enabled (USE_MOCK_DATA = true)
│   (In-memory)   │
└─────────────────┘
```

---

## Phase 1: Database Setup (Day 1)

### 1.1 Install PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Docker (recommended for development)
docker run -d \
  --name chess-postgres \
  -e POSTGRES_USER=chess \
  -e POSTGRES_PASSWORD=chess123 \
  -e POSTGRES_DB=chessty \
  -p 5432:5432 \
  postgres:16
```

### 1.2 Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE chessty;
CREATE USER chess WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE chessty TO chess;
\q
```

### 1.3 Configure Environment

```bash
# apps/server/.env.local
DATABASE_URL=postgresql://chess:your-secure-password@localhost:5432/chessty
JWT_SECRET=generate-a-64-character-secret-here-use-openssl-rand-base64-48
CORS_ORIGIN=http://localhost:3000
PORT=3001
```

Generate secure JWT secret:
```bash
openssl rand -base64 48
```

### 1.4 Run Migrations

```bash
# From project root
pnpm db:generate  # Generate migration files
pnpm db:migrate   # Apply migrations to database

# View database in browser
pnpm db:studio    # Opens Drizzle Studio
```

---

## Phase 2: Start Backend Server (Day 1)

### 2.1 Install Dependencies

```bash
cd apps/server
bun install
```

### 2.2 Start Development Server

```bash
# From project root
pnpm dev:server

# Or directly
cd apps/server && bun run dev
```

Server will be available at `http://localhost:3001`

### 2.3 Verify Server Health

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 2.4 Test Authentication

```bash
# Register a user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"TestPlayer","password":"securepassword123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"securepassword123"}'
```

---

## Phase 3: Connect Frontend to Backend (Day 2)

### 3.1 Disable Mock Data

```typescript
// apps/web/src/lib/mock/mockData.ts
export const USE_MOCK_DATA = false;  // Change from true to false
```

### 3.2 Configure API URL

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

### 3.3 Update API Hook (if needed)

The `useApi` hook at `apps/web/src/hooks/useApi.ts` already handles the toggle:

```typescript
// This already exists and will use real API when USE_MOCK_DATA = false
const response = await fetch(`${API_URL}${endpoint}`, {
  headers: {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  },
  ...options,
});
```

---

## Phase 4: Data Migration (Day 2-3)

### 4.1 Seed Initial Data

Create a seed script for development:

```typescript
// apps/server/src/scripts/seed.ts
import { db } from '../drizzle';
import { users } from '../drizzle/schema';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Seeding database...');

  // Create test users
  const testUsers = [
    { username: 'GrandMaster_X', email: 'gm@test.com', elo: 2450 },
    { username: 'KnightRider99', email: 'knight@test.com', elo: 2280 },
    { username: 'QueenGambit', email: 'queen@test.com', elo: 2190 },
    // ... more users
  ];

  for (const u of testUsers) {
    await db.insert(users).values({
      id: nanoid(),
      email: u.email,
      username: u.username,
      passwordHash: await bcrypt.hash('testpassword123', 12),
      eloRating: u.elo,
      peakEloRating: u.elo + 50,
      balance: '1000.00',
    }).onConflictDoNothing();
  }

  console.log('Seeding complete!');
}

seed().catch(console.error);
```

Run seed:
```bash
cd apps/server && bun run src/scripts/seed.ts
```

### 4.2 Mock Data Location Reference

| Mock Data | Current Location | Backend Endpoint |
|-----------|-----------------|------------------|
| User Profile | `mockData.ts:MOCK_PLAYERS` | `GET /api/profile` |
| Leaderboard | `mockData.ts:generateMockEloLeaderboard()` | `GET /api/leaderboard/elo` |
| Active Games | `mockData.ts:generateMockActiveGames()` | `GET /api/games/active` |
| Game History | `HistoryPage.tsx` (useHistoryData hook) | `GET /api/games/history` |
| Transactions | `mockData.ts` | `GET /api/wallet/transactions` |
| Achievements | `ProfilePage.tsx:MOCK_PROFILE` | `GET /api/profile/achievements` |
| Challenges | `mockData.ts:generateMockChallenges()` | WebSocket: `challenge:list` |
| Chat Messages | `mockData.ts:generateMockChatMessages()` | WebSocket: `spectator:chat` |

---

## Phase 5: WebSocket Integration (Day 3-4)

### 5.1 WebSocket Connection

The WebSocket hook at `apps/web/src/hooks/useWebSocket.ts` handles:
- Authentication via token in query string
- Auto-reconnection
- Message type routing

### 5.2 Key WebSocket Messages

```typescript
// Matchmaking
{ type: 'queue:join', payload: { stakeAmount, timeControl, minElo, maxElo } }
{ type: 'queue:leave' }
{ type: 'match:found', payload: { gameId, opponent, color } }

// Game
{ type: 'game:join', payload: { gameId } }
{ type: 'game:move', payload: { gameId, from, to, promotion? } }
{ type: 'game:resign', payload: { gameId } }
{ type: 'game:offer_draw', payload: { gameId } }

// Spectating
{ type: 'spectator:join', payload: { gameId } }
{ type: 'spectator:chat:send', payload: { gameId, message } }
{ type: 'spectator:prediction:create', payload: { gameId, predictedWinnerId, amount } }
```

### 5.3 Test WebSocket Connection

```javascript
// Browser console
const ws = new WebSocket('ws://localhost:3001/ws?token=YOUR_JWT_TOKEN');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'ping' }));
```

---

## Phase 6: Feature-by-Feature Migration

### 6.1 Authentication (Priority: Critical)

**Frontend Changes:**
```typescript
// apps/web/src/store/auth.ts
// Remove MOCK_USER constant
// Update login/register to call real API

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    set({ user: data.user, token: data.token, isLoading: false });
    localStorage.setItem('token', data.token);
  },
  // ...
}));
```

### 6.2 Game History

**Current Hook:** `apps/web/src/hooks/useHistoryData.ts`

Update to use real API:
```typescript
const fetchGames = async () => {
  const response = await api.get('/api/games/history/filtered', {
    params: { startDate, endDate, result, timeControl, gameMode, page, limit }
  });
  return response.data;
};
```

### 6.3 Leaderboards

**Endpoint:** `GET /api/leaderboard/elo?limit=100`

```typescript
const { data: leaderboard } = useQuery({
  queryKey: ['leaderboard', 'elo'],
  queryFn: () => api.get('/api/leaderboard/elo').then(r => r.data),
});
```

### 6.4 Wallet & Transactions

**Endpoints:**
- `GET /api/wallet/balance`
- `GET /api/wallet/transactions`

```typescript
const { data: balance } = useQuery({
  queryKey: ['wallet', 'balance'],
  queryFn: () => api.get('/api/wallet/balance').then(r => r.data.balance),
});
```

---

## Phase 7: Production Checklist

### 7.1 Environment Variables

```bash
# Production .env
DATABASE_URL=postgresql://user:pass@your-db-host:5432/chessty
JWT_SECRET=<64-char-secret>
CORS_ORIGIN=https://chessty.com
NODE_ENV=production
```

### 7.2 Database Indexes (Already in schema)

Verify these indexes exist for query performance:
```sql
CREATE INDEX idx_games_white_player ON games(white_player_id);
CREATE INDEX idx_games_black_player ON games(black_player_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_bets_game ON bets(game_id);
```

### 7.3 Connection Pooling

For production, use connection pooling:
```typescript
// apps/server/src/drizzle/index.ts
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 20,  // Max connections in pool
  idle_timeout: 20,
  connect_timeout: 10,
});
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check if PostgreSQL is running
pg_isready -h localhost -p 5432
```

### CORS Issues

Ensure backend CORS is configured:
```typescript
// apps/server/src/index.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

### WebSocket Connection Refused

1. Check server is running on correct port
2. Verify token is valid
3. Check firewall/proxy settings

---

## Timeline Summary

| Day | Task | Duration |
|-----|------|----------|
| 1 | Database setup + migrations | 2-3 hours |
| 1 | Start backend, verify health | 1 hour |
| 2 | Disable mock data, connect frontend | 2 hours |
| 2 | Seed development data | 1 hour |
| 3 | Auth flow integration | 3 hours |
| 3 | WebSocket connection testing | 2 hours |
| 4 | Feature migration (games, history) | 4 hours |
| 5 | Feature migration (betting, wallet) | 4 hours |
| 5 | End-to-end testing | 2 hours |

**Total: ~5 days for full integration**
