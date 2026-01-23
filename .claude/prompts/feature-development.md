# Feature Development Prompts

Copy and paste these prompts to continue building out the chess platform.

---

## 1. Matchmaking & Queue System

```
Build out the matchmaking queue system:

1. Server-side queue manager with ELO-based matching
2. Time control selection (bullet, blitz, rapid)
3. Stake amount brackets
4. Queue status UI with cancel option
5. Match found animation/notification

Focus on fair matching within ±200 ELO range, with expanding range after 30 seconds.
```

---

## 2. Spectator Mode

```
Implement spectator mode for live games:

1. List of active games to spectate
2. Real-time board sync via WebSocket
3. Spectator chat with message rate limiting
4. Live betting/predictions on game outcome
5. Spectator count display

Consider: delay for anti-cheating, chat moderation, bet settlement on game end.
```

---

## 3. Game History & Replay

```
Build the game history and replay system:

1. Paginated game history list (no scrolling)
2. Game detail drawer with move-by-move replay
3. Move navigation (first, prev, next, last, auto-play)
4. PGN export functionality
5. Game analysis highlights (blunders, brilliant moves)

Store: FEN at each move, timestamps, clock times, result reason.
```

---

## 4. Challenge System

```
Implement direct challenge feature:

1. Create challenge with custom time control + stake
2. Challenge link sharing
3. Challenge acceptance flow with stake confirmation
4. Challenge expiration (5 minute timeout)
5. Challenge list in lobby

Consider: minimum balance check, stake escrow before game start.
```

---

## 5. Leaderboard & Rankings

```
Build the ranking and leaderboard system:

1. Global leaderboard (paginated, top 100)
2. Rank tiers with visual badges
3. Weekly/monthly rankings
4. Personal stats dashboard
5. Rank progression visualization

Track: games played, win rate, current streak, peak ELO.
```

---

## 6. Tournament Mode

```
Design and implement tournament system:

1. Tournament creation (bracket size, time control, entry fee)
2. Registration with stake collection
3. Bracket visualization
4. Auto-pairing between rounds
5. Prize pool distribution

Start simple: single elimination, 8-player brackets.
```

---

## 7. Social Features

```
Add social features:

1. Friend list with online status
2. Direct challenges to friends
3. Game invites via link
4. Basic profile pages
5. Block/report functionality

Consider: friend request flow, privacy settings.
```

---

## 8. Notifications System

```
Implement notifications:

1. In-app notification center
2. Game start notifications
3. Challenge received alerts
4. Tournament reminders
5. Browser push notifications (optional)

Types: game_start, challenge, tournament, achievement, system.
```

---

## Quick Fixes & Polish

```
Polish and bug fixes:

1. Fix WalletConnect SSR errors (dynamic import with ssr: false)
2. Add loading skeletons for async content
3. Improve error messages and toast notifications
4. Add keyboard shortcuts for game controls
5. Mobile touch improvements for chess board

Run: pnpm build && pnpm dev to test changes.
```
