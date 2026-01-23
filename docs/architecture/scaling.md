# Scaling Strategy

**Last Updated:** 2026-01-18

---

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Next.js   │────▶│   Vercel    │
│   Client    │     │   Frontend  │     │   Edge      │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │ WebSocket
       ▼
┌─────────────┐     ┌─────────────┐
│   Bun       │────▶│  PostgreSQL │
│   Server    │     │  (Single)   │
└─────────────┘     └─────────────┘
```

**Current Capacity Estimate:**
- ~500 concurrent WebSocket connections per server
- ~1000 requests/second (API)
- ~50 active games simultaneously

---

## Scaling Phases

### Phase 1: Vertical Scaling (0-5K users)

**Easiest wins before horizontal scaling:**

```
┌─────────────────────────────────────────────────────────┐
│                    Single Server                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   8 CPU     │  │   32GB RAM  │  │   SSD       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Bun Server (handles API + WebSocket)           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  PostgreSQL (connection pooling + indexes)      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Optimizations:**

1. **Database Connection Pooling**
```typescript
// apps/server/src/drizzle/index.ts
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 50,                    // Max connections
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout
  max_lifetime: 60 * 30,      // Max connection lifetime 30min
});
```

2. **Query Optimization**
```sql
-- Add composite indexes for common queries
CREATE INDEX idx_games_players_status ON games(white_player_id, black_player_id, status);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_bets_game_status ON bets(game_id, status);

-- Partial indexes for active records
CREATE INDEX idx_games_active ON games(id) WHERE status = 'active';
CREATE INDEX idx_queue_active ON matchmaking_queue(user_id) WHERE created_at > NOW() - INTERVAL '1 hour';
```

3. **In-Memory Caching**
```typescript
// Simple LRU cache for frequently accessed data
import { LRUCache } from 'lru-cache';

const userCache = new LRUCache<string, User>({
  max: 10000,
  ttl: 1000 * 60 * 5, // 5 minutes
});

const leaderboardCache = new LRUCache<string, LeaderboardEntry[]>({
  max: 10,
  ttl: 1000 * 60, // 1 minute
});
```

---

### Phase 2: Add Redis (5K-20K users)

```
┌─────────────┐     ┌─────────────┐
│   Server    │────▶│    Redis    │
└─────────────┘     │  - Sessions │
                    │  - Cache    │
                    │  - PubSub   │
                    └─────────────┘
```

**Install Redis:**
```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:7

# Or managed: AWS ElastiCache, Upstash, Railway
```

**Redis Implementation:**

```typescript
// apps/server/src/lib/redis.ts
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL);

// Session storage
export const sessionStore = {
  async set(sessionId: string, userId: string, ttl: number) {
    await redis.setex(`session:${sessionId}`, ttl, userId);
  },

  async get(sessionId: string): Promise<string | null> {
    return redis.get(`session:${sessionId}`);
  },

  async delete(sessionId: string) {
    await redis.del(`session:${sessionId}`);
  },
};

// Caching layer
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key: string, value: any, ttlSeconds: number) {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async invalidate(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  },
};

// Leaderboard with sorted sets
export const leaderboard = {
  async updateElo(userId: string, elo: number) {
    await redis.zadd('leaderboard:elo', elo, userId);
  },

  async getTopPlayers(limit: number): Promise<string[]> {
    return redis.zrevrange('leaderboard:elo', 0, limit - 1, 'WITHSCORES');
  },
};
```

**Rate Limiting with Redis:**
```typescript
// apps/server/src/lib/rateLimit.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redis } from './redis';

export const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  points: 100,           // 100 requests
  duration: 60,          // per minute
  blockDuration: 60 * 5, // block for 5 min if exceeded
});

export const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  points: 5,
  duration: 60 * 15,     // 5 attempts per 15 min
  blockDuration: 60 * 30,
});

export const wsLimiter = new RateLimiterRedis({
  storeClient: redis,
  points: 50,            // 50 messages
  duration: 1,           // per second
});
```

---

### Phase 3: Horizontal Scaling (20K-100K users)

```
                    ┌─────────────┐
                    │   Load      │
                    │   Balancer  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │ Server 1│      │ Server 2│      │ Server 3│
    │  API    │      │  API    │      │  API    │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                 │                 │
         └────────────┬────┴────┬────────────┘
                      │         │
                 ┌────▼────┐ ┌──▼───┐
                 │  Redis  │ │ PG   │
                 │ Cluster │ │      │
                 └─────────┘ └──────┘
```

