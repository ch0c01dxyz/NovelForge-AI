import { describe, expect, it } from "vitest";
import {
  AuthError,
  createAuthService,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  SESSION_TTL_MS,
  verifyPassword,
  type SessionRecord,
  type SessionStore,
  type UserRecord,
  type UserStore,
} from "./index.ts";

// --- In-memory stores (hermetic; no DB) ---

function memoryUserStore(): UserStore & { rows: Map<string, UserRecord> } {
  const rows = new Map<string, UserRecord>();
  let n = 0;
  return {
    rows,
    async findByEmail(email) {
      for (const u of rows.values()) if (u.email === email) return u;
      return null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async create({ email, passwordHash, displayName }) {
      const id = `user-${++n}`;
      const rec: UserRecord & { displayName: string } = { id, email, passwordHash, displayName };
      rows.set(id, rec);
      return rec;
    },
  };
}

function memorySessionStore(): SessionStore & { rows: Map<string, SessionRecord & { tokenHash: string }> } {
  const rows = new Map<string, SessionRecord & { tokenHash: string }>();
  let n = 0;
  return {
    rows,
    async findByTokenHash(tokenHash) {
      for (const s of rows.values()) if (s.tokenHash === tokenHash) return s;
      return null;
    },
    async create({ tokenHash, userId, expiresAt }) {
      const id = `sess-${++n}`;
      const rec = { id, tokenHash, userId, expiresAt, revokedAt: null };
      rows.set(id, rec);
      return rec;
    },
    async revoke(id) {
      const s = rows.get(id);
      if (s) s.revokedAt = new Date();
    },
    async extend(id, expiresAt) {
      const s = rows.get(id);
      if (s) s.expiresAt = expiresAt;
    },
  };
}

// --- Token / password primitives ---

describe("tokens", () => {
  it("generates 32-byte base64url tokens, unique", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    // 32 bytes -> 43 base64url chars (no padding)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashSessionToken is a stable sha256 hex, not the plaintext", () => {
    const t = generateSessionToken();
    const h1 = hashSessionToken(t);
    const h2 = hashSessionToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(t);
  });

  it("register maps unique-constraint races (P2002) to EMAIL_TAKEN", async () => {
    const users = memoryUserStore();
    const failing = {
      ...users,
      async create() {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      },
    };
    const auth = createAuthService({ users: failing, sessions: memorySessionStore() });
    await expect(
      auth.register({ email: "dup@example.com", password: "password1", displayName: "D" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies; wrong password fails", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  }, 20_000);

  it("verifyPassword returns false on a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-real-hash", "x")).toBe(false);
  });
});

// --- Use-case service ---

describe("authService.register", () => {
  it("creates a user with a hashed password and lowercased email", async () => {
    const users = memoryUserStore();
    const svc = createAuthService({ users, sessions: memorySessionStore() });
    const { userId } = await svc.register({
      email: "  u@example.com ",
      password: "pw123456",
      displayName: "Ann",
    });
    const stored = await users.findById(userId);
    expect(stored?.email).toBe("u@example.com");
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain("pw123456");
  }, 20_000);

  it("rejects a duplicate email with EMAIL_TAKEN", async () => {
    const svc = createAuthService({ users: memoryUserStore(), sessions: memorySessionStore() });
    await svc.register({ email: "u@example.com", password: "pw123456", displayName: "A" });
    await expect(
      svc.register({ email: "u@example.com", password: "pw654321", displayName: "B" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  }, 20_000);
});

describe("authService.login/validate/logout", () => {
  it("issues a token whose hash is stored (never the plaintext)", async () => {
    const sessions = memorySessionStore();
    const svc = createAuthService({ users: memoryUserStore(), sessions });
    await svc.register({ email: "u@example.com", password: "pw123456", displayName: "U" });
    const { token, expiresAt } = await svc.login("u@example.com", "pw123456");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const stored = [...sessions.rows.values()][0]!;
    expect(stored.tokenHash).toBe(hashSessionToken(token));
    expect(stored.tokenHash).not.toBe(token);
  }, 20_000);

  it("rejects wrong password and unknown email with INVALID_CREDENTIALS", async () => {
    const svc = createAuthService({ users: memoryUserStore(), sessions: memorySessionStore() });
    await svc.register({ email: "u@example.com", password: "pw123456", displayName: "U" });
    await expect(svc.login("u@example.com", "nope")).rejects.toBeInstanceOf(AuthError);
    await expect(svc.login("nobody@example.com", "pw123456")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  }, 20_000);

  it("validateSession returns the user for a live token", async () => {
    const svc = createAuthService({ users: memoryUserStore(), sessions: memorySessionStore() });
    const { userId } = await svc.register({ email: "u@example.com", password: "pw123456", displayName: "U" });
    const { token } = await svc.login("u@example.com", "pw123456");
    const session = await svc.validateSession(token);
    expect(session?.userId).toBe(userId);
  }, 20_000);

  it("validateSession returns null for unknown/revoked/expired tokens", async () => {
    const users = memoryUserStore();
    const sessions = memorySessionStore();
    let now = Date.now();
    const svc = createAuthService({ users, sessions, now: () => new Date(now) });
    await svc.register({ email: "u@example.com", password: "pw123456", displayName: "U" });
    const { token } = await svc.login("u@example.com", "pw123456");

    expect(await svc.validateSession("bogus-token")).toBeNull();

    await svc.logout(token);
    expect(await svc.validateSession(token)).toBeNull();

    // Re-login then expire by advancing the clock past TTL.
    const t2 = (await svc.login("u@example.com", "pw123456")).token;
    expect(await svc.validateSession(t2)).not.toBeNull();
    now += SESSION_TTL_MS + 1000;
    expect(await svc.validateSession(t2)).toBeNull();
  }, 20_000);

  it("sliding-renews a session past the halfway point of remaining lifetime", async () => {
    const sessions = memorySessionStore();
    let now = Date.now();
    const svc = createAuthService({ users: memoryUserStore(), sessions, now: () => new Date(now) });
    await svc.register({ email: "u@example.com", password: "pw123456", displayName: "U" });
    const { token } = await svc.login("u@example.com", "pw123456");
    const before = [...sessions.rows.values()][0]!.expiresAt.getTime();

    // Advance to just over half the TTL remaining consumed -> should renew.
    now += SESSION_TTL_MS / 2 + 1000;
    const result = await svc.validateSession(token);
    const after = [...sessions.rows.values()][0]!.expiresAt.getTime();
    expect(result).not.toBeNull();
    expect(after).toBeGreaterThan(before);
  }, 20_000);
});
