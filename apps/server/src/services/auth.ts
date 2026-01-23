import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { db, users, sessions, type User } from '../drizzle';
import {
  isAccountLockedByEmail,
  recordFailedAttempt,
  recordSuccessfulLogin,
  getLockoutMessage,
  getAttemptsWarningMessage,
} from './accountLockout';

// Validate JWT secret at startup
const JWT_SECRET_RAW = Bun.env.JWT_SECRET;
const isDevelopment = Bun.env.NODE_ENV !== 'production';

if (!JWT_SECRET_RAW) {
  if (isDevelopment) {
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using development fallback. DO NOT use in production!');
  } else {
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    process.exit(1);
  }
}

if (JWT_SECRET_RAW && JWT_SECRET_RAW.length < 32) {
  if (isDevelopment) {
    console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters for security');
  } else {
    console.error('FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
}

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || 'dev-only-secret-not-for-production');
const TOKEN_EXPIRY = '7d';

export interface AuthPayload {
  userId: string;
  sessionId: string;
}

export async function hashPassword(password: string): Promise<string> {
  // Using Bun's built-in password hashing (Argon2id by default, more secure than bcrypt)
  return Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 65536, // 64 MB
    timeCost: 2,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Bun.password.verify auto-detects the algorithm from the hash
  // This means it can verify both old bcrypt hashes and new argon2id hashes
  return Bun.password.verify(password, hash);
}

export async function generateToken(
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<string> {
  const sessionId = nanoid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });

  const token = await new SignJWT({ userId, sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const { userId, sessionId } = payload as unknown as AuthPayload;

    // Verify session exists and is not expired
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return { userId, sessionId };
  } catch {
    return null;
  }
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function register(
  email: string,
  username: string,
  password: string,
  context?: LoginContext
): Promise<{ user: User; token: string }> {
  const ipAddress = context?.ipAddress || null;
  const userAgent = context?.userAgent || null;

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  const existingUsername = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (existingUsername) {
    throw new Error('Username already taken');
  }

  const passwordHash = await hashPassword(password);
  const userId = nanoid();

  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      username,
      passwordHash,
    })
    .returning();

  const token = await generateToken(user.id, ipAddress, userAgent);

  return { user, token };
}

export interface LoginResult {
  user: User;
  token: string;
  warning?: string;
}

export interface LoginContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function login(
  email: string,
  password: string,
  context?: LoginContext
): Promise<LoginResult> {
  const ipAddress = context?.ipAddress || null;
  const userAgent = context?.userAgent || null;

  // Check if account is locked before proceeding
  const lockStatus = await isAccountLockedByEmail(email);
  if (lockStatus.locked && lockStatus.remainingMs) {
    throw new Error(getLockoutMessage(lockStatus.remainingMs));
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    // If user exists but we got here, record the failed attempt
    if (lockStatus.userId) {
      await recordFailedAttempt(lockStatus.userId, ipAddress, userAgent);
    }
    throw new Error('Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    // Record failed attempt
    const { locked, attemptsRemaining } = await recordFailedAttempt(user.id, ipAddress, userAgent);

    if (locked) {
      throw new Error(getLockoutMessage(30 * 60 * 1000)); // 30 minutes
    }

    // Include warning in error if close to lockout
    const warning = getAttemptsWarningMessage(attemptsRemaining);
    throw new Error(warning ? `Invalid credentials. ${warning}` : 'Invalid credentials');
  }

  // Successful login - reset failed attempts
  await recordSuccessfulLogin(user.id, ipAddress, userAgent);

  const token = await generateToken(user.id, ipAddress, userAgent);

  return { user, token };
}

export async function getUserById(userId: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  return user || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  return user || null;
}

export async function findOrCreateOAuthUser(
  provider: 'google' | 'github',
  providerId: string,
  email: string,
  username: string,
  context?: LoginContext
): Promise<{ user: User; token: string }> {
  const ipAddress = context?.ipAddress || null;
  const userAgent = context?.userAgent || null;
  const providerIdColumn = provider === 'google' ? users.googleId : users.githubId;

  // Try to find by provider ID
  let user = await db.query.users.findFirst({
    where: eq(providerIdColumn, providerId),
  });

  if (!user) {
    // Try to find by email
    user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user) {
      // Link existing account to OAuth provider
      await db
        .update(users)
        .set({ [provider === 'google' ? 'googleId' : 'githubId']: providerId })
        .where(eq(users.id, user.id));
    } else {
      // Create new user
      let uniqueUsername = username;
      let counter = 1;

      // Ensure unique username
      while (await db.query.users.findFirst({ where: eq(users.username, uniqueUsername) })) {
        uniqueUsername = `${username}${counter}`;
        counter++;
      }

      const [newUser] = await db
        .insert(users)
        .values({
          id: nanoid(),
          email,
          username: uniqueUsername,
          [provider === 'google' ? 'googleId' : 'githubId']: providerId,
        })
        .returning();

      user = newUser;
    }
  }

  // Record successful OAuth login
  await recordSuccessfulLogin(user.id, ipAddress, userAgent);

  const token = await generateToken(user.id, ipAddress, userAgent);

  return { user, token };
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash' | 'googleId' | 'githubId'> {
  const { passwordHash, googleId, githubId, ...sanitized } = user;
  return sanitized;
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    eloRating: user.eloRating,
    peakEloRating: user.peakEloRating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesLost: user.gamesLost,
    gamesDraw: user.gamesDraw,
  };
}