**Key Challenge: WebSocket State**

WebSocket connections are stateful. When scaling horizontally, players in the same game might connect to different servers.

**Solution: Redis Pub/Sub for Cross-Server Communication**

```typescript
// apps/server/src/websocket/PubSubBridge.ts
import { Redis } from 'ioredis';

export class PubSubBridge {
  private pub: Redis;
  private sub: Redis;
  private serverId: string;

  constructor() {
    this.pub = new Redis(process.env.REDIS_URL!);
    this.sub = new Redis(process.env.REDIS_URL!);
    this.serverId = process.env.SERVER_ID || nanoid();
  }

  async init() {
    // Subscribe to game channels
    await this.sub.psubscribe('game:*', 'user:*');

    this.sub.on('pmessage', (pattern, channel, message) => {
      const data = JSON.parse(message);

      // Ignore messages from self
      if (data.serverId === this.serverId) return;

      this.handleMessage(channel, data);
    });
  }

  // Broadcast game event to all servers
  async broadcastGameEvent(gameId: string, event: any) {
    await this.pub.publish(`game:${gameId}`, JSON.stringify({
      serverId: this.serverId,
      ...event,
    }));
  }

  // Send to specific user (might be on different server)
  async sendToUser(userId: string, message: any) {
    await this.pub.publish(`user:${userId}`, JSON.stringify({
      serverId: this.serverId,
      ...message,
    }));
  }

  private handleMessage(channel: string, data: any) {
    if (channel.startsWith('game:')) {
      const gameId = channel.split(':')[1];
      // Forward to local WebSocket connections for this game
      gameManager.broadcastToGame(gameId, data);
    } else if (channel.startsWith('user:')) {
      const userId = channel.split(':')[1];
      // Forward to local WebSocket connection for this user
      gameManager.sendToUser(userId, data);
    }
  }
}
```

**Load Balancer Configuration (nginx):**

```nginx
# /etc/nginx/nginx.conf
upstream chessty_api {
    least_conn;  # Route to server with least connections
    server api1.chessty.internal:3001;
    server api2.chessty.internal:3001;
    server api3.chessty.internal:3001;
}

upstream chessty_ws {
    # Sticky sessions for WebSocket
    ip_hash;
    server ws1.chessty.internal:3001;
    server ws2.chessty.internal:3001;
    server ws3.chessty.internal:3001;
}

server {
    listen 443 ssl http2;
    server_name api.chessty.com;

    # API routes
    location /api/ {
        proxy_pass http://chessty_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://chessty_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;  # 24 hours
    }
}
```

---

### Phase 4: Database Scaling (100K+ users)

**Read Replicas:**

```
                    ┌─────────────┐
    Writes ────────▶│   Primary   │
                    │   (Master)  │
                    └──────┬──────┘
                           │ Replication
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │ Replica │      │ Replica │      │ Replica │
    │    1    │      │    2    │      │    3    │
    └─────────┘      └─────────┘      └─────────┘
         ▲                 ▲                 ▲
         └─────────────────┴─────────────────┘
                      Reads
```

**Implementation:**

```typescript
// apps/server/src/drizzle/index.ts
import postgres from 'postgres';

// Primary for writes
const primary = postgres(process.env.DATABASE_URL!, {
  max: 20,
});

// Read replicas
const replicas = [
  postgres(process.env.DATABASE_REPLICA_1!, { max: 30 }),
  postgres(process.env.DATABASE_REPLICA_2!, { max: 30 }),
  postgres(process.env.DATABASE_REPLICA_3!, { max: 30 }),
];

let replicaIndex = 0;

export function getReadConnection() {
  // Round-robin through replicas
  const replica = replicas[replicaIndex % replicas.length];
  replicaIndex++;
  return replica;
}

export function getWriteConnection() {
  return primary;
}

// Usage in services
export async function getLeaderboard() {
  // Read from replica
  return db.select()
    .from(users)
    .orderBy(desc(users.eloRating))
    .limit(100)
    .execute({ connection: getReadConnection() });
}

export async function updateElo(userId: string, newElo: number) {
  // Write to primary
  return db.update(users)
    .set({ eloRating: newElo })
    .where(eq(users.id, userId))
    .execute({ connection: getWriteConnection() });
}
```

