/**
 * Wallet Authentication Service (SIWE - Sign-In with Ethereum)
 *
 * What is SIWE?
 * SIWE (Sign-In with Ethereum) is a standard way to authenticate users using their
 * Ethereum wallet. Instead of username/password, users sign a message with their
 * private key to prove they control the wallet address.
 *
 * How it works:
 * 1. Backend generates a random nonce (prevents replay attacks)
 * 2. Frontend builds a SIWE message with: address, chain, nonce, domain, timestamp
 * 3. User signs the message with their wallet (MetaMask, Coinbase, etc.)
 * 4. Frontend sends message + signature to backend
 * 5. Backend verifies signature matches the address using viem
 * 6. If valid, create/login user and issue JWT token
 *
 * Why use SIWE?
 * - No passwords to remember or leak
 * - Users control their own keys
 * - Standard used by Polymarket, OpenSea, and other crypto platforms
 * - Wallet = identity (great for a crypto betting platform)
 *
 * Security features:
 * - Nonces expire after 5 minutes (prevents old signatures from being reused)
 * - One-time use nonces (deleted after verification)
 * - Address normalization (prevents 0xABC vs 0xabc exploits)
 * - Rate limiting (uses existing loginLimiter)
 */

import { getAddress, verifyMessage, isAddress } from 'viem';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../drizzle';
import { users, type User } from '../drizzle/pg-schema';
import { generateToken, type LoginContext } from './auth';
import { recordSuccessfulLogin } from './accountLockout';

// ============================================================================
// Types
// ============================================================================

interface NonceEntry {
  createdAt: number;
}

