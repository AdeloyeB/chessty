# Feature Implementation Plan: Openings Tab

This document contains the comprehensive architecture and implementation plan for adding an Openings analysis tab to the History page.

---

## Overview

Add a 4th "openings" tab to the History page that analyzes and displays chess opening statistics based on games played.

**Database**: This project uses **Neon PostgreSQL** database. Database implementation for opening persistence will be included alongside the frontend work.

---

## Architecture Decision

**Approach**: Build a client-side opening analytics module that processes games on-demand, using existing infrastructure, with optional backend persistence via Neon.

### Why This Approach
1. **No immediate API changes needed** - all data already available via `useHistoryData`
2. **Reuses patterns** - tabs, filters, pagination, card layouts all established
3. **Progressive enhancement** - works immediately with existing mock data
4. **Lightweight** - pure computation, no complex queries
5. **Database ready** - Easy to add Neon persistence for caching opening stats

### Component Hierarchy
```
OpeningsTab (container)
├── OpeningsFilters (sorting + result filter)
├── OpeningsList (paginated list)
│   └── OpeningCard (individual opening stats)
└── OpeningDetailDrawer (modal with games list)
    ├── OpeningDetailHeader (name, stats summary)
    ├── OpeningGamesTable (games using this opening)
    └── OpeningTrends (performance over time - future)
```

---

## Key Features

### 1. Opening Statistics
- List of openings the user has played
- Games played count
- Win/Loss/Draw breakdown
- Win rate percentage
- Visual indicator (win rate bar/gauge)

### 2. Sorting/Filtering
- Sort by: Most Played | Best Win Rate | Most Recent
- Filter by result: All | Wins | Losses | Draws

### 3. Opening Details
- Click an opening to see:
  - List of games where this opening was played
  - Common continuations/variations
  - Performance trends over time

### 4. Data Integration
- Use existing `useHistoryData` hook which provides games
- Process games through `openingDetector.detectOpening(moves)`
- Group and aggregate by opening name
- Calculate statistics
- **Optional**: Cache aggregated stats in Neon for performance

---

## Component Design

### File Structure

#### New Files to Create

1. **`apps/web/src/lib/history/openingAnalyzer.ts`** - Data processing logic
   - Purpose: Process games into opening statistics
   - Core function: `analyzeOpenings(games: HistoryGame[]): OpeningStats[]`

2. **`apps/web/src/hooks/useOpeningsData.ts`** - State management hook
   - Purpose: Custom hook for openings tab state management
   - Manages sorting, filtering, selection state

3. **`apps/web/src/components/history/openings/OpeningsTab.tsx`** - Main tab container
   - Purpose: Layout container with conditional rendering
   - Handles loading/empty/data states

4. **`apps/web/src/components/history/openings/OpeningsFilters.tsx`** - Filter controls
   - Purpose: Sort and filter controls
   - Pattern: Follow `HistoryFilters.tsx` structure

5. **`apps/web/src/components/history/openings/OpeningCard.tsx`** - Opening card component
   - Purpose: Display individual opening statistics
   - Shows name, ECO code, win rate bar, W/L/D stats

6. **`apps/web/src/components/history/openings/OpeningDetailDrawer.tsx`** - Detail modal
   - Purpose: Modal showing games for selected opening
   - Pattern: Follow `GameDetailDrawer.tsx` structure

7. **`apps/web/src/components/history/openings/OpeningDetailHeader.tsx`** - Detail header
   - Purpose: Header section in detail drawer with stat cards

#### Files to Modify

1. **`apps/web/src/components/history/HistoryPage.tsx`**
   - Add `'openings'` to Tab type union
   - Add new TabButton after financial tab
   - Add tab content section for openings
   - Import `OpeningsTab` component

---

## Data Structures

### OpeningStats Interface
```typescript
interface OpeningStats {
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  games: HistoryGame[];
  lastPlayed: Date;
  ecoCode: string | null;
}
```

