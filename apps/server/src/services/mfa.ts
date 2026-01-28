/**
 * MFA (Multi-Factor Authentication) Service
 *
 * This service handles TOTP (Time-based One-Time Password) two-factor authentication.
 *
 * TOTP works by:
 * 1. Generating a secret key shared between server and user's authenticator app
 * 2. Both parties generate 6-digit codes based on: secret + current time (30-second windows)
 * 3. Codes match because they use the same secret and roughly the same time
 *
 * Security measures:
 * - TOTP secrets are encrypted at rest using AES-256-GCM
 * - Backup codes are hashed with Argon2id (same as passwords)
 * - All comparisons use timing-safe functions to prevent timing attacks
 */

import { eq, and, lt } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { db, mfaEnrollments, mfaTotpUsage } from '../drizzle';

// ============================================================================
// Configuration
// ============================================================================

const TOTP_ISSUER = 'ChessGame';
const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // seconds
const TOTP_WINDOW = 1; // Allow codes from +-1 time period (handles clock drift)

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8; // 4 chars + dash + 4 chars = "A8F3-2B9C"

// ============================================================================
// Environment Validation
// ============================================================================

const MFA_ENCRYPTION_KEY_RAW = Bun.env.MFA_ENCRYPTION_KEY;
const isDevelopment = Bun.env.NODE_ENV !== 'production';

if (!MFA_ENCRYPTION_KEY_RAW) {
  if (isDevelopment) {
    console.warn('WARNING: MFA_ENCRYPTION_KEY not set. Using development fallback. DO NOT use in production!');
  } else {
    console.error('FATAL: MFA_ENCRYPTION_KEY environment variable is required in production');
    process.exit(1);
  }
}

// The key must be 32 bytes (256 bits) for AES-256
// In production, this should be a 64-character hex string (32 bytes when decoded)
const MFA_ENCRYPTION_KEY = MFA_ENCRYPTION_KEY_RAW
  ? hexToBytes(MFA_ENCRYPTION_KEY_RAW)
  : hexToBytes('0'.repeat(64)); // Development fallback - 32 zero bytes

if (MFA_ENCRYPTION_KEY.length !== 32) {
  if (isDevelopment) {
    console.warn('WARNING: MFA_ENCRYPTION_KEY should be 64 hex characters (32 bytes)');
  } else {
    console.error('FATAL: MFA_ENCRYPTION_KEY must be exactly 64 hex characters');
    process.exit(1);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a hex string to a Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate cryptographically secure random bytes
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Timing-safe string comparison to prevent timing attacks
 *
 * Timing attacks work by measuring how long a comparison takes.
 * Normal string comparison (===) stops at the first mismatch,
 * so "wrong" vs "correct" might fail faster than "correc" vs "correct".
 * An attacker can use this timing difference to guess characters one by one.
 *
 * This function compares all characters regardless of where they differ.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time even for length mismatch
    // We still need to do some work to prevent length-based timing attacks
    const dummy = new TextEncoder().encode(a);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }

  const bufferA = new TextEncoder().encode(a);
  const bufferB = new TextEncoder().encode(b);

  return crypto.timingSafeEqual(bufferA, bufferB);
}

// ============================================================================
// TOTP Secret Generation & Verification
// ============================================================================

export interface TOTPGenerationResult {
  /** The raw secret (base32 encoded) - store this encrypted in the database */
  secret: string;
  /** The otpauth:// URI for QR code generation */
  uri: string;
}

/**
 * Generate a new TOTP secret for a user
 *
 * @param email - User's email address (shown in authenticator apps as the account name)
 * @returns Object with the secret and a URI for generating QR codes
 */
export function generateTOTPSecret(email: string): TOTPGenerationResult {
  // Generate a random secret (20 bytes = 160 bits, standard for TOTP)
  const secretBytes = randomBytes(20);

  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    // Create secret from the random bytes buffer
    secret: new OTPAuth.Secret({ buffer: secretBytes.buffer }),
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP code against a secret
 *
 * @param secret - The base32-encoded secret
 * @param code - The 6-digit code entered by the user
 * @returns true if the code is valid (within the time window)
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  // Remove any spaces or dashes the user might have entered
  const cleanCode = code.replace(/[\s-]/g, '');

  // Validate code format
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Generate the expected code for the current time window
  const expectedCode = totp.generate();

  // First check the current time window with timing-safe comparison
  if (timingSafeEqual(cleanCode, expectedCode)) {
    return true;
  }

  // Check adjacent time windows to handle clock drift
  // This is important because the user's phone clock might be slightly off
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    if (offset === 0) continue; // Already checked

    const timestamp = Date.now() + offset * TOTP_PERIOD * 1000;
    const windowCode = totp.generate({ timestamp });

    if (timingSafeEqual(cleanCode, windowCode)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Backup Codes
// ============================================================================

/**
 * Generate a single backup code
 *
 * Format: "A8F3-2B9C" (8 uppercase alphanumeric with dash in middle)
 */
function generateSingleBackupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let code = '';

  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    // Use modulo to map random byte to character index
    code += chars[bytes[i] % chars.length];
    // Add dash after 4th character
    if (i === 3) {
      code += '-';
    }
  }

  return code;
}

