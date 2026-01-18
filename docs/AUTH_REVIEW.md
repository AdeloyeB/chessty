# Authentication Review & Recommendations

**Last Updated:** 2026-01-18

---

## Current Implementation

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │     │   Database      │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ Auth Store│  │────▶│  │ JWT Auth  │  │────▶│  │ users     │  │
│  │ (Zustand) │  │     │  │ (jose)    │  │     │  │ sessions  │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │                 │
│  │ wagmi     │  │     │  │ bcrypt    │  │     │                 │
│  │ (Wallet)  │  │     │  │ (hashing) │  │     │                 │
│  └───────────┘  │     │  └───────────┘  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Current Auth Flow

1. **Email/Password Registration**
   - User provides email, username, password
   - Password hashed with bcrypt (12 rounds)
   - User record created in database
   - Session created, JWT issued

2. **Login**
   - Verify email/password
   - Create new session
   - Issue JWT (7-day expiration)
   - Store token in localStorage

3. **Session Validation**
   - JWT verified on each request
   - Session checked in database
   - User data returned

### Code Locations

| Component | File | Purpose |
|-----------|------|---------|
| Auth Service | `apps/server/src/services/auth.ts` | JWT, bcrypt, session management |
| Auth Routes | `apps/server/src/routes/auth.ts` | Login, register, logout endpoints |
| Auth Store | `apps/web/src/store/auth.ts` | Frontend state management |
| Wallet Config | `apps/web/src/config/wagmi.ts` | Wallet connection (unused) |

---

## Analysis: Build vs. Buy

### Option 1: Keep Current Implementation (Self-Hosted)

**Pros:**
- Full control over auth flow
- No vendor lock-in
- No additional costs
- Simple architecture

**Cons:**
- Security responsibility on you
- Missing features (2FA, social login, magic links)
- Need to build password reset, email verification
- Session management complexity at scale

**Best For:** MVPs, small teams with security expertise

### Option 2: Auth Provider (Recommended)

**Leading Options:**

| Provider | Pricing | Best For |
|----------|---------|----------|
| **Clerk** | Free to 10K MAU, then $0.02/MAU | Best DX, React-first |
| **Auth0** | Free to 7K MAU, then $0.003-$0.023/MAU | Enterprise features |
| **Supabase Auth** | Free to 50K MAU | Already using Supabase |
| **Firebase Auth** | Free to 50K MAU | Mobile + Web |
| **NextAuth.js** | Free (self-hosted) | Next.js native |

**Pros:**
- Built-in security best practices
- 2FA, social login, magic links out of the box
- Password reset, email verification handled
- Compliance (SOC2, GDPR) often included
- Scales automatically

**Cons:**
- Monthly cost at scale
- Vendor dependency
- Less control over UX
- Data residency concerns

**Best For:** Production apps, teams without dedicated security engineer

### Option 3: Wallet-Only Auth (Web3)

**Current Setup:** wagmi + viem configured but unused

**Flow:**
1. User connects wallet (MetaMask, WalletConnect)
2. Backend generates nonce
3. User signs message with wallet
4. Backend verifies signature
5. Session created

**Pros:**
- No passwords to manage
- Pseudonymous by default
- Crypto-native UX
- No email/PII storage

**Cons:**
- Limits audience (wallet required)
- Poor mobile UX
- Wallet signature UX confusing for non-crypto users
- Account recovery depends on wallet

**Best For:** Crypto-native products, DeFi integrations

---

## Recommendation: Hybrid Approach

For a chess betting platform, the optimal approach combines multiple auth methods:

```
┌─────────────────────────────────────────────────────────────────┐
│                       Auth Gateway                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Email/    │  │   Wallet    │  │   Social    │             │
│  │  Password   │  │  (SIWE)     │  │  (Google)   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                   ┌──────▼──────┐                               │
│                   │  Unified    │                               │
│                   │  User ID    │                               │
│                   └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Plan

#### Phase 1: Secure Current Implementation

1. **Fix Critical Issues (Week 1)**
```typescript
// Remove default JWT secret
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

// Add rate limiting
const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 15,
});

// Strengthen password requirements
password: z.string()
  .min(12)
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain number')
```

2. **Add Email Verification (Week 2)**
```typescript
// On registration
await sendVerificationEmail(user.email, verificationToken);

// Block login until verified
if (!user.emailVerified) {
  throw new Error('Please verify your email');
}
```

3. **Add Password Reset (Week 2)**
```typescript
// Generate reset token
const resetToken = nanoid(32);
await db.insert(passwordResets).values({
  userId: user.id,
  token: await hash(resetToken),
  expiresAt: new Date(Date.now() + 3600000), // 1 hour
});
await sendPasswordResetEmail(user.email, resetToken);
```

#### Phase 2: Add Wallet Auth (Week 3-4)

```typescript
// apps/server/src/services/walletAuth.ts
import { verifyMessage } from 'viem';

export async function generateNonce(address: string): Promise<string> {
  const nonce = nanoid(32);
  await redis.setex(`nonce:${address}`, 300, nonce); // 5 min expiry
  return nonce;
}

export async function verifyWalletSignature(
  address: string,
  signature: string,
  message: string
): Promise<boolean> {
  const storedNonce = await redis.get(`nonce:${address}`);
  if (!storedNonce || !message.includes(storedNonce)) {
    return false;
  }

  const isValid = await verifyMessage({
    address,
    message,
    signature,
  });

  if (isValid) {
    await redis.del(`nonce:${address}`);
  }

  return isValid;
}

