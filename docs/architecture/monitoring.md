# Monitoring & Analytics Setup

**Last Updated:** 2026-01-18

---

## Overview

This document covers the implementation of monitoring, analytics, and observability for Chessty. We'll use a combination of tools for different purposes:

| Tool | Purpose | Cost |
|------|---------|------|
| **PostHog** | Product analytics, feature flags, session replay | Free tier: 1M events/month |
| **Sentry** | Error tracking, performance monitoring | Free tier: 5K errors/month |
| **Grafana + Prometheus** | Infrastructure metrics, custom dashboards | Self-hosted (free) |
| **Uptime Robot** | Uptime monitoring, alerting | Free tier: 50 monitors |

---

## Part 1: PostHog Setup

### 1.1 Install PostHog

```bash
# Frontend (Next.js)
cd apps/web
pnpm add posthog-js

# Backend (optional, for server-side events)
cd apps/server
bun add posthog-node
```

### 1.2 Frontend Integration

```typescript
// apps/web/src/lib/posthog.ts
import posthog from 'posthog-js';

export const initPostHog = () => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',

      // Capture performance data
      capture_pageview: true,
      capture_pageleave: true,

      // Session recording (optional)
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true,
        },
      },

      // Feature flags
      bootstrap: {
        featureFlags: {},
      },

      // Privacy
      persistence: 'localStorage',
      disable_session_recording: process.env.NODE_ENV === 'development',
    });
  }
};

export { posthog };
```

### 1.3 Provider Setup

```typescript
// apps/web/src/components/providers/PostHogProvider.tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initPostHog, posthog } from '@/lib/posthog';
import { useAuthStore } from '@/store/auth';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views
  useEffect(() => {
    if (pathname) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
      });
    }
  }, [pathname, searchParams]);

  // Identify user when logged in
  useEffect(() => {
    if (user) {
      posthog.identify(user.id, {
        email: user.email,
        username: user.username,
        elo_rating: user.eloRating,
        account_balance: user.balance,
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  return <>{children}</>;
}
```

### 1.4 Add to App Layout

```typescript
// apps/web/src/app/layout.tsx
import { PostHogProvider } from '@/components/providers/PostHogProvider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
```

### 1.5 Key Events to Track

```typescript
// apps/web/src/lib/analytics.ts
import { posthog } from './posthog';

export const analytics = {
  // Authentication
  userRegistered: (method: 'email' | 'wallet') => {
    posthog.capture('user_registered', { method });
  },

  userLoggedIn: (method: 'email' | 'wallet') => {
    posthog.capture('user_logged_in', { method });
  },

  // Game Events
  gameStarted: (gameId: string, stakeAmount: number, timeControl: string) => {
    posthog.capture('game_started', {
      game_id: gameId,
      stake_amount: stakeAmount,
      time_control: timeControl,
    });
  },

  gameEnded: (gameId: string, result: string, duration: number) => {
    posthog.capture('game_ended', {
      game_id: gameId,
      result,
      duration_seconds: duration,
    });
  },

  moveMade: (gameId: string, moveNumber: number) => {
    posthog.capture('move_made', {
      game_id: gameId,
      move_number: moveNumber,
    });
  },

  // Matchmaking
  joinedQueue: (stakeAmount: number, timeControl: string) => {
    posthog.capture('joined_queue', {
      stake_amount: stakeAmount,
      time_control: timeControl,
    });
  },

  leftQueue: (waitTimeSeconds: number) => {
    posthog.capture('left_queue', {
      wait_time_seconds: waitTimeSeconds,
    });
  },

  matchFound: (waitTimeSeconds: number) => {
    posthog.capture('match_found', {
      wait_time_seconds: waitTimeSeconds,
    });
  },

  // Betting
  betPlaced: (gameId: string, amount: number, predictedWinner: string) => {
    posthog.capture('bet_placed', {
      game_id: gameId,
      amount,
      predicted_winner: predictedWinner,
    });
  },

  betWon: (gameId: string, payout: number) => {
    posthog.capture('bet_won', {
      game_id: gameId,
      payout,
    });
  },

  // Wallet
  depositInitiated: (amount: number) => {
    posthog.capture('deposit_initiated', { amount });
  },

  withdrawalInitiated: (amount: number) => {
    posthog.capture('withdrawal_initiated', { amount });
  },

  // Feature Usage
  featureUsed: (feature: string, metadata?: Record<string, any>) => {
    posthog.capture('feature_used', {
      feature,
      ...metadata,
    });
  },

  // Errors
  errorOccurred: (error: string, context?: Record<string, any>) => {
    posthog.capture('error_occurred', {
      error,
      ...context,
    });
  },
};
```