/**
 * Generate a set of backup codes
 *
 * @returns Array of plaintext backup codes to show the user ONCE
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(generateSingleBackupCode());
  }
  return codes;
}

/**
 * Hash all backup codes for storage
 *
 * @param codes - Array of plaintext codes
 * @returns Array of Argon2id hashes
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashes = await Promise.all(
    codes.map((code) =>
      Bun.password.hash(code, {
        algorithm: 'argon2id',
        memoryCost: 65536,
        timeCost: 2,
      })
    )
  );
  return hashes;
}

/**
 * Verify a backup code against stored hashes
 *
 * @param hashedCodes - Array of stored Argon2id hashes
 * @param inputCode - The code entered by the user
 * @returns Index of the matching code, or -1 if no match
 */
export async function verifyBackupCode(hashedCodes: string[], inputCode: string): Promise<number> {
  // Normalize the input code (remove dashes/spaces, uppercase)
  const cleanCode = inputCode.replace(/[\s-]/g, '').toUpperCase();

  // Re-add the dash in the expected position for comparison
  const normalizedCode = cleanCode.length === 8 ? `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}` : cleanCode;

  // Check against all hashes
  // We check ALL codes even after finding a match to prevent timing attacks
  let matchIndex = -1;
  const results = await Promise.all(hashedCodes.map((hash) => Bun.password.verify(normalizedCode, hash)));

  for (let i = 0; i < results.length; i++) {
    if (results[i]) {
      matchIndex = i;
    }
  }

  return matchIndex;
}

// ============================================================================
// Secret Encryption (AES-256-GCM)
// ============================================================================

/**
 * Encrypt a TOTP secret for database storage
 *
 * Uses AES-256-GCM which provides:
 * - Confidentiality (encryption)
 * - Integrity (authentication tag ensures data wasn't tampered with)
 *
 * @param secret - The plaintext TOTP secret
 * @returns Encrypted string in format "iv:authTag:ciphertext" (all hex)
 */
export async function encryptSecret(secret: string): Promise<string> {
  // Generate a random 12-byte IV (Initialization Vector)
  // The IV ensures the same plaintext produces different ciphertext each time
  const iv = randomBytes(12);

  // Import the key for use with Web Crypto API
  // Cast to ArrayBuffer to satisfy TypeScript's strict typing
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    MFA_ENCRYPTION_KEY.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Encrypt the secret
  const encoded = new TextEncoder().encode(secret);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, cryptoKey, encoded);

  // The encrypted result includes both ciphertext and auth tag
  // AES-GCM appends a 16-byte auth tag to the ciphertext
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, -16);
  const authTag = encryptedBytes.slice(-16);

  // Return as "iv:authTag:ciphertext" format
  return `${bytesToHex(iv)}:${bytesToHex(authTag)}:${bytesToHex(ciphertext)}`;
}

/**
 * Decrypt a TOTP secret from database storage
 *
 * @param encrypted - Encrypted string in format "iv:authTag:ciphertext"
 * @returns The plaintext TOTP secret
 */
