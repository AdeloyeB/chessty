# Mock Data Locations

This document tracks all mock/placeholder data used in the codebase. These should be replaced with real API calls before production.

---

## Dashboard

### `apps/web/src/components/dashboard/HomeDashboard.tsx`

| Constant | Line | Description |
|----------|------|-------------|
| `RANDOM_PLAYERS` | ~27 | Array of mock player stats for "Top Players" section |
| `LIVE_MATCHES` | ~36 | Array of mock live match data for "Live Matches" section |
| `MOCK_PROFILE_DATA` | ~42 | Mock profile data for unified player profile card |

**Data Structure:**
```typescript
// RANDOM_PLAYERS
const RANDOM_PLAYERS = [
  { username: 'GrandMaster_X', elo: 2450, wins: 342, winRate: 78 },
  ...
];

// LIVE_MATCHES
const LIVE_MATCHES = [
  { white: 'GrandMaster_X', black: 'QueenGambit', pool: 500, viewers: 124 },
  ...
];

// MOCK_PROFILE_DATA
const MOCK_PROFILE_DATA = {
  currentStreak: 4,
  longestStreak: 12,
  unlockedAchievements: 20,
  totalAchievements: 27,
  recentAchievements: [{ id: 'wins_100' }, ...],
};
```

**Replace with:** WebSocket subscription for live player count and active games.

---

## Profile

### `apps/web/src/components/profile/ProfilePage.tsx`

| Constant | Line | Description |
|----------|------|-------------|
| `MOCK_PROFILE` | ~20 | Complete user profile with stats, achievements, and metadata |

**Data Structure:**
```typescript
// MOCK_PROFILE
const MOCK_PROFILE = {
  user: {
    id, username, eloRating, peakEloRating,
    gamesPlayed, gamesWon, gamesLost, gamesDraw,
    totalWagered, totalWon, createdAt
  },
  profile: {
    isPublic, currentStreak, longestStreak,
    totalCheckmates, quickestWin, biggestStakeWin
  },
  achievements: [{ id, unlocked, unlockedAt, progress }, ...]
};
```

**Replace with:**
- `GET /api/profile` for user profile data
- `GET /api/profile/achievements` for achievement progress

---

## API Endpoints Needed

To replace all mock data, implement these endpoints:

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/profile` | GET | Full user profile with stats |
| `/api/profile/achievements` | GET | Achievement progress array |
| `/api/games/live` | GET/WS | List of active games |
| `/api/users/online` | GET/WS | Online player count/list |

---

## How to Find Mock Data

Search for mock data patterns:
```bash
# Find MOCK_ constants
grep -rn "MOCK_" apps/web/src/

# Find placeholder comments
grep -rn "mock" apps/web/src/ --include="*.tsx"

# Find TODO comments about data
grep -rn "TODO.*data\|TODO.*API" apps/
```

---

## Migration Checklist

- [ ] Dashboard: Replace RANDOM_PLAYERS with API/WebSocket player stats
- [ ] Dashboard: Replace LIVE_MATCHES with WebSocket game feed
- [ ] Dashboard: Replace MOCK_PROFILE_DATA with user profile data
- [ ] ProfilePage: Connect to /api/profile endpoint
- [ ] ProfilePage: Connect to /api/profile/achievements endpoint
- [ ] Run database migrations for user_profiles and user_achievements tables