// SIWE (Sign-In with Ethereum) message format
export function createSIWEMessage(address: string, nonce: string): string {
  return `Chessty wants you to sign in with your Ethereum account:
${address}

Sign in to Chessty

URI: https://chessty.com
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;
}
```

**Frontend Integration:**
```typescript
// apps/web/src/hooks/useWalletAuth.ts
import { useSignMessage, useAccount } from 'wagmi';
import { useAuthStore } from '@/store/auth';

export function useWalletAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { setUser, setToken } = useAuthStore();

  const signIn = async () => {
    if (!address) throw new Error('Wallet not connected');

    // Get nonce from server
    const { nonce, message } = await fetch('/api/auth/wallet/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }).then(r => r.json());

    // Sign message
    const signature = await signMessageAsync({ message });

    // Verify and get token
    const { user, token } = await fetch('/api/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature, message }),
    }).then(r => r.json());

    setUser(user);
    setToken(token);
  };

  return { signIn };
}
```

#### Phase 3: Consider Auth Provider Migration (Month 2+)

If you decide to migrate to an auth provider like Clerk:

```typescript
// apps/web/src/app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

// apps/web/src/middleware.ts
import { authMiddleware } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/', '/sign-in', '/sign-up'],
});

// Backend: Verify Clerk JWT
import { verifyToken } from '@clerk/backend';

async function verifyClerkToken(token: string) {
  return verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
```

---

## Security Checklist

### Authentication

- [ ] JWT secret from environment (no defaults)
- [ ] JWT expiration (7 days max)
- [ ] Refresh token rotation
- [ ] Rate limiting on login/register
- [ ] Account lockout after failed attempts
- [ ] Password complexity requirements (12+ chars, mixed case, numbers)
- [ ] Email verification required
- [ ] Password reset with expiring tokens
- [ ] Secure password storage (bcrypt 12+ rounds)

### Session Management

- [ ] Session stored server-side
- [ ] Session invalidation on logout
- [ ] Session invalidation on password change
- [ ] Maximum concurrent sessions limit
- [ ] Session timeout for inactive users

### Token Security

- [ ] HTTPS only (no HTTP)
- [ ] Token not in URL (use headers)
- [ ] HttpOnly cookies OR secure localStorage
- [ ] CSRF protection
- [ ] Token rotation on privilege escalation

### Additional Security

- [ ] 2FA for high-balance accounts ($500+)
- [ ] Login notifications
- [ ] Suspicious activity alerts
- [ ] Device fingerprinting
- [ ] IP-based rate limiting

---

## 2FA Implementation Guide

```typescript
// apps/server/src/services/totp.ts
import { createTOTPKeyURI, verifyTOTP } from 'oslo/otp';
import { encodeBase32 } from 'oslo/encoding';

export async function generateTOTPSecret(userId: string): Promise<{
  secret: string;
  uri: string;
  qrCode: string;
}> {
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const base32Secret = encodeBase32(secret);

  const uri = createTOTPKeyURI('Chessty', userId, secret);

  // Generate QR code
  const qrCode = await generateQRCode(uri);

  return { secret: base32Secret, uri, qrCode };
}

export function verifyTOTPCode(secret: string, code: string): boolean {
  return verifyTOTP(decodeBase32(secret), code);
}

// Enable 2FA
export async function enable2FA(userId: string, secret: string, code: string) {
  if (!verifyTOTPCode(secret, code)) {
    throw new Error('Invalid verification code');
  }

  await db.update(users)
    .set({
      twoFactorSecret: encrypt(secret),
      twoFactorEnabled: true,
    })
    .where(eq(users.id, userId));
}

// Login with 2FA
export async function loginWith2FA(userId: string, code: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.twoFactorEnabled) {
    throw new Error('2FA not enabled');
  }

  const secret = decrypt(user.twoFactorSecret!);
  if (!verifyTOTPCode(secret, code)) {
    throw new Error('Invalid 2FA code');
  }

  // Continue with session creation
}
```

---

## Cost Analysis

### Self-Hosted (Current)

| Item | Cost/Month |
|------|------------|
| Development time | $0 (already built) |
| Email service (Resend) | $20 (50K emails) |
| **Total** | **$20/month** |

### Clerk (Recommended)

| Users | Cost/Month |
|-------|------------|
| 0-10K | $0 |
| 10K-50K | $200-1000 |
| 50K-100K | $1000-2000 |

### Auth0

| Users | Cost/Month |
|-------|------------|
| 0-7K | $0 |
| 7K-50K | $21-1150 |
| 50K+ | Custom |

---

## Decision Matrix

| Factor | Self-Hosted | Auth Provider | Wallet-Only |
|--------|-------------|---------------|-------------|
| Initial Cost | Low | Free tier | Low |
| Scale Cost | Low | Medium-High | Low |
| Security Burden | High | Low | Medium |
| Development Time | High | Low | Medium |
| Feature Richness | Build yourself | Included | Limited |
| User Onboarding | Standard | Excellent | Crypto users only |
| Compliance | DIY | Often included | N/A |

---

## Recommendation Summary

### For MVP (Now)

1. **Keep current implementation** but fix security issues
2. Add email verification and password reset
3. Implement rate limiting and account lockout

### For Growth (3-6 months)

1. Add wallet authentication (SIWE) for crypto users
2. Implement 2FA for high-balance accounts
3. Evaluate auth providers based on actual MAU

### For Scale (6+ months)

1. Consider migration to Clerk or Auth0 if:
   - Team lacks security expertise
   - Need social login, magic links
   - Compliance requirements increase
   - Development bandwidth constrained

2. Keep self-hosted if:
   - Strong security team
   - Cost optimization critical
   - Unique auth requirements
   - Data sovereignty concerns
