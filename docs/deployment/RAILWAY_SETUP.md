# Railway Game Server Setup

> **What is Railway?** A cloud platform that runs your server code. Think of it as "hosting for developers" — you push code, it runs in the cloud. Simpler than AWS, designed for startups.

---

## Why Railway for This Project

| Concern | Railway's Answer |
|---------|------------------|
| **WebSocket support** | Native support, no extra config |
| **Bun runtime** | Supported out of the box |
| **Cost** | $5/month hobby plan, scales to $20+/month |
| **Simplicity** | Connect GitHub repo, deploy automatically |
| **Databases** | We use Neon separately (better for Postgres) |

**Alternatives considered:**
- **Fly.io** — Also good, slightly more complex
- **Render** — Good but WebSocket cold starts are slower
- **AWS** — Overkill for our stage, complex setup
- **Vercel** — Great for frontend, not ideal for WebSocket servers

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   USERS                                                              │
│     │                                                                │
│     │ HTTPS / WSS                                                    │
│     ▼                                                                │
│   ┌─────────────────────────────────────────┐                        │
│   │           RAILWAY                        │                        │
│   │  ┌─────────────────────────────────┐    │                        │
│   │  │      Game Server (Bun)          │    │                        │
│   │  │                                 │    │                        │
│   │  │  • HTTP API (REST endpoints)    │    │                        │
│   │  │  • WebSocket server             │    │                        │
│   │  │  • Anti-cheat service           │    │                        │
│   │  │  • Matchmaking                  │    │                        │
│   │  │                                 │    │                        │
│   │  └──────────────┬──────────────────┘    │                        │
│   │                 │                        │                        │
│   └─────────────────┼────────────────────────┘                        │
│                     │                                                │
│                     │ DATABASE_URL                                   │
│                     ▼                                                │
│   ┌─────────────────────────────────────────┐                        │
│   │              NEON                        │                        │
│   │         PostgreSQL Database              │                        │
│   │                                          │                        │
│   │  • Users, games, bets                   │                        │
│   │  • Anti-cheat calibration weights       │                        │
│   │  • All persistent data                  │                        │
│   │                                          │                        │
│   └─────────────────────────────────────────┘                        │
│                                                                      │
│   (Future: Redis on Upstash for game state caching)                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before setting up Railway, make sure you have:

- [ ] GitHub account (Railway deploys from GitHub)
- [ ] Neon database already set up (you have this)
- [ ] `DATABASE_URL` from Neon dashboard

---

## Step-by-Step Setup

### 1. Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended — enables auto-deploy)
3. You get $5 free credits to start

### 2. Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select `the-chess-game` repository
4. Railway will detect the monorepo structure

### 3. Configure the Service

Railway needs to know which part of the monorepo to run.

**Option A: Railway Dashboard (UI)**

1. Click on the service
2. Go to **Settings** → **General**
3. Set **Root Directory**: `apps/server`
4. Set **Build Command**: `bun install`
5. Set **Start Command**: `bun run start`

**Option B: railway.toml (Code)**

Create this file in the repo root:

```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "cd apps/server && bun run start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### 4. Set Environment Variables

Go to **Variables** tab and add:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | From Neon dashboard |
| `NODE_ENV` | `production` | Enables production mode |
| `PORT` | `${{RAILWAY_PORT}}` | Railway provides this |
| `JWT_SECRET` | `your-secret-here` | Generate a strong random string |
| `CORS_ORIGIN` | `https://your-domain.com` | Your frontend URL |

**Optional (add later):**

| Variable | Value | Notes |
|----------|-------|-------|
| `REDIS_URL` | `redis://...` | When you add Upstash Redis |
| `STOCKFISH_PATH` | `/app/binaries/stockfish` | If bundling Stockfish |

### 5. Deploy

1. Railway auto-deploys when you push to `main`
2. First deploy takes 2-3 minutes (building)
3. Watch the logs for any errors

### 6. Get Your URL

