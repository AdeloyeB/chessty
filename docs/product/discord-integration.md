# Discord Integration Research: Chess Game

**Research Date:** 2026-01-19
**Purpose:** Evaluate Discord capabilities for playing chess moves directly from Discord

---

## Executive Summary

Discord offers **three main integration paths** for implementing chess gameplay:

| Approach | Best For | Complexity | User Experience |
|----------|----------|------------|-----------------|
| **Bot with Message Components** | Text-based play, notifications | Medium | Good - buttons/menus |
| **Embedded App (Activity)** | Full visual experience | High | Excellent - full UI |
| **Webhooks** | One-way notifications | Low | Basic - alerts only |

**Recommendation:** Start with a **Bot + Message Components** approach for MVP, with optional upgrade path to **Embedded App** for richer experience.

---

## Discord Capabilities Overview

### 1. Slash Commands

Discord's slash command system provides the foundation for bot interactions.

**Key Features:**
- Native Discord client integration (auto-complete, validation)
- 3-second acknowledgment window (use `deferReply` for longer operations)
- Up to 25 autocomplete suggestions per option
- 15-minute interaction token validity

**Example Commands for Chess:**
```
/move e2e4           - Make a move
/board               - Show current board state
/games               - List active games
/challenge @user     - Challenge someone
/resign              - Resign current game
```

