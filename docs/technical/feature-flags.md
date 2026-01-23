# Feature Flag Management

This document outlines feature flag management solutions and the implementation strategy for the chess game project.

---

## Why Feature Flags?

Feature flags enable:
- **Safe Deployments**: Roll back instantly without code changes
- **Gradual Rollouts**: Release to 5% of users, then 25%, then 100%
- **A/B Testing**: Compare feature variants with real users
- **Kill Switches**: Disable features instantly if they cause issues (e.g., database spikes)
- **Environment Parity**: Same code in dev/staging/prod with different flags

---

## Modern Feature Flag Solutions (2026)

### Tier 1: Enterprise-Ready Open Source

| Tool | Best For | Hosting | License | GitHub Stars |
|------|----------|---------|---------|--------------|
| **[Unleash](https://www.getunleash.io/)** | Most mature, 15+ SDKs | Self-hosted / Cloud | Apache-2.0 | 10,000+ |
| **[Flagsmith](https://www.flagsmith.com/)** | Flexible deployments | Self-hosted / Cloud | BSD-3 | 4,000+ |
| **[GrowthBook](https://www.growthbook.io/)** | Data warehouse native + A/B | Self-hosted / Cloud | MIT | 5,000+ |

### Tier 2: Lightweight & Developer-Focused

| Tool | Best For | Hosting | License | Notes |
|------|----------|---------|---------|-------|
| **[Flipt](https://www.flipt.io/)** | Git-native, no database | Self-hosted | GPL-3.0 | Store flags in Git |
| **[GO Feature Flag](https://gofeatureflag.org/)** | Simple Go apps | Self-hosted | MIT | File-based config |
| **[PostHog](https://posthog.com/)** | Full product analytics | Self-hosted / Cloud | MIT | Includes analytics, session replay |

### Tier 3: Standards & Specifications

| Tool | Best For | Notes |
|------|----------|-------|
| **[OpenFeature](https://openfeature.dev/)** | Vendor-neutral API | Spec that works with any provider |

---

## Recommended Solutions

### For This Project: **Start Simple, Scale Later**

Given our current stage and architecture, we recommend:

**Phase 1 (Now): Built-in Simple System**
- Database-backed flags in PostgreSQL
- Zustand store on frontend
- Simple API endpoint
- Cost: $0, full control

**Phase 2 (When needed): Unleash or Flagsmith**
- When you need: user segmentation, gradual rollouts, audit logs
- Both offer free self-hosted tiers
- Can migrate from Phase 1 data

### Comparison for Our Use Case

| Criteria | Built-in | Unleash | Flagsmith | PostHog |
|----------|----------|---------|-----------|---------|
| **Setup Complexity** | Low | Medium | Medium | Medium |
| **Self-hosted Cost** | Free | Free (2 envs) | Free | Free |
| **TypeScript SDK** | Custom | Official | Official | Official |
| **User Targeting** | Basic | Advanced | Advanced | Advanced |
| **A/B Testing** | No | Yes | Yes | Yes |
| **Analytics** | No | Basic | Basic | Full |
| **Our Stack Fit** | Perfect | Good | Good | Good |

---

## Architecture Decision

### Why Build In-House First?

1. **Simplicity**: Our needs are currently basic (on/off flags per feature)
2. **Control**: Full ownership of flag logic and data
3. **Learning**: Understand the problem before adopting a solution
4. **Cost**: No additional infrastructure
5. **Integration**: Seamlessly fits our Drizzle/Zustand stack

### When to Migrate to External Tool

Consider migrating when you need:
- [ ] Percentage-based rollouts (10% of users)
- [ ] User segment targeting (premium users only)
- [ ] Scheduled flag changes
- [ ] Audit logging for compliance
- [ ] Multi-environment flag management UI
- [ ] A/B testing with statistical significance

---

## Implementation Strategy

### Database Schema

```sql
-- Feature flags table
CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,           -- e.g., 'betting_enabled', 'new_matchmaking'
  name TEXT NOT NULL,            -- Human-readable name
  description TEXT,              -- What this flag controls
  enabled BOOLEAN DEFAULT false, -- Global on/off
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### API

```
GET  /api/flags           -- Get all flags for current context
GET  /api/flags/:id       -- Get specific flag
POST /api/flags/:id       -- Update flag (admin only)
```

### Client Usage

```typescript
// In React components
const { isEnabled } = useFeatureFlags();

if (isEnabled('new_matchmaking')) {
  return <NewMatchmaking />;
}
return <LegacyMatchmaking />;
```

### Server Usage

```typescript
// In route handlers
const flags = await getFeatureFlags();

if (flags.isEnabled('betting_enabled')) {
  // Process bet
}
```

---

## Flag Naming Conventions

```
{category}_{feature}_{variant?}

Examples:
- betting_enabled
- matchmaking_v2
- ui_dark_mode
- experiment_new_board_colors
```

**Categories:**
- `betting_` - Betting/wagering features
- `matchmaking_` - Game matching features
- `ui_` - UI/UX changes
- `experiment_` - A/B tests
- `admin_` - Admin-only features
- `debug_` - Development/debugging

---

## Migration Path to External Tools

### To Unleash

1. Export flags from database
2. Import to Unleash
3. Replace `useFlagsStore` with Unleash React SDK
4. Replace server utility with Unleash Node SDK
5. Keep database as fallback

### To Flagsmith

1. Similar process with Flagsmith SDK
2. Flagsmith has simpler self-hosted setup
3. Better for smaller teams

### To PostHog

1. If you're already using PostHog for analytics
2. Feature flags are included
3. Best value if you need the full suite

---

## Resources

- [Unleash Documentation](https://docs.getunleash.io/)
- [Flagsmith Documentation](https://docs.flagsmith.com/)
- [GrowthBook Documentation](https://docs.growthbook.io/)
- [OpenFeature Specification](https://openfeature.dev/)
- [PostHog Feature Flags](https://posthog.com/docs/feature-flags)
- [Flipt Documentation](https://www.flipt.io/docs)
- [Feature Flag Best Practices](https://martinfowler.com/articles/feature-toggles.html)

---

## Current Implementation

See the following files for our built-in implementation:
- Schema: `/apps/server/src/drizzle/schema.ts` (feature_flags table)
- Shared Types: `/packages/shared/src/types/flags.ts`
- Server Utility: `/apps/server/src/lib/featureFlags.ts`
- Web Store: `/apps/web/src/store/flags.ts`
- API: `/apps/server/src/routes/flags.ts`