**Connection Pooling with PgBouncer:**

```ini
# pgbouncer.ini
[databases]
chessty = host=postgres-primary port=5432 dbname=chessty

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
```

---

### Phase 5: Global Distribution (1M+ users)

```
                         ┌──────────────┐
                         │  Cloudflare  │
                         │     CDN      │
                         └──────┬───────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────┐            ┌────▼────┐            ┌────▼────┐
   │  US-East │            │  EU-West │            │ AP-SE   │
   │  Region  │            │  Region  │            │ Region  │
   └────┬────┘            └────┬────┘            └────┬────┘
        │                       │                       │
   ┌────▼────┐            ┌────▼────┐            ┌────▼────┐
   │  API +  │            │  API +  │            │  API +  │
   │  WS     │            │  WS     │            │  WS     │
   │  Redis  │◀──────────▶│  Redis  │◀──────────▶│  Redis  │
   │  PG     │            │  PG     │            │  PG     │
   └─────────┘            └─────────┘            └─────────┘
```

**Multi-Region Considerations:**

1. **Game Matchmaking by Region**
```typescript
// Match players in same region for low latency
const matchmakingConfig = {
  regions: ['us-east', 'eu-west', 'ap-southeast'],
  maxLatencyMs: 100,  // Only match if ping < 100ms
  crossRegionEnabled: false,  // Keep players in same region
};
```

2. **Database Replication Strategy**
```
Primary: us-east (writes)
Replicas: eu-west, ap-southeast (reads)

Latency-sensitive data (moves, clock): Redis in each region
Eventually-consistent data (stats, history): Cross-region replication
```

3. **CDN for Static Assets**
```typescript
// next.config.js
module.exports = {
  images: {
    domains: ['cdn.chessty.com'],
    loader: 'cloudflare',
  },
  assetPrefix: 'https://cdn.chessty.com',
};
```

---

## Deployment Options

### Option 1: Managed Platform (Recommended for Start)

| Service | Provider | Cost/Month |
|---------|----------|------------|
| Frontend | Vercel | $20 (Pro) |
| Backend | Railway / Render | $20-50 |
| Database | Neon / Supabase | $25-50 |
| Redis | Upstash | $10-30 |
| **Total** | | **$75-150** |

### Option 2: Self-Hosted (Cost Optimization)

| Service | Provider | Cost/Month |
|---------|----------|------------|
| VPS (8 CPU, 32GB) | Hetzner | $30 |
| Managed PostgreSQL | Hetzner | $15 |
| Redis | Upstash | $10 |
| **Total** | | **$55** |

### Option 3: Cloud Native (Enterprise Scale)

| Service | Provider | Cost/Month |
|---------|----------|------------|
| EKS/GKE | AWS/GCP | $150+ |
| RDS/Cloud SQL | AWS/GCP | $100+ |
| ElastiCache/Memorystore | AWS/GCP | $50+ |
| CloudFront/Cloud CDN | AWS/GCP | $50+ |
| **Total** | | **$350+** |

---

## Capacity Planning

### Metrics to Monitor

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| CPU | >70% | >85% | Add server |
| Memory | >75% | >90% | Add RAM or server |
| DB Connections | >70% pool | >85% pool | Add pooler/replicas |
| WS Connections | >400/server | >450/server | Add WS server |
| API Latency p95 | >500ms | >1s | Profile & optimize |
| Error Rate | >1% | >5% | Investigate |

### Scaling Triggers

```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: chessty-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: chessty-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
```

---

## Cost Optimization Tips

1. **Use Spot/Preemptible Instances** for non-critical workloads
2. **Reserved Instances** for predictable baseline load
3. **Auto-scaling** to match demand (scale down at night)
4. **CDN Caching** for static assets (saves bandwidth)
5. **Database Connection Pooling** (reduces instance size needed)
6. **Redis Caching** for expensive queries (reduces DB load)

---

## Summary: When to Scale What

| Users | Focus |
|-------|-------|
| 0-1K | Single server, optimize queries |
| 1K-5K | Add Redis, connection pooling |
| 5K-20K | Horizontal API scaling, read replicas |
| 20K-100K | Dedicated WS servers, sharding |
| 100K+ | Multi-region, advanced caching |
