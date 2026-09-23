/**
 * @novelforge/auth — authentication core (ADR-0002).
 *
 * Session-cookie authentication: opaque 32-byte tokens, stored hashed
 * (SHA-256) server-side; argon2id password hashing. Pure functions plus
 * use-case services over injected store interfaces — no ORM, no HTTP.
 * apps/api composes the Prisma-backed stores (ADR-0001 boundaries).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

// @node-rs/argon2's Algorithm is a const enum (inaccessible under
// verbatimModuleSyntax); Argon2id === 2.
const ARGON2ID = 2;

// --- Tokens (ADR-0002 §2) ---

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of the token; only this is persisted. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Timing-safe equality for token/hash comparisons. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- Passwords (ADR-0002 §3) ---

// OWASP-consistent argon2id parameters; the library records them in the
// hash so future rehash-on-login can detect stale parameters.
const ARGON2_OPTIONS = {
  type: ARGON2ID,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, password);
  } catch {
    return false; // malformed hash never throws out of verify
  }
}

// --- Store interfaces (composition happens in apps/api) ---

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<UserRecord>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionStore {
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  create(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<SessionRecord>;
  revoke(id: string): Promise<void>;
  extend(id: string, expiresAt: Date): Promise<void>;
}

// --- Use-case services (ADR-0002 §4-§5, §7) ---

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days idle

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export class AuthError extends Error {
  readonly code: "EMAIL_TAKEN" | "INVALID_CREDENTIALS" | "INVALID_SESSION";
  constructor(code: AuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface AuthService {
  register(input: RegisterInput): Promise<{ userId: string }>;
  login(email: string, password: string): Promise<{ token: string; expiresAt: Date }>;
  logout(token: string): Promise<void>;
  /**
   * Validate a bearer token; sliding renewal when less than half the
   * remaining lifetime is left (ADR-0002 §4). Returns null for
   * unknown/expired/revoked tokens — callers answer 401 without detail.
   */
  validateSession(token: string): Promise<{ userId: string; expiresAt: Date } | null>;
}

export function createAuthService(deps: {
  users: UserStore;
  sessions: SessionStore;
  now?: () => Date;
}): AuthService {
  const now = deps.now ?? (() => new Date());

  async function register(input: RegisterInput): Promise<{ userId: string }> {
    const email = input.email.trim().toLowerCase();
    const existing = await deps.users.findByEmail(email);
    if (existing) throw new AuthError("EMAIL_TAKEN", "email already registered");
    const passwordHash = await hashPassword(input.password);
    const user = await deps.users.create({
      email,
      passwordHash,
      displayName: input.displayName,
    });
    return { userId: user.id };
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const user = await deps.users.findByEmail(email.trim().toLowerCase());
    // Verify against a dummy hash when the user is missing to keep the
    // response-time profile uniform (no account enumeration via timing).
    const ok = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(DUMMY_HASH, password).then(() => false);
    if (!user || !ok) {
      throw new AuthError("INVALID_CREDENTIALS", "invalid email or password");
    }
    const token = generateSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
    await deps.sessions.create({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async function logout(token: string): Promise<void> {
    const session = await deps.sessions.findByTokenHash(hashSessionToken(token));
    if (session && !session.revokedAt) await deps.sessions.revoke(session.id);
  }

  async function validateSession(
    token: string,
  ): Promise<{ userId: string; expiresAt: Date } | null> {
    const session = await deps.sessions.findByTokenHash(hashSessionToken(token));
    if (!session || session.revokedAt) return null;
    const current = now();
    if (session.expiresAt.getTime() <= current.getTime()) return null;

    // Sliding renewal past the halfway point of remaining lifetime.
    const remaining = session.expiresAt.getTime() - current.getTime();
    let expiresAt = session.expiresAt;
    if (remaining < SESSION_TTL_MS / 2) {
      expiresAt = new Date(current.getTime() + SESSION_TTL_MS);
      await deps.sessions.extend(session.id, expiresAt);
    }
    return { userId: session.userId, expiresAt };
  }

  return { register, login, logout, validateSession };
}

// Precomputed argon2id hash of a random string, used to equalize timing
// on login for unknown emails. Regenerating per call would defeat it.
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$Eag49ekH6sMjHJQ3X9t1UA$tZch/eMrYt6YVuB0dDr50UFVE4Zl9lmi5vE84Eozoq4";
