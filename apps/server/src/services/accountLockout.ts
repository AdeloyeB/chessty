/**
 * Account Lockout Service
 *
 * Protects user accounts from brute force attacks by:
 * 1. Tracking failed login attempts per account
 * 2. Locking accounts after too many failures
 * 3. Auto-unlocking after a cooldown period
 * 4. Logging security events for monitoring
 */

import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, users, securityAuditLog } from '../drizzle';

// Configuration
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const ATTEMPT_RESET_WINDOW_MS = 15 * 60 * 1000; // Reset counter after 15 min of no failures

export type SecurityEventType =
  | 'login_failed'
  | 'login_success'
  | 'account_locked'
  | 'account_unlocked'
  | 'suspicious_activity'
  | 'rate_limited';

interface SecurityEventDetails {
  reason?: string;
  attemptNumber?: number;
  email?: string;
  [key: string]: unknown;
}

/**
 * Log a security event to the audit log
 */
export async function logSecurityEvent(
  eventType: SecurityEventType,
  userId: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  details?: SecurityEventDetails
): Promise<void> {
  try {
    await db.insert(securityAuditLog).values({
      id: nanoid(),
      eventType,
      userId,
      ipAddress,
      userAgent,
      details: details || null,
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw - logging failures shouldn't break authentication
  }
}

/**
 * Check if an account is currently locked
 */
export async function isAccountLocked(userId: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
  remainingMs?: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      lockedUntil: true,
      failedLoginAttempts: true,
    },
  });

  if (!user) {
    return { locked: false };
  }

  if (user.lockedUntil) {
    const now = Date.now();
    const lockedUntilMs = user.lockedUntil.getTime();

    if (lockedUntilMs > now) {
      return {
        locked: true,
        lockedUntil: user.lockedUntil,
        remainingMs: lockedUntilMs - now,
      };
    }

    // Lock expired, clear it
    await db.update(users).set({
      lockedUntil: null,
      failedLoginAttempts: 0,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  return { locked: false };
}

/**
 * Check if an account is locked by email (before we have the user ID)
 */
export async function isAccountLockedByEmail(email: string): Promise<{
  locked: boolean;
  userId?: string;
  lockedUntil?: Date;
  remainingMs?: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: {
      id: true,
      lockedUntil: true,
      failedLoginAttempts: true,
    },
  });

  if (!user) {
    // User doesn't exist - return not locked to avoid user enumeration
    return { locked: false };
  }

  if (user.lockedUntil) {
    const now = Date.now();
    const lockedUntilMs = user.lockedUntil.getTime();

    if (lockedUntilMs > now) {
      return {
        locked: true,
        userId: user.id,
        lockedUntil: user.lockedUntil,
        remainingMs: lockedUntilMs - now,
      };
    }

    // Lock expired, clear it
    await db.update(users).set({
      lockedUntil: null,
      failedLoginAttempts: 0,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
  }

  return { locked: false, userId: user.id };
}

/**
 * Record a failed login attempt
 * Returns whether the account is now locked
 */
export async function recordFailedAttempt(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<{ locked: boolean; attemptsRemaining: number }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      failedLoginAttempts: true,
      lastFailedLoginAt: true,
    },
  });

  if (!user) {
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  const now = new Date();
  let newAttemptCount = user.failedLoginAttempts + 1;

  // Reset counter if last failure was outside the window
  if (user.lastFailedLoginAt) {
    const timeSinceLastFailure = now.getTime() - user.lastFailedLoginAt.getTime();
    if (timeSinceLastFailure > ATTEMPT_RESET_WINDOW_MS) {
      newAttemptCount = 1;
    }
  }

  // Log the failed attempt
  await logSecurityEvent('login_failed', userId, ipAddress, userAgent, {
    attemptNumber: newAttemptCount,
    email: user.email ?? undefined,
  });

  // Check if we should lock the account
  if (newAttemptCount >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);

    await db.update(users).set({
      failedLoginAttempts: newAttemptCount,
      lastFailedLoginAt: now,
      lockedUntil,
      updatedAt: now,
    }).where(eq(users.id, userId));

    // Log account locked event
    await logSecurityEvent('account_locked', userId, ipAddress, userAgent, {
      reason: 'Too many failed login attempts',
      attemptNumber: newAttemptCount,
      lockoutDurationMs: LOCKOUT_DURATION_MS,
    });

    return { locked: true, attemptsRemaining: 0 };
  }

  // Update attempt count
  await db.update(users).set({
    failedLoginAttempts: newAttemptCount,
    lastFailedLoginAt: now,
    updatedAt: now,
  }).where(eq(users.id, userId));

  return {
    locked: false,
    attemptsRemaining: MAX_FAILED_ATTEMPTS - newAttemptCount,
  };
}

/**
 * Record a successful login (resets failed attempt counter)
 */
export async function recordSuccessfulLogin(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  await db.update(users).set({
    failedLoginAttempts: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  await logSecurityEvent('login_success', userId, ipAddress, userAgent);
}

/**
 * Manually unlock an account (for admin use)
 */
export async function unlockAccount(
  userId: string,
  adminUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<boolean> {
  await db.update(users).set({
    failedLoginAttempts: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  await logSecurityEvent('account_unlocked', userId, ipAddress, userAgent, {
    unlockedBy: adminUserId,
    reason: 'Manual unlock by admin',
  });

  return true;
}

/**
 * Get lockout status message
 */
export function getLockoutMessage(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / 60000);
  return `Account is temporarily locked due to too many failed login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
}

/**
 * Get failed attempts warning message
 */
export function getAttemptsWarningMessage(attemptsRemaining: number): string {
  if (attemptsRemaining <= 3) {
    return `Warning: ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout.`;
  }
  return '';
}
