# Mock Data Locations

This document tracks all mock/placeholder data used in the codebase. These should be replaced with real API calls before production.

---

## Dashboard

### `apps/web/src/components/dashboard/HomeDashboard.tsx`

| Constant | Line | Description | Status |
|----------|------|-------------|--------|
| `dailyChallenge` | ~108 | Hardcoded daily challenge data | Pending API |
| `profileStats` | ~132 | Placeholder profile stats (streak, achievements) | Pending API |

**Data Structure:**
```typescript
// dailyChallenge - static placeholder until daily challenge system exists
const [dailyChallenge] = useState({
  description: 'win 3 games today',
  progress: 1,
  total: 3,
});

// profileStats - placeholder until user_profiles API is connected
const profileStats = useMemo(() => ({
  currentStreak: 0,       // TODO: Add to user profile API
  unlockedAchievements: 0, // TODO: Add achievements API
  recentAchievements: [],
}), []);
```

**Already migrated to API:**
- Top players leaderboard (`getEloLeaderboard`)
- Live matches (`getActiveGames`)

**Replace with:**
- `GET /api/daily-challenge` for daily challenge data
- `GET /api/profile/stats` for streak and achievement counts

---

### `apps/web/src/lib/mock/mockData.ts`

Global mock data control flag:

```typescript
export const USE_MOCK_DATA = false; // Currently disabled
```

When `true`, components can use mock data fallbacks. Currently set to `false` since most data comes from real API.

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

To replace all remaining mock data, implement these endpoints:

| Endpoint | Method | Returns | Status |
|----------|--------|---------|--------|
| `/api/leaderboard/elo` | GET | Top players by ELO | Done |
| `/api/games/active` | GET | Active games list | Done |
| `/api/profile` | GET | Full user profile with stats | Pending |
| `/api/profile/achievements` | GET | Achievement progress array | Pending |
| `/api/daily-challenge` | GET | Daily challenge data | Pending |

---

## How to Find Mock Data

Search for mock data patterns:
```bash
# Find MOCK_ constants
grep -rn "MOCK_" apps/web/src/

# Find mock data comment blocks
grep -rn "MOCK DATA" apps/web/src/ --include="*.tsx"

# Find TODO comments about data
grep -rn "TODO.*data\|TODO.*API" apps/
```

---

## Migration Checklist

- [x] Dashboard: Replace RANDOM_PLAYERS with `getEloLeaderboard` API
- [x] Dashboard: Replace LIVE_MATCHES with `getActiveGames` API
- [x] Dashboard: Remove MOCK_PROFILE_DATA (partially migrated to profileStats placeholder)
- [ ] Dashboard: Replace dailyChallenge with daily challenge API
- [ ] Dashboard: Replace profileStats with user profile API
- [ ] ProfilePage: Connect to /api/profile endpoint
- [ ] ProfilePage: Connect to /api/profile/achievements endpoint
