import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { db, users, sessions, type User } from '../drizzle';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret-change-me');
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';

export interface AuthPayload {
  userId: string;
  sessionId: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function generateToken(userId: string): Promise<string> {
  const sessionId = nanoid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
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
  password: string
): Promise<{ user: User; token: string }> {
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

  const token = await generateToken(user.id);

  return { user, token };
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = await generateToken(user.id);

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
  username: string
): Promise<{ user: User; token: string }> {
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

  const token = await generateToken(user.id);

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