### 1.6 Feature Flags

```typescript
// apps/web/src/hooks/useFeatureFlag.ts
import { useEffect, useState } from 'react';
import { posthog } from '@/lib/posthog';

export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const value = posthog.isFeatureEnabled(flag);
    setEnabled(!!value);

    // Listen for flag updates
    const unsubscribe = posthog.onFeatureFlags(() => {
      setEnabled(!!posthog.isFeatureEnabled(flag));
    });

    return unsubscribe;
  }, [flag]);

  return enabled;
}

// Usage
function Component() {
  const showNewUI = useFeatureFlag('new-game-ui');

  return showNewUI ? <NewGameUI /> : <OldGameUI />;
}
```

### 1.7 Environment Variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

## Part 2: Sentry Error Tracking

### 2.1 Install Sentry

```bash
# Frontend
cd apps/web
pnpm add @sentry/nextjs

# Backend
cd apps/server
bun add @sentry/bun
```

### 2.2 Frontend Setup

```bash
# Run the Sentry wizard
npx @sentry/wizard@latest -i nextjs
```

Or manually configure:

```typescript
// apps/web/sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: 0.1, // 10% of transactions

  // Session replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],

  // Environment
  environment: process.env.NODE_ENV,

  // Filter out noisy errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    /Loading chunk \d+ failed/,
  ],
});
```

### 2.3 Backend Setup

```typescript
// apps/server/src/lib/sentry.ts
import * as Sentry from '@sentry/bun';

export const initSentry = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV || 'development',
    });
  }
};

// Wrap async handlers
export const withSentry = <T>(fn: () => Promise<T>): Promise<T> => {
  return Sentry.startSpan({ name: 'api-request' }, async () => {
    try {
      return await fn();
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });
};
```

### 2.4 Error Context

```typescript
// Add user context to errors
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.username,
});

// Add custom context
Sentry.setContext('game', {
  gameId: currentGame.id,
  stake: currentGame.stakeAmount,
  timeControl: currentGame.timeControl,
});

// Capture with extra data
Sentry.captureException(error, {
  extra: {
    gameState: chess.fen(),
    moveHistory: moves,
  },
});
```

---

## Part 3: Infrastructure Monitoring (Grafana + Prometheus)

### 3.1 Prometheus Metrics Endpoint

```typescript
// apps/server/src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

// Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Business metrics
export const activeGames = new Gauge({
  name: 'active_games_total',
  help: 'Number of active games',
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'websocket_connections_total',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

export const matchmakingQueueSize = new Gauge({
  name: 'matchmaking_queue_size',
  help: 'Number of players in matchmaking queue',
  registers: [register],
});

export const totalBetsPlaced = new Counter({
  name: 'bets_placed_total',
  help: 'Total bets placed',
  labelNames: ['outcome'],
  registers: [register],
});

export const totalStakeAmount = new Counter({
  name: 'stake_amount_total',
  help: 'Total stake amount in dollars',
  registers: [register],
});
```

### 3.2 Metrics Middleware

```typescript
// apps/server/src/middleware/metrics.ts
import { httpRequestsTotal, httpRequestDuration } from '../metrics';

export const metricsMiddleware = async (req: Request, handler: () => Promise<Response>) => {
  const start = Date.now();
  const path = new URL(req.url).pathname;

  try {
    const response = await handler();

    httpRequestsTotal.inc({
      method: req.method,
      path,
      status: response.status,
    });

    httpRequestDuration.observe(
      { method: req.method, path },
      (Date.now() - start) / 1000
    );

    return response;
  } catch (error) {
    httpRequestsTotal.inc({
      method: req.method,
      path,
      status: 500,
    });
    throw error;
  }
};
```

### 3.3 Metrics Endpoint

```typescript
// apps/server/src/routes/metrics.ts
import { register } from '../metrics';

export async function handleMetrics(): Promise<Response> {
  const metrics = await register.metrics();
  return new Response(metrics, {
    headers: { 'Content-Type': register.contentType },
  });
}

// In index.ts
if (path === '/metrics') {
  return handleMetrics();
}
```

### 3.4 Docker Compose for Monitoring Stack

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3030:3000'
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false

volumes:
  prometheus_data:
  grafana_data:
```

### 3.5 Prometheus Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'chessty-api'
    static_configs:
      - targets: ['host.docker.internal:3001']
    metrics_path: '/metrics'

  - job_name: 'node'
    static_configs:
      - targets: ['host.docker.internal:9100']
```

---

## Part 4: Alerting

### 4.1 Critical Alerts

