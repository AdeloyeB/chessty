# Chess Game - Development Guidelines

## UI/UX Principles

### No Scrolling Lists
Avoid requiring users to scroll through lists of items. Use pagination with arrow navigation instead.

**Bad:**
```tsx
// Long scrolling list
<div className="space-y-2">
  {items.map((item) => <ItemCard key={item.id} item={item} />)}
</div>
```

**Good:**
```tsx
// Paginated with arrows
import { PaginatedList, PaginatedGrid } from '@/components/ui/PaginatedGrid';

<PaginatedList
  items={items}
  itemsPerPage={10}
  renderItem={(item) => <ItemCard key={item.id} item={item} />}
/>
```

### When to Use Each Component

| Component | Use Case | Items per Page |
|-----------|----------|----------------|
| `PaginatedGrid` | Cards, achievements, visual items | 6 (3 columns) |
| `PaginatedList` | Vertical lists, leaderboards, transactions | 10 |

### Exceptions (Scrolling Allowed)
- **In-depth data views**: Game statistics, financial data, match history (dedicated pages)
- **Game boards**: Chess board and move history during active games
- **Chat/messages**: Real-time communication

---

## Full-Screen IDE Layout

For immersive experiences (practice mode, game boards), use an IDE/trading-terminal style layout:

```
┌─────────────────────────────────────────────────────────┐
│ NAV BAR (64px)                                          │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│   SIDEBAR    │              MAIN AREA                   │
│   (256px)    │         (chess board, etc.)              │
│              │                                          │
│  - Stats     │                                          │
│  - History   │                                          │
│  - Actions   │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│ STATUS BAR (32px) - session id, time, scores, FEN       │
└─────────────────────────────────────────────────────────┘
```

**Parent container (in Dashboard):**
```tsx
{activeTab === 'practice' ? (
  <main className="h-[calc(100vh-64px)]">
    <LocalGame />
  </main>
) : (
  <main className="container mx-auto px-6 py-8">
    {/* other tabs */}
  </main>
)}
```

**IDE component structure:**
```tsx
<div className="h-full bg-pure-black flex flex-col overflow-hidden">
  {/* Main Content */}
  <div className="flex-1 flex min-h-0">
    {/* Sidebar */}
    <div className="w-64 border-r border-mid/30 flex flex-col bg-off-black">
      {/* Header, Stats, Actions */}
    </div>

    {/* Main Area */}
    <div className="flex-1 flex flex-col min-h-0 bg-pure-black">
      {/* Top bar */}
      <div className="p-3 border-b border-mid/30">...</div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        {/* Responsive square content */}
        <div className="aspect-square max-h-full max-w-full" style={{ height: 'min(100%, calc(100vw - 320px))' }}>
          {/* Chess board, etc. */}
        </div>
      </div>
      {/* Bottom bar */}
      <div className="p-3 border-t border-mid/30">...</div>
    </div>
  </div>

  {/* Status Bar */}
  <div className="h-8 border-t border-mid/30 bg-off-black flex items-center px-3">
    {/* Session info, stats */}
  </div>
</div>
```

---

## CSS Conventions

### Color System
```
pure-black: #000000    - Backgrounds, deepest layer
off-black: #0a0a0a     - Cards, elevated surfaces
mid: #666666           - Borders, muted elements
mid-light: #888888     - Secondary text, labels
light: #cccccc         - Tertiary text
pure-white: #ffffff    - Primary text, accents
```

### Component Patterns

**Card Container:**
```tsx
<div className="bg-off-black border border-mid/30">
  {/* Header */}
  <div className="p-4 border-b border-mid/30">
    <p className="text-xs font-mono text-mid-light">section_label</p>
  </div>
  {/* Content */}
  <div className="p-6">
    {/* ... */}
  </div>
</div>
```

**Button States:**
```tsx
// Selected
className="bg-pure-white text-pure-black border-pure-white"

// Unselected
className="bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white"

// Disabled
className="border-mid/20 text-mid/40 cursor-not-allowed"
```

**Data Cards:**
```tsx
<div className="p-3 bg-pure-black border border-mid/30 text-center">
  <p className="text-lg font-mono text-pure-white">{value}</p>
  <p className="text-xs font-mono text-mid-light">{label}</p>
</div>
```

---

## Reusable Components

### PaginatedGrid
For grid layouts with pagination.

```tsx
import { PaginatedGrid } from '@/components/ui/PaginatedGrid';

<PaginatedGrid
  items={achievements}
  itemsPerPage={6}
  renderItem={(achievement) => <AchievementCard achievement={achievement} />}
  columns={3}           // 1 | 2 | 3 | 4
  emptyMessage="No items"
  showCount             // Shows "X items" above grid
  countLabel="achievements"
/>
```

### PaginatedList
For vertical lists with pagination.

```tsx
import { PaginatedList } from '@/components/ui/PaginatedGrid';

<PaginatedList
  items={leaderboardEntries}
  itemsPerPage={10}
  renderItem={(entry, index) => <LeaderboardRow entry={entry} rank={index + 1} />}
  emptyMessage="No data available"
  gap="sm"              // "sm" | "md"
/>
```

---

## File Organization

```
apps/web/src/components/
├── ui/                 # Reusable primitives
│   └── PaginatedGrid.tsx
├── profile/            # Profile-related components
├── dashboard/          # Dashboard components
├── chess/              # Game board, moves
├── wallet/             # Balance, transactions
└── marketplace/        # Challenges, matchmaking
```

---

## Mock Data

All mock data is documented in `MOCK_DATA.md`.

When adding mock data:
1. Use clear constant names prefixed with `MOCK_`
2. Add comment block marking the mock data section
3. Update `MOCK_DATA.md` with location and structure
4. Plan the API endpoint that will replace it

```tsx
// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const MOCK_EXAMPLE = {
  // ...
};
// ============================================================================
```
