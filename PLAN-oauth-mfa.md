# OAuth + MFA Implementation Plan

## Summary

| Feature | Effort | New Files | Modified Files |
|---------|--------|-----------|----------------|
| **OAuth (Google + GitHub)** | ~4-6 hours | 6 | 4 |
| **MFA (TOTP)** | ~8-12 hours | 8 | 5 |
| **Total** | ~12-18 hours | 14 | 9 |

---

## Phase 1: OAuth (Google + GitHub)

### What Already Exists
- `findOrCreateOAuthUser()` in auth.ts
- Database columns: `googleId`, `githubId`
- Placeholders in `.env` for OAuth secrets

### Backend Files to Create

| File | Purpose |
|------|---------|
| `apps/server/src/services/oauth.ts` | Generate auth URLs, exchange codes, fetch profiles |
| `apps/server/src/routes/oauth.ts` | Handle `/api/auth/google`, `/api/auth/github` + callbacks |

### Frontend Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/components/auth/OAuthButton.tsx` | "Continue with Google/GitHub" buttons |
| `apps/web/src/components/auth/OAuthDivider.tsx` | "— or —" separator |
| `apps/web/src/app/auth/callback/page.tsx` | Handle OAuth redirect, extract token |

### Files to Modify

| File | Changes |
|------|---------|
| `LoginScreen.tsx` | Add OAuth buttons above email/password form |
| `apps/server/src/index.ts` | Register OAuth routes |

---

## Phase 2: MFA (TOTP)

### Database Migration Needed
```sql
CREATE TABLE mfa_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  totp_secret TEXT NOT NULL,
  backup_codes JSONB NOT NULL,
  enabled BOOLEAN DEFAULT false,
  enrolled_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

### Backend Files to Create

| File | Purpose |
|------|---------|
| `apps/server/src/services/mfa.ts` | Generate secrets, verify TOTP, manage backup codes |
| `apps/server/src/routes/mfa.ts` | Enrollment, verification, disable, backup code endpoints |

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/mfa/enroll/start` | Generate TOTP secret + QR code |
| POST | `/api/mfa/enroll/complete` | Verify first code, enable MFA |
| POST | `/api/auth/mfa/verify` | Verify TOTP during login |
| POST | `/api/mfa/disable` | Disable MFA (requires password) |
| POST | `/api/mfa/backup-codes` | Regenerate backup codes |
| GET | `/api/mfa/status` | Check if MFA enabled |

### Frontend Files to Create

| File | Purpose |
|------|---------|
| `MFACodeInput.tsx` | 6-digit TOTP input with auto-submit |
| `MFAEnrollmentQR.tsx` | Display QR code + manual secret |
| `MFABackupCodes.tsx` | Display/download backup codes |
| `MFAEnrollment.tsx` | Full enrollment wizard (3 steps) |
| `MFASettings.tsx` | Enable/disable MFA in profile |
| `/app/auth/verify-mfa/page.tsx` | MFA verification during login |

---

## Security Considerations

| Concern | Solution |
|---------|----------|
| CSRF on OAuth | State parameter stored server-side, validated on callback |
| Timing attacks on TOTP | `crypto.timingSafeEqual()` for comparison |
| Brute force on MFA | Separate rate limiter (5 attempts / 5 min) |
| Backup code theft | Hashed with Argon2id, single-use |
| TOTP secret exposure | Encrypted at rest with AES-256-GCM |
| Login token abuse | 5-minute expiry, single-use, includes IP fingerprint |

---

## Dependencies

```bash
# Server
pnpm add otpauth --filter @chess-game/server

# Web
pnpm add qrcode @types/qrcode --filter @chess-game/web
```

---

## Environment Variables

```bash
# OAuth (apps/server/.env)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx

# MFA Encryption
MFA_ENCRYPTION_KEY=<64-char-hex>  # openssl rand -hex 32
```

---

## Build Sequence

### Batch 1: Backend Foundation
1. Create database migration for `mfa_enrollments`
2. Create `apps/server/src/services/oauth.ts`
3. Create `apps/server/src/services/mfa.ts`
4. Add rate limiters for MFA to `rateLimit.ts`

### Batch 2: Backend Routes
5. Create `apps/server/src/routes/oauth.ts`
6. Create `apps/server/src/routes/mfa.ts`
7. Modify `auth.ts` to check MFA status on login
8. Register routes in `index.ts`

### Batch 3: Frontend OAuth
9. Create `OAuthButton.tsx` and `OAuthDivider.tsx`
10. Create `/app/auth/callback/page.tsx`
11. Modify `LoginScreen.tsx` to add OAuth buttons
12. Update auth store for OAuth flow

### Batch 4: Frontend MFA
13. Create `MFACodeInput.tsx`
14. Create `MFAEnrollmentQR.tsx` and `MFABackupCodes.tsx`
15. Create `MFAEnrollment.tsx` wizard
16. Create `/app/auth/verify-mfa/page.tsx`
17. Create `MFASettings.tsx` for profile

### Batch 5: Integration & Testing
18. Add MFA section to profile/settings page
19. Modify login flow to handle MFA requirement
20. End-to-end testing