```yaml
# prometheus/alerts.yml
groups:
  - name: chessty-alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: Error rate is {{ $value | printf "%.2f" }} errors/sec

      # API latency
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High API latency
          description: 95th percentile latency is {{ $value | printf "%.2f" }}s

      # Database connections
      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High database connections

      # WebSocket connections drop
      - alert: WebSocketConnectionsDrop
        expr: delta(websocket_connections_total[5m]) < -50
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: Sudden drop in WebSocket connections
```

### 4.2 Slack/Discord Integration

```typescript
// apps/server/src/lib/alerts.ts
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

export async function sendAlert(
  severity: 'info' | 'warning' | 'critical',
  title: string,
  message: string,
  metadata?: Record<string, any>
) {
  if (!WEBHOOK_URL) return;

  const colors = {
    info: '#2196F3',
    warning: '#FF9800',
    critical: '#F44336',
  };

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `[${severity.toUpperCase()}] ${title}`,
        description: message,
        color: parseInt(colors[severity].slice(1), 16),
        fields: metadata ? Object.entries(metadata).map(([name, value]) => ({
          name,
          value: String(value),
          inline: true,
        })) : [],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

// Usage
await sendAlert('critical', 'High Error Rate', 'API error rate exceeded 10%', {
  errorRate: '15%',
  endpoint: '/api/games',
});
```

---

## Part 5: Uptime Monitoring

### 5.1 Health Check Endpoint

```typescript
// apps/server/src/routes/health.ts
export async function handleHealth(): Promise<Response> {
  const checks = {
    server: 'ok',
    database: await checkDatabase(),
    websocket: checkWebSocket(),
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks).every(v => v === 'ok' || typeof v === 'string');

  return Response.json(checks, {
    status: isHealthy ? 200 : 503,
  });
}

async function checkDatabase(): Promise<string> {
  try {
    await db.execute(sql`SELECT 1`);
    return 'ok';
  } catch {
    return 'error';
  }
}

function checkWebSocket(): string {
  return gameManager.isHealthy() ? 'ok' : 'error';
}
```

### 5.2 Uptime Robot Configuration

1. Create monitors for:
   - `https://api.chessty.com/health` (5 min interval)
   - `https://chessty.com` (5 min interval)
   - `wss://api.chessty.com/ws` (keyword monitor)

2. Set up alert contacts (email, Slack, Discord)

---

## Part 6: Logging

### 6.1 Structured Logging

```typescript
// apps/server/src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

export const logger = {
  debug: (message: string, meta?: object) => log('debug', message, meta),
  info: (message: string, meta?: object) => log('info', message, meta),
  warn: (message: string, meta?: object) => log('warn', message, meta),
  error: (message: string, meta?: object) => log('error', message, meta),
};

function log(level: LogLevel, message: string, meta?: object) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // Output as JSON for log aggregation
  console.log(JSON.stringify(entry));

  // Send to PostHog for critical errors
  if (level === 'error' && process.env.POSTHOG_API_KEY) {
    // Track in PostHog
  }
}

// Usage
logger.info('Game started', {
  gameId: 'abc123',
  whitePlayer: 'user1',
  blackPlayer: 'user2',
  stakeAmount: 100,
});
```

### 6.2 Request Logging Middleware

```typescript
// apps/server/src/middleware/logging.ts
import { logger } from '../lib/logger';
import { nanoid } from 'nanoid';

export const loggingMiddleware = async (
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> => {
  const requestId = nanoid(10);
  const start = Date.now();
  const path = new URL(req.url).pathname;

  logger.info('Request started', {
    requestId,
    method: req.method,
    path,
    ip: req.headers.get('x-forwarded-for'),
  });

  try {
    const response = await handler();

    logger.info('Request completed', {
      requestId,
      method: req.method,
      path,
      status: response.status,
      duration: Date.now() - start,
    });

    return response;
  } catch (error) {
    logger.error('Request failed', {
      requestId,
      method: req.method,
      path,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    });
    throw error;
  }
};
```

---

## Environment Variables Summary

```bash
# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
POSTHOG_API_KEY=phx_xxx  # For server-side

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx

# Alerting
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
ALERT_EMAIL=alerts@chessty.com

# Logging
LOG_LEVEL=info
```

---

## Dashboard Examples

### Key Metrics to Display

1. **Real-time Dashboard**
   - Active games count
   - Online users
   - WebSocket connections
   - Matchmaking queue size

2. **Business Dashboard**
   - Games played today/week/month
   - Total stake volume
   - New user registrations
   - Revenue metrics

3. **Technical Dashboard**
   - API response times (p50, p95, p99)
   - Error rates by endpoint
   - Database query performance
   - WebSocket message throughput

4. **Security Dashboard**
   - Failed login attempts
   - Suspicious activity flags
   - Rate limit triggers
   - Anti-cheat alerts