### Hook Interface
```typescript
interface UseOpeningsDataReturn {
  openings: OpeningStats[];
  sortBy: OpeningSortOption;
  setSortBy: (sort: OpeningSortOption) => void;
  resultFilter: 'all' | 'win' | 'loss' | 'draw';
  setResultFilter: (filter: 'all' | 'win' | 'loss' | 'draw') => void;
  selectedOpening: OpeningStats | null;
  selectOpening: (opening: OpeningStats | null) => void;
  isLoading: boolean;
}

type OpeningSortOption = 'most-played' | 'best-winrate' | 'most-recent';
```

---

## Data Flow

```
User opens History page
    ↓
useHistoryData hook loads games (with opening field populated)
    ↓
User clicks "openings" tab
    ↓
OpeningsTab renders → useOpeningsData hook executes
    ↓
useOpeningsData extracts games → analyzeOpenings() processes
    ↓
Returns OpeningStats[] array (grouped + calculated)
    ↓
PaginatedList renders OpeningCard for each opening
    ↓
User clicks OpeningCard → selectOpening(stats) called
    ↓
OpeningDetailDrawer opens with selectedOpening.games
    ↓
GamesTable (reused) shows games filtered to this opening
```

---

## Key Algorithm: Opening Analysis

```typescript
function analyzeOpenings(games: HistoryGame[]): OpeningStats[] {
  const grouped = new Map<string, HistoryGame[]>();

  // Group by opening name
  games.forEach(game => {
    const opening = game.opening || 'Unknown Opening';
    if (!grouped.has(opening)) {
      grouped.set(opening, []);
    }
    grouped.get(opening)!.push(game);
  });

  // Calculate stats for each opening
  return Array.from(grouped.entries()).map(([name, games]) => {
    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss').length;
    const draws = games.filter(g => g.result === 'draw').length;

    return {
      name,
      gamesPlayed: games.length,
      wins,
      losses,
      draws,
      winRate: games.length > 0 ? (wins / games.length) * 100 : 0,
      games,
      lastPlayed: new Date(Math.max(...games.map(g => new Date(g.endedAt).getTime()))),
      ecoCode: getOpeningECO(name),
    };
  });
}
```

---

## UI Patterns

### OpeningCard Layout
```
┌─────────────────────────────────────┐
│ italian game                   C50  │ ← Name + ECO code
│ ━━━━━━━━━━━━░░░░░░░  75%           │ ← Win rate bar
│ 12 games  •  9W-2L-1D               │ ← Stats row
│ last: 2 days ago                    │ ← Last played
└─────────────────────────────────────┘
```

### Win Rate Visual Indicator
```typescript
// Color bar gradient based on win rate
const getWinRateColor = (rate: number) => {
  if (rate >= 60) return 'bg-green-400';
  if (rate >= 50) return 'bg-green-400/50';
  if (rate >= 40) return 'bg-white/30';
  if (rate >= 30) return 'bg-red-400/50';
  return 'bg-red-400';
};
```

---

## Build Sequence

### Phase 1: Core Logic (30 min)
- Create `openingAnalyzer.ts` with `analyzeOpenings()` function
- Write unit tests for grouping and stat calculations
- Create `useOpeningsData.ts` hook
- Test hook with mock data from `useHistoryData`

### Phase 2: Basic UI (45 min)
- Create `OpeningCard.tsx` with layout and styling
- Create `OpeningsFilters.tsx` with sort/filter controls
- Create `OpeningsTab.tsx` container with PaginatedList
- Add tab to `HistoryPage.tsx` (modify existing file)
- Test basic rendering with mock data

### Phase 3: Detail View (30 min)
- Create `OpeningDetailHeader.tsx` with stat cards
- Create `OpeningDetailDrawer.tsx` with drawer layout
- Wire up click handler from OpeningCard
- Reuse GamesTable for games list
- Test drawer open/close flow

### Phase 4: Polish (15 min)
- Add loading skeletons
- Add empty state UI
- Test all filters and sorting options
- Verify pagination works correctly
- Final styling pass