export async function decryptSecret(encrypted: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = hexToBytes(ivHex);
  const authTag = hexToBytes(authTagHex);
  const ciphertext = hexToBytes(ciphertextHex);

  // Combine ciphertext and auth tag (AES-GCM expects them together)
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  // Import the key
  // Cast to ArrayBuffer to satisfy TypeScript's strict typing
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    MFA_ENCRYPTION_KEY.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    cryptoKey,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

// ============================================================================
// Database Operations
// ============================================================================

export interface MFAEnrollmentResult {
  /** The TOTP URI for QR code generation - show this to the user */
  uri: string;
  /** Whether enrollment was started (false if already enrolled) */
  started: boolean;
}

/**
 * Start MFA enrollment for a user
 *
 * This generates a TOTP secret and stores it (encrypted) in the database,
 * but does NOT enable MFA yet. The user must verify the code first.
 *
 * @param userId - The user's ID
 * @param email - The user's email (shown in authenticator apps)
 * @returns The TOTP URI for QR code generation
 */
export async function startEnrollment(userId: string, email: string): Promise<MFAEnrollmentResult> {
  // Check if already enrolled
  const existing = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  if (existing?.enabled) {
    return { uri: '', started: false };
  }

  // Generate new TOTP secret
  const { secret, uri } = generateTOTPSecret(email);

  // Encrypt the secret for storage
  const encryptedSecret = await encryptSecret(secret);

  // Store or update the enrollment record
  if (existing) {
    // User started enrollment but didn't complete - allow restart
    await db
      .update(mfaEnrollments)
      .set({
        totpSecret: encryptedSecret,
        enabled: false,
        enrolledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(mfaEnrollments.userId, userId));
  } else {
    // New enrollment
    await db.insert(mfaEnrollments).values({
      userId,
      totpSecret: encryptedSecret,
      backupCodes: JSON.stringify([]), // Will be generated on completion
      enabled: false,
    });
  }

  return { uri, started: true };
}

export interface MFACompletionResult {
  /** Whether enrollment was successfully completed */
  success: boolean;
  /** Backup codes to show the user (only on success) */
  backupCodes?: string[];
  /** Error message (only on failure) */
  error?: string;
}

/**
 * Complete MFA enrollment by verifying the user can generate valid codes
 *
 * @param userId - The user's ID
 * @param code - The 6-digit code from the user's authenticator app
 * @returns Result with backup codes on success
 */
export async function completeEnrollment(userId: string, code: string): Promise<MFACompletionResult> {
  // Get the pending enrollment
  const enrollment = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  if (!enrollment) {
    return { success: false, error: 'MFA enrollment not started' };
  }

  if (enrollment.enabled) {
    return { success: false, error: 'MFA already enabled' };
  }

  // Decrypt the secret and verify the code
  const secret = await decryptSecret(enrollment.totpSecret);
  const isValid = verifyTOTPCode(secret, code);

  if (!isValid) {
    return { success: false, error: 'Invalid verification code' };
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  // Enable MFA
  await db
    .update(mfaEnrollments)
    .set({
      enabled: true,
      backupCodes: JSON.stringify(hashedCodes),
      enrolledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mfaEnrollments.userId, userId));

  return { success: true, backupCodes };
}

export interface MFAStatus {
  /** Whether MFA is enabled for this user */
  enabled: boolean;
  /** Number of unused backup codes remaining */
  backupCodesRemaining: number;
}

/**
 * Get the MFA status for a user
 *
 * @param userId - The user's ID
 * @returns MFA status including whether enabled and backup codes remaining
 */
export async function getMFAStatus(userId: string): Promise<MFAStatus> {
  const enrollment = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  if (!enrollment || !enrollment.enabled) {
    return { enabled: false, backupCodesRemaining: 0 };
  }

  const hashedCodes: string[] = JSON.parse(enrollment.backupCodes);

  return {
    enabled: true,
    backupCodesRemaining: hashedCodes.length,
  };
}

/**
 * Disable MFA for a user
 *
 * @param userId - The user's ID
 * @returns true if MFA was disabled, false if it wasn't enabled
 */
export async function disableMFA(userId: string): Promise<boolean> {
  const result = await db.delete(mfaEnrollments).where(eq(mfaEnrollments.userId, userId)).returning();

  return result.length > 0;
}

/**
 * Regenerate backup codes for a user
 *
 * Use this when a user has used most of their backup codes or lost access to them.
 *
 * @param userId - The user's ID
 * @returns New backup codes to show the user, or null if MFA not enabled
 */
export async function regenerateBackupCodes(userId: string): Promise<string[] | null> {
  const enrollment = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  if (!enrollment || !enrollment.enabled) {
    return null;
  }

  // Generate new codes
  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  // Update database
  await db
    .update(mfaEnrollments)
    .set({
      backupCodes: JSON.stringify(hashedCodes),
      updatedAt: new Date(),
    })
    .where(eq(mfaEnrollments.userId, userId));

  return backupCodes;
}

// ============================================================================
// Authentication Helpers (for use in auth flow)
// ============================================================================

export interface MFAVerificationResult {
  /** Whether verification was successful */
  success: boolean;
  /** Whether a backup code was used (user should generate new codes if running low) */
  usedBackupCode: boolean;
  /** Error message on failure */
  error?: string;
}

/**
 * Hash a TOTP code for storage in the replay prevention table.
 * Uses SHA-256 so we never store the plaintext code.
 */
async function hashTOTPCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * C8 FIX: Check if a TOTP code has already been used (replay prevention).
 * Returns true if the code was already used within the recent window.
 */
async function isTOTPCodeUsed(userId: string, code: string): Promise<boolean> {
  const codeHash = await hashTOTPCode(userId, code);

  const existing = await db.query.mfaTotpUsage.findFirst({
    where: and(
      eq(mfaTotpUsage.userId, userId),
      eq(mfaTotpUsage.codeHash, codeHash)
    ),
  });

  return !!existing;
}

/**
 * C8 FIX: Record a TOTP code as used to prevent replay.
 */
async function recordTOTPCodeUsage(userId: string, code: string): Promise<void> {
  const codeHash = await hashTOTPCode(userId, code);

  await db.insert(mfaTotpUsage).values({
    id: crypto.randomUUID(),
    userId,
    codeHash,
    usedAt: new Date(),
  }).onConflictDoNothing(); // Ignore if somehow already recorded
}

/**
 * C8 FIX: Clean up expired TOTP usage records.
 * Call this periodically (e.g. every hour) to prevent the table from growing unbounded.
 * Records older than 2 minutes are safe to delete (TOTP window is ~90 seconds).
 */
export async function cleanupExpiredTOTPUsage(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const deleted = await db
    .delete(mfaTotpUsage)
    .where(lt(mfaTotpUsage.usedAt, cutoff))
    .returning();
  return deleted.length;
}

/**
 * Verify MFA during login
 *
 * This should be called after password verification but before issuing a session token.
 * Accepts either a TOTP code or a backup code.
 *
 * C7 FIX: Backup code removal uses optimistic locking via updatedAt.
 * C8 FIX: TOTP codes are tracked to prevent replay attacks.
 *
 * @param userId - The user's ID
 * @param code - The code entered by the user (TOTP or backup)
 * @returns Verification result
 */
export async function verifyMFA(userId: string, code: string): Promise<MFAVerificationResult> {
  const enrollment = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  if (!enrollment || !enrollment.enabled) {
    return { success: false, usedBackupCode: false, error: 'MFA not enabled' };
  }

  // Try TOTP first
  const secret = await decryptSecret(enrollment.totpSecret);
  const totpValid = verifyTOTPCode(secret, code);

  if (totpValid) {
    // C8 FIX: Check if this exact code was already used (replay prevention)
    const alreadyUsed = await isTOTPCodeUsed(userId, code);
    if (alreadyUsed) {
      return { success: false, usedBackupCode: false, error: 'Code already used. Please wait for a new code.' };
    }

    // C8 FIX: Record this code as used
    await recordTOTPCodeUsage(userId, code);

    // Update last used timestamp
    await db
      .update(mfaEnrollments)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(mfaEnrollments.userId, userId));

    return { success: true, usedBackupCode: false };
  }

  // Try backup code
  const hashedCodes: string[] = JSON.parse(enrollment.backupCodes);
  const matchIndex = await verifyBackupCode(hashedCodes, code);

  if (matchIndex >= 0) {
    // C7 FIX: Atomic backup code removal with optimistic locking.
    // We use the enrollment's updatedAt as a version — if another request
    // modified the row between our read and write, the UPDATE matches zero rows.
    const previousUpdatedAt = enrollment.updatedAt;
    hashedCodes.splice(matchIndex, 1);

    const updated = await db
      .update(mfaEnrollments)
      .set({
        backupCodes: JSON.stringify(hashedCodes),
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mfaEnrollments.userId, userId),
          eq(mfaEnrollments.updatedAt, previousUpdatedAt)
        )
      )
      .returning();

    if (updated.length === 0) {
      // Another request modified the enrollment concurrently — retry
      return verifyMFA(userId, code);
    }

    return { success: true, usedBackupCode: true };
  }

  return { success: false, usedBackupCode: false, error: 'Invalid code' };
}

/**
 * Check if a user has MFA enabled
 *
 * @param userId - The user's ID
 * @returns true if MFA is enabled
 */
export async function hasMFAEnabled(userId: string): Promise<boolean> {
  const enrollment = await db.query.mfaEnrollments.findFirst({
    where: eq(mfaEnrollments.userId, userId),
  });

  return enrollment?.enabled ?? false;
}