**Sources:**
- [Discord.py Interactions API](https://discordpy.readthedocs.io/en/latest/interactions/api.html)
- [Pycord Slash Commands Guide](https://guide.pycord.dev/interactions/application-commands/slash-commands)

---

### 2. Message Components (Buttons & Select Menus)

Message components enable interactive chess interfaces directly in Discord messages.

**Capabilities:**
- **Buttons:** Up to 25 per message (5 rows × 5 buttons)
- **Select Menus:** Dropdown with multiple options (1 per row, max 5 per message)
- **Persistent Views:** Can survive bot restarts
- **Custom IDs:** For tracking which button/menu was used

**Layout Constraints:**
```
┌─────────────────────────────────────────┐
│ Row 1: [Button] [Button] [Button] ...   │  ← Max 5 buttons per row
│ Row 2: [────── Select Menu ──────────]  │  ← Takes entire row
│ Row 3: [Button] [Button] [Button] ...   │
│ Row 4: [────── Select Menu ──────────]  │
│ Row 5: [Button] [Button] [Button] ...   │
└─────────────────────────────────────────┘
Max: 5 rows total, 25 buttons OR 5 select menus (or combination)
```

**Chess UI Implementation Ideas:**

1. **File Selection + Rank Selection:**
   ```
   Select File: [a] [b] [c] [d] [e] [f] [g] [h]
   Select Rank: [1] [2] [3] [4] [5] [6] [7] [8]
   [Confirm Move] [Cancel] [Show Board]
   ```

2. **Quick Move Buttons:**
   ```
   [e4] [d4] [Nf3] [c4]    ← Common opening moves
   [──── More Moves ────]   ← Select menu for all legal moves
   [Resign] [Offer Draw] [Show Board]
   ```

3. **Piece-Based Selection:**
   ```
   Select Piece: [── Dropdown: Your moveable pieces ──]
   Move To:      [── Dropdown: Legal squares ──]
   [Confirm] [Cancel]
   ```

**Sources:**
- [Discord.js Buttons Guide](https://discordjs.guide/legacy/interactive-components/buttons)
- [Discord.js Select Menus Guide](https://discordjs.guide/interactive-components/select-menus.html)
- [Discord Official Components Docs](https://discord.com/developers/docs/interactions/message-components)

---

### 3. Embedded Apps (Activities)

Discord's Embedded App SDK allows full web applications to run inside Discord.

**Capabilities:**
- Full HTML5/JavaScript web app in iframe
- Available in voice channels, text channels, and DMs
- Works on desktop, web, and mobile
- Real-time multiplayer via WebSocket
- Access to Discord user data (with permission)
- No install required for users

**Technical Requirements:**
- Web application hosted externally
- Discord Embedded App SDK integration
- OAuth2 for user authentication
- HTTPS required

**Advantages for Chess:**
- Full graphical chess board
- Drag-and-drop piece movement
- Real-time board updates
- Can embed existing Chessty web UI

**Considerations:**
- Higher development complexity
- Requires app approval for public use
- Separate hosting infrastructure

**Sources:**
- [Discord Embedded App SDK GitHub](https://github.com/discord/embedded-app-sdk)
- [Discord Activities Overview](https://discord.com/developers/docs/activities/overview)
- [Embedded App SDK Reference](https://discord.com/developers/docs/developer-tools/embedded-app-sdk)

---

### 4. Webhooks

One-way communication from your server to Discord channels.

**Use Cases for Chess:**
- Notify when it's your turn
- Alert when opponent makes a move
- Game result announcements
- Tournament updates

**Webhook Message Format:**
```json
{
  "content": "Your turn in game vs @opponent!",
  "embeds": [{
    "title": "Chess Game Update",
    "description": "Opponent played: e4",
    "image": { "url": "https://your-server.com/board/game123.png" },
    "fields": [
      { "name": "Your Time", "value": "4:32", "inline": true },
      { "name": "Opponent Time", "value": "3:58", "inline": true }
    ]
  }]
}
```

**Limitations:**
- One-way only (Discord cannot send back to webhook)
- No interactive components
- Cannot receive user responses

**Sources:**
- [Discord Webhooks Intro](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
- [Discord Webhook API Docs](https://discord.com/developers/docs/resources/webhook)

---

## Existing Chess Bot Implementations

### Open Source References

| Project | Language | Features | GitHub |
|---------|----------|----------|--------|
| **discord-chess-bot** | Node.js | Visual board, simple commands | [kylepaulsen/discord-chess-bot](https://github.com/kylepaulsen/discord-chess-bot) |
| **Chess-Bot** | Python | Graphical board, stats database | [Davi0k/Chess-Bot](https://github.com/Davi0k/Chess-Bot) |
| **ChessBot** | Python | discord.py, python-chess | [taiypeo/ChessBot](https://github.com/taiypeo/ChessBot) |
| **chessbuddies** | .NET Core | Full notation support | [nvrnight/chessbuddies](https://github.com/nvrnight/chessbuddies) |

### Common Command Patterns

```bash
# Challenge/Start
/chess challenge @user
/chess accept @user
/chess new

# Make Moves
/move e2e4              # UCI notation
/move Nf3               # SAN notation
!e2 e4                  # Space-separated

# Game Management
/board                  # Show board
/resign
/draw offer
/draw accept

# Stats
/stats @user
/leaderboard
```

---

## Recommended Architecture for Chessty

### Phase 1: Bot + Webhooks (MVP)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Discord Bot   │────▶│  Chessty API    │────▶│    Database     │
│  (Commands +    │◀────│  (REST/WS)      │◀────│                 │
│   Components)   │     └─────────────────┘     └─────────────────┘
└─────────────────┘              │
                                 │ Webhooks
                                 ▼
                    ┌─────────────────────────┐
                    │  Discord Notifications  │
                    │  (Turn alerts, results) │
                    └─────────────────────────┘
```

**Bot Features:**
- `/link` - Link Discord account to Chessty account
- `/games` - List active games
- `/board [game_id]` - Show board as image + buttons
- `/move [move]` - Make a move (validates against API)
- `/challenge @user [stake]` - Create challenge via API

**Button Components:**
```
[Quick Moves: e4, d4, Nf3, c4]
[─── All Legal Moves ───]     ← Select menu
[Resign] [Offer Draw] [Refresh Board]
```

### Phase 2: Enhanced Experience

Add Embedded App for full visual experience:
- Embed existing Chessty web UI
- Real-time board updates via WebSocket
- Full drag-and-drop interface
- Spectator mode in voice channels

---

## Technical Implementation Plan

### Discord Bot Stack

```typescript
// Recommended: discord.js v14+ (Node.js)
// Alternative: discord.py (Python)

// Required Scopes
const SCOPES = [
  'bot',
  'applications.commands',
];

// Required Permissions
const PERMISSIONS = [
  'Send Messages',
  'Embed Links',
  'Attach Files',      // For board images
  'Use Slash Commands',
  'Add Reactions',     // Optional
];
```

### API Integration Points

```typescript
// New endpoints needed in Chessty API

// Discord account linking
POST /api/discord/link
  body: { discordId, linkToken }

// Get games for Discord user
GET /api/discord/games/:discordId

// Make move via Discord
POST /api/discord/move
  body: { discordId, gameId, move }

// Webhook registration for notifications
POST /api/discord/webhooks
  body: { channelWebhookUrl, events: ['turn', 'game_end'] }
```

### Board Rendering

Option A: **Server-side image generation**
```typescript
// Generate PNG of board state
import { Chess } from 'chess.js';
import sharp from 'sharp'; // or canvas

async function renderBoard(fen: string): Promise<Buffer> {
  // Render board to PNG
  // Return image buffer for Discord attachment
}
```

Option B: **ASCII/Emoji board**
```
♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜
♟ ♟ ♟ ♟ ♟ ♟ ♟ ♟
· · · · · · · ·
· · · · · · · ·
· · · · ♙ · · ·
· · · · · · · ·
♙ ♙ ♙ ♙ · ♙ ♙ ♙
♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖
```

Option C: **Custom Discord emojis** (requires server with custom emojis)

---

## Database Schema Additions

```sql
-- Discord integration tables

CREATE TABLE discord_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  linked_at INTEGER NOT NULL,
  -- Notification preferences
  notify_turn INTEGER DEFAULT 1,
  notify_game_end INTEGER DEFAULT 1,
  notify_challenge INTEGER DEFAULT 1
);

CREATE TABLE discord_webhooks (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  events TEXT NOT NULL, -- JSON array of event types
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_discord_links_discord_id ON discord_links(discord_id);
CREATE INDEX idx_discord_webhooks_guild_id ON discord_webhooks(guild_id);
```

---

## Security Considerations

1. **Account Linking:**
   - Use one-time tokens for linking (expire in 5 min)
   - Verify Discord user ID via OAuth2 or bot interaction
   - Allow unlinking from both Discord and web

2. **Move Validation:**
   - Always validate moves server-side
   - Rate limit Discord commands (handled by rate limit service)
   - Verify Discord user owns the game

3. **Webhook Security:**
   - Store webhook URLs encrypted
   - Validate webhook ownership on registration
   - Allow webhook removal by channel admins

---

## Cost & Resource Considerations

| Component | Cost | Notes |
|-----------|------|-------|
| Discord Bot | Free | Self-hosted, no Discord fees |
| Webhook notifications | Free | POST requests only |
| Embedded App | Free (dev) | Approval needed for public |
| Board image rendering | Minimal | CPU for image generation |
| Additional API calls | Minimal | Existing infrastructure |

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Set up Discord bot with discord.js
- [ ] Implement `/link` command with token system
- [ ] Add Discord link table to database
- [ ] Basic `/games` and `/board` commands

### Week 2: Core Gameplay
- [ ] Implement `/move` with API integration
- [ ] Add button components for quick moves
- [ ] Board image rendering (server-side PNG)
- [ ] `/challenge` command with confirmation

### Week 3: Notifications
- [ ] Webhook registration system
- [ ] Turn notification webhooks
- [ ] Game result announcements
- [ ] DM notifications option

### Week 4: Polish
- [ ] Error handling and edge cases
- [ ] Help commands and documentation
- [ ] Rate limiting for Discord commands
- [ ] User preferences (notification settings)

### Future: Embedded App
- [ ] Wrap Chessty web UI for iframe
- [ ] Discord SDK integration
- [ ] Real-time multiplayer sync
- [ ] Spectator mode in voice channels

---

## Resources & Documentation

### Official Discord Docs
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Slash Commands](https://discord.com/developers/docs/interactions/application-commands)
- [Message Components](https://discord.com/developers/docs/interactions/message-components)
- [Embedded App SDK](https://discord.com/developers/docs/developer-tools/embedded-app-sdk)
- [Webhooks](https://discord.com/developers/docs/resources/webhook)

### Libraries
- [discord.js](https://discord.js.org/) - Node.js Discord library
- [discord.py](https://discordpy.readthedocs.io/) - Python Discord library
- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic (already in use)

### Example Projects
- [kylepaulsen/discord-chess-bot](https://github.com/kylepaulsen/discord-chess-bot)
- [Davi0k/Chess-Bot](https://github.com/Davi0k/Chess-Bot)
- [Discord Embedded App Examples](https://github.com/discord/embedded-app-sdk-examples)

---

## Conclusion

Discord provides robust capabilities for chess integration through:

1. **Slash Commands** - Core command interface
2. **Message Components** - Interactive buttons and menus
3. **Webhooks** - Real-time notifications
4. **Embedded Apps** - Full graphical experience (future)

The recommended approach is to start with a **bot + components + webhooks** architecture, which provides a good user experience with moderate development effort. This can be enhanced later with an Embedded App for users who want the full visual experience.

Key success factors:
- Seamless account linking between Discord and Chessty
- Quick, intuitive move input (buttons + select menus)
- Timely notifications when it's your turn
- Visual board representation (image or ASCII)
