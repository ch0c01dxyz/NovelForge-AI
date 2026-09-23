# ADR-0002: Authentication Architecture

Status: Accepted
Date: 2026-09-24

## Context

Phase 1 requires user authentication for the platform (CLAUDE.md §13:
server-side authorization; docs/09-security/SECURITY.md: CSRF/session
protections according to the chosen auth strategy). The system is a
server-rendered-first Nuxt web app talking to a Fastify API on the same
origin in development, with long-lived writer sessions.

## Decision

1. **Session cookies, not JWTs.** Sessions are opaque server-side
   records; the cookie carries only a random token. This gives
   immediate revocation (membership changes, logout, compromise) which
   matters on a writing platform where workspace access changes, and
   avoids JWT invalidation/refresh complexity. Stateless JWT is
   explicitly rejected for interactive sessions.
2. **Tokens**: 32 random bytes (`crypto.randomBytes`), base64url. Only
   the SHA-256 hash (`tokenHash`) is stored in `sessions`; plaintext
   never touches the database or logs. Token comparison is by unique
   index lookup on the hash plus `timingSafeEqual` where values are
   compared directly.
3. **Password hashing**: argon2id via the `argon2` package —
   `memoryCost` 64 MiB, `timeCost` 3, `parallelism` 1 (OWASP-consistent
   starting point; parameters recorded with the hash by the library so
   future rehash-on-login is possible).
4. **Session lifetime**: 30 days idle expiry with sliding renewal —
   `expiresAt` is extended on validated use when less than half the
   remaining lifetime is left. Absolute cap: none in Phase 1 (sessions
   expire by idleness); revocation covers compromise.
5. **Revocation**: logout sets `revokedAt`; session validation rejects
   revoked or expired rows. Role/membership changes should revoke the
   user's sessions for that workspace in Phase 1 scope only where
   cheap (full session-versioning deferred).
6. **Cookie**: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when
   `NODE_ENV=production`. **CSRF**: SameSite=Lax blocks cross-site
   POSTs from other origins; state-changing endpoints additionally
   require the `X-Requested-With: fetch` header OR a double-submit
   CSRF token is deferred until a cross-origin client exists. This is
   recorded as a deliberate simplification.
7. **Boundary**: `packages/auth` exposes pure functions
   (hash/verify/token issue) plus use-case services
   (`registerUser`, `login`, `logout`, `validateSession`) that take a
   `SessionStore`/`UserStore` interface. The Prisma-backed store lives
   in the composition layer (apps/api) using `@novelforge/database`.
   Unit tests are hermetic; integration tests run against
   `novelforge_test`.

## Alternatives considered

- **JWT (access+refresh)**: rejected — revocation and session listing
  require server-side state anyway; double bookkeeping.
- ** Lucia/Auth.js libraries**: rejected for Phase 1 — small surface
  needed (register/login/logout/validate), and owning the session
  table keeps tenant auditing straightforward. Revisit if SSO/OAuth
  providers are added.
- **bcrypt/scrypt**: argon2id is the current OWASP first choice.

## Consequences

- Every authenticated request costs one indexed `sessions` lookup.
- Logout and access removal take effect immediately (revocation).
- `sessions.token_hash` leak does not allow session use (hash-only
  storage); DB leak still requires password-hash cracking (argon2id).
- The CSRF posture (SameSite=Lax + same-origin) must be revisited
  before any cross-origin browser client is introduced.