### Phase 5: Database Integration (Optional - to be implemented by developer)
- Design Neon schema for opening statistics caching
- Add API endpoints for opening stats
- Implement background job to update opening aggregates
- Add cache invalidation on new games

---

## Performance Considerations

- **Memoization**: `useMemo` on `analyzeOpenings()` - only recalculates when games array changes
- **Lazy loading**: Opening analysis only runs when tab is active
- **Client-side**: No API calls initially, instant filtering/sorting
- **Targets**:
  - Initial render: < 100ms for 100 games
  - Filter change: < 50ms
  - Sort change: < 50ms
  - Pagination: < 10ms

---

## Error Handling

- **Null openings**: Games with `opening: null` grouped under "Unknown Opening"
- **Zero games**: Show empty state with message "Play some games to see opening statistics"
- **Invalid data**: Defensive checks in analyzer (handle missing fields gracefully)

---

## Database Considerations (Neon PostgreSQL)

### Current Schema
The `games` table already has an `opening` field that stores the detected opening name for each game.

### Future Optimization (Optional)
For better performance with large datasets, consider adding a materialized view or separate table:

```sql
-- Optional: Opening statistics cache table
CREATE TABLE opening_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  opening_name TEXT NOT NULL,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  last_played TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, opening_name)
);

CREATE INDEX idx_opening_stats_user ON opening_stats(user_id);
CREATE INDEX idx_opening_stats_win_rate ON opening_stats(user_id, win_rate DESC);
CREATE INDEX idx_opening_stats_games_played ON opening_stats(user_id, games_played DESC);
```

This table would be updated via:
- Background job (nightly aggregation)
- Real-time trigger on game completion
- On-demand calculation with caching

**Note**: This optimization is not required for v1 - client-side processing works well for typical user game counts (< 1000 games).

---

## Testing Strategy

1. **Unit Tests**: Test `openingAnalyzer.ts` functions (grouping, calculations)
2. **Integration Tests**: Test full flow with mock games data
3. **Edge Cases**: Empty arrays, single game, all same opening, all different openings
4. **Performance Tests**: Verify targets met with 100+ game dataset

---

## Future Enhancements (Out of Scope)

- Performance trends over time (line chart)
- Common continuations/variations analysis
- Compare openings side-by-side
- Opening recommendations based on win rate
- Export openings data to CSV
- Opening book integration (show theory lines)
- Position frequency heatmaps

---

## Implementation Timeline

**Total Time**: ~2 hours (frontend only)

- Phase 1 (Core Logic): 30 minutes
- Phase 2 (Basic UI): 45 minutes
- Phase 3 (Detail View): 30 minutes
- Phase 4 (Polish): 15 minutes

**Database Integration**: Additional time (to be scoped separately)

---

## Success Criteria

- ✅ Tab appears in History page navigation
- ✅ Opening statistics display correctly with W/L/D breakdown
- ✅ Win rate bar shows accurate visual representation
- ✅ Sorting by most played/best win rate/most recent works
- ✅ Clicking opening shows detail drawer with games list
- ✅ Empty state shows when no games played
- ✅ Performance targets met (< 100ms initial render for 100 games)
- ✅ Responsive on mobile devices
- ✅ Follows existing design system patterns

---

## Notes

This feature is designed to:
1. Follow existing codebase patterns and conventions (tabs, filters, pagination)
2. Work immediately with existing data (games already have `opening` field)
3. Require zero API changes for v1 (pure client-side processing)
4. Be production-ready with proper error handling and testing
5. Support future Neon database optimization without refactoring
6. Leave room for enhancements (trends, theory, recommendations)

**Agent ID for resuming work**: a1d479e

---

## Neon Database Integration Notes

When ready to add database-backed opening statistics:

1. **Use Neon MCP tools** already available in the codebase
2. **Schema migration** can be created with `prepare_database_migration` tool
3. **Queries** can use existing Drizzle ORM patterns
4. **Caching strategy**: Write-through cache (update stats on game end)
5. **Fallback**: Client-side calculation remains for when cache misses

The frontend is designed to work independently of database caching, making this a true progressive enhancement.