export interface WalletAuthResult {
  user: User;
  token: string;
  isNewUser: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

// Nonce expiry: 5 minutes (shorter than OAuth's 10 minutes for tighter security)
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

// Cleanup interval: Every 2 minutes
const NONCE_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

// ============================================================================
// Nonce Management (CSRF Protection for SIWE)
// ============================================================================

/**
 * In-memory storage for SIWE nonces.
 *
 * Why do we need nonces?
 * Without a nonce, an attacker could capture a valid signature and replay it later.
 * The nonce ensures each signature is unique and can only be used once.
 *
 * Think of it like a one-time password - even if someone steals it, they can't reuse it.
 */
const nonceStore = new Map<string, NonceEntry>();

/**
 * Generate a cryptographically random nonce for SIWE message.
 *
 * The nonce is a UUID (universally unique identifier) generated using
 * the crypto.randomUUID() function, which is cryptographically secure.
 *
 * @returns A unique nonce string
 */
export function generateWalletNonce(): string {
  const nonce = crypto.randomUUID();
  nonceStore.set(nonce, { createdAt: Date.now() });
  return nonce;
}

/**
 * Validate a nonce from a SIWE verification request.
 *
 * This function:
 * 1. Checks if the nonce exists in our store
 * 2. Checks if it hasn't expired (5 minute limit)
 * 3. Deletes the nonce immediately (one-time use)
 *
 * @param nonce - The nonce to validate
 * @returns true if valid, false otherwise
 */
export function validateWalletNonce(nonce: string): boolean {
  const entry = nonceStore.get(nonce);

  if (!entry) {
    // Nonce doesn't exist - either invalid or already used
    return false;
  }

  // Delete immediately (one-time use, prevents replay attacks)
  nonceStore.delete(nonce);

  // Check if expired
  const ageMs = Date.now() - entry.createdAt;
  if (ageMs > NONCE_EXPIRY_MS) {
    return false;
  }

  return true;
}

/**
 * Clean up expired nonces to prevent memory leaks.
 * Called automatically every 2 minutes.
 */
function cleanupExpiredNonces(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [nonce, entry] of nonceStore.entries()) {
    if (now - entry.createdAt > NONCE_EXPIRY_MS) {
      nonceStore.delete(nonce);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[WalletAuth] Cleaned up ${cleanedCount} expired nonces`);
  }
}

// Start the cleanup interval
setInterval(cleanupExpiredNonces, NONCE_CLEANUP_INTERVAL_MS);

// ============================================================================
// SIWE Message Utilities
// ============================================================================

/**
 * Extract the nonce from a SIWE message.
 *
 * SIWE messages follow a standard format (EIP-4361) that includes:
 * - Domain
 * - Address
 * - Statement
 * - URI
 * - Version
 * - Chain ID
 * - Nonce
 * - Issued At
 * - Expiration Time (optional)
 *
 * We look for the "Nonce: <value>" line in the message.
 *
 * @param message - The SIWE message
 * @returns The nonce if found, null otherwise
 */
export function extractNonceFromMessage(message: string): string | null {
  const nonceMatch = message.match(/Nonce: ([a-f0-9-]+)/i);
  return nonceMatch ? nonceMatch[1] : null;
}

/**
 * Extract the address from a SIWE message.
 *
 * The address is on the second line of a SIWE message, right after the domain line.
 *
 * @param message - The SIWE message
 * @returns The address if found, null otherwise
 */
export function extractAddressFromMessage(message: string): string | null {
  // SIWE format: line 1 is domain text, line 2 is the address
  const lines = message.split('\n');
  if (lines.length >= 2) {
    const potentialAddress = lines[1].trim();
    if (isAddress(potentialAddress)) {
      return potentialAddress;
    }
  }
  return null;
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify a SIWE signature matches the claimed address.
 *
 * How signature verification works:
 * 1. The user signed a message with their private key
 * 2. We use the signature to recover the public key/address
 * 3. If the recovered address matches the claimed address, the signature is valid
 *
 * We use viem's verifyMessage function which is:
 * - Battle-tested (used by millions of transactions)
 * - Handles edge cases (EIP-191 prefix, etc.)
 * - Type-safe
 *
 * @param message - The SIWE message that was signed
 * @param signature - The signature from the wallet (hex string starting with 0x)
 * @param address - The wallet address claiming to have signed
 * @returns true if signature is valid, false otherwise
 */
export async function verifySiweSignature(params: {
  message: string;
  signature: `0x${string}`;
  address: string;
}): Promise<boolean> {
  try {
    const { message, signature, address } = params;

    // Validate the address format
    if (!isAddress(address)) {
      console.error('[WalletAuth] Invalid address format:', address);
      return false;
    }

    // Normalize the claimed address (converts to checksum format)
    // This prevents case-sensitivity exploits (0xABC... vs 0xabc...)
    const normalizedAddress = getAddress(address);

    // Verify the signature using viem
    // This recovers the signer's address from the signature and message
    // and compares it to the claimed address
    const isValid = await verifyMessage({
      address: normalizedAddress,
      message,
      signature,
    });

    return isValid;
  } catch (error) {
    console.error('[WalletAuth] Signature verification error:', error);
    return false;
  }
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Find a user by their wallet address.
 *
 * @param address - The wallet address (will be normalized)
 * @returns The user if found, null otherwise
 */
export async function findUserByWallet(address: string): Promise<User | null> {
  if (!isAddress(address)) {
    return null;
  }

  const normalizedAddress = getAddress(address);

  const user = await db.query.users.findFirst({
    where: eq(users.walletAddress, normalizedAddress),
  });

  return user || null;
}

/**
 * Find or create a user by wallet address.
 *
 * This is similar to findOrCreateOAuthUser but for wallet authentication.
 *
 * Flow:
 * 1. Normalize the wallet address (checksum format)
 * 2. Look for existing user with this wallet
 * 3. If found, return existing user
 * 4. If not found, create new user with auto-generated internal username
 * 5. Record successful login for security audit
 * 6. Generate JWT token
 *
 * Note: New wallet users won't have a displayName yet - they'll be redirected
 * to the profile setup page to choose one.
 *
 * @param address - The wallet address (will be normalized)
 * @param context - IP address and user agent for security tracking
 * @returns User, JWT token, and whether this is a new user
 */
export async function findOrCreateWalletUser(
  address: string,
  context?: LoginContext
): Promise<WalletAuthResult> {
  const ipAddress = context?.ipAddress || null;
  const userAgent = context?.userAgent || null;

  // Validate and normalize address
  if (!isAddress(address)) {
    throw new Error('Invalid wallet address');
  }
  const normalizedAddress = getAddress(address);

  // Try to find existing user by wallet address
  let user = await db.query.users.findFirst({
    where: eq(users.walletAddress, normalizedAddress),
  });

  let isNewUser = false;

  if (!user) {
    // User doesn't exist - create new account
    isNewUser = true;

    // Generate a unique internal username
    // Format: wallet_<first 6 chars of address lowercase>
    // This is never shown to users - just for internal database uniqueness
    const baseUsername = `wallet_${normalizedAddress.slice(2, 8).toLowerCase()}`;
    let uniqueUsername = baseUsername;
    let counter = 1;

    // Ensure username is unique (unlikely collision, but safe)
    while (
      await db.query.users.findFirst({
        where: eq(users.username, uniqueUsername),
      })
    ) {
      uniqueUsername = `${baseUsername}${counter}`;
      counter++;
    }

    // Create the user
    const [newUser] = await db
      .insert(users)
      .values({
        id: nanoid(),
        walletAddress: normalizedAddress,
        username: uniqueUsername,
        email: null, // Wallet users don't need email
        passwordHash: null, // Wallet users don't have passwords
        displayName: null, // Must be set during onboarding
      })
      .returning();

    user = newUser;

    console.log(
      `[WalletAuth] Created new wallet user: ${normalizedAddress.slice(0, 10)}... (username: ${uniqueUsername})`
    );
  }

  // Record successful login for security audit
  await recordSuccessfulLogin(user.id, ipAddress, userAgent);

  // Generate JWT token
  const token = await generateToken(user.id, ipAddress, userAgent);

  return { user, token, isNewUser };
}

/**
 * Set the display name for a user.
 *
 * Display names must be unique across all users. This is enforced by the database
 * unique constraint, but we also check here for a better error message.
 *
 * @param userId - The user's ID
 * @param displayName - The desired display name
 * @returns The updated user
 * @throws Error if display name is taken or invalid
 */
export async function setDisplayName(
  userId: string,
  displayName: string
): Promise<User> {
  // Validate display name format
  const trimmed = displayName.trim();

  if (trimmed.length < 3) {
    throw new Error('Display name must be at least 3 characters');
  }

  if (trimmed.length > 20) {
    throw new Error('Display name must be at most 20 characters');
  }

  // Only allow alphanumeric, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error('Display name can only contain letters, numbers, underscores, and hyphens');
  }

  // Check if display name is already taken (case-insensitive to prevent
  // "Player1" and "player1" from coexisting — users expect names to be unique
  // regardless of casing)
  const existing = await db.query.users.findFirst({
    where: sql`LOWER(${users.displayName}) = LOWER(${trimmed})`,
  });

  if (existing && existing.id !== userId) {
    throw new Error('This display name is already taken');
  }

  // Update the user's display name
  const [updatedUser] = await db
    .update(users)
    .set({
      displayName: trimmed,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new Error('User not found');
  }

  console.log(`[WalletAuth] Set display name for user ${userId}: ${trimmed}`);

  return updatedUser;
}

/**
 * Check if a display name is available.
 *
 * @param displayName - The display name to check
 * @returns true if available, false if taken
 */
export async function isDisplayNameAvailable(displayName: string): Promise<boolean> {
  const trimmed = displayName.trim();

  if (trimmed.length < 3 || trimmed.length > 20) {
    return false;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return false;
  }

  const existing = await db.query.users.findFirst({
    where: sql`LOWER(${users.displayName}) = LOWER(${trimmed})`,
  });

  return !existing;
}

/**
 * Link a wallet to an existing user account.
 *
 * This allows users who signed up with email/OAuth to add wallet authentication.
 * The wallet must not already be linked to another account.
 *
 * @param userId - The user's ID
 * @param address - The wallet address to link
 * @returns The updated user
 * @throws Error if wallet is already linked to another account
 */
export async function linkWalletToUser(
  userId: string,
  address: string
): Promise<User> {
  if (!isAddress(address)) {
    throw new Error('Invalid wallet address');
  }

  const normalizedAddress = getAddress(address);

  // Check if this wallet is already linked to another account
  const existingUser = await db.query.users.findFirst({
    where: eq(users.walletAddress, normalizedAddress),
  });

  if (existingUser) {
    if (existingUser.id === userId) {
      throw new Error('This wallet is already linked to your account');
    }
    throw new Error('This wallet is already linked to another account');
  }

  // Link the wallet to the user
  const [updatedUser] = await db
    .update(users)
    .set({
      walletAddress: normalizedAddress,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new Error('User not found');
  }

  console.log(
    `[WalletAuth] Linked wallet ${normalizedAddress.slice(0, 10)}... to user ${userId}`
  );

  return updatedUser;
}