After deploy, Railway gives you a URL like:
```
https://the-chess-game-production.up.railway.app
```

You can add a custom domain in **Settings** → **Domains**.

---

## Server Code Changes Needed

Your server needs a few tweaks for production:

### Health Check Endpoint

Add this to your server (if not already present):

```typescript
// apps/server/src/routes/health.ts
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});
```

### Port Configuration

Make sure your server reads the PORT from environment:

```typescript
// apps/server/src/index.ts
const port = process.env.PORT || 3001;

Bun.serve({
  port,
  fetch: app.fetch,
  websocket: { /* ... */ },
});

console.log(`Server running on port ${port}`);
```

### CORS for Production

```typescript
// apps/server/src/index.ts
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
```

---

## WebSocket Considerations

Railway handles WebSocket connections well, but keep in mind:

### Connection Limits

| Plan | Concurrent Connections |
|------|------------------------|
| Hobby ($5/mo) | ~1,000 |
| Pro ($20/mo) | ~10,000 |
| Enterprise | Unlimited |

### Sticky Sessions

For multiple server instances, you need sticky sessions (same user always hits same server). Railway doesn't do this automatically.

**Solution:** Use Redis Pub/Sub (Upstash) to broadcast messages across instances:

```
User A ──▶ Server 1 ──▶ Redis Pub/Sub ──▶ Server 2 ──▶ User B
```

This is a future enhancement when you scale beyond one server.

---

## Costs Breakdown

| Component | Service | Cost |
|-----------|---------|------|
| Game Server | Railway | $5-20/month |
| Database | Neon | Free tier (generous) |
| Redis (future) | Upstash | Free tier to start |
| Domain | Cloudflare | $10/year |

**Total to start:** ~$5-10/month

---

## Deployment Checklist

### Before First Deploy

- [ ] Database migrations are applied (`pnpm db:push`)
- [ ] All secrets removed from code
- [ ] Health check endpoint exists
- [ ] CORS configured for production domain
- [ ] WebSocket server listens on correct port

### After Deploy

- [ ] Visit `/health` endpoint — should return `{ status: 'ok' }`
- [ ] Test WebSocket connection from frontend
- [ ] Check Railway logs for errors
- [ ] Monitor memory/CPU usage in Railway dashboard

---

## Troubleshooting

### Build Fails

**"bun: command not found"**
- Railway should auto-detect Bun from `bun.lockb`
- If not, add to railway.toml: `builder = "dockerfile"` and create a Dockerfile

**"Cannot find module"**
- Make sure `bun install` runs before start
- Check that root directory is set correctly

### WebSocket Disconnects

**Connections dropping after 30 seconds**
- Add ping/pong heartbeat (Railway has a 60s idle timeout)
- Your code should already have this in the WebSocket handler

### Out of Memory

**Process killed (OOM)**
- Hobby plan has 512MB RAM
- Check for memory leaks in WebSocket connections
- Consider upgrading to Pro plan

---

## Next Steps After Railway Setup

1. **Add custom domain** — Point your domain's DNS to Railway
2. **Set up Upstash Redis** — For game state persistence
3. **Configure monitoring** — Railway has built-in metrics, add Datadog/Sentry for errors
4. **Set up CI/CD tests** — Run tests before auto-deploy

---

## Quick Reference

| Action | Command / Location |
|--------|-------------------|
| View logs | Railway Dashboard → Deployments → View Logs |
| Restart service | Railway Dashboard → Service → Restart |
| Check metrics | Railway Dashboard → Metrics tab |
| Add env var | Railway Dashboard → Variables |
| Manual deploy | `railway up` (if using CLI) |
| Connect to shell | `railway shell` (CLI only) |

---

## Related Docs

- [Neon Database Setup](../neon-database.md) — Your PostgreSQL setup
- [ROADMAP.md](../ROADMAP.md) — Full production roadmap
- [SECURITY.md](../SECURITY.md) — Production security requirements
