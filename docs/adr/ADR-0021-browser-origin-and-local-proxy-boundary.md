# ADR-0021: Browser origin and local reverse-proxy boundary

Status: Accepted for the author-authorized staging security repair (2026-10-24).

## Evidence and problem

On the actual staging deployment, a simple `text/plain` POST with a sibling-site
Origin invalidated an isolated test account's session. SameSite=Lax is site-scoped
and does not establish the same-origin boundary described by the original proxy
comment. Fastify also saw proxy socket addresses instead of separate client IPs.
The author authorized auditing the dedicated staging server and fixing findings.

## Decision

- Require `PUBLIC_ORIGIN` when loading production configuration. It is one
  HTTP(S) origin without credentials, path, query or fragment. Development and
  tests can opt in; existing development configuration retains its defaults.
- For unsafe methods, reject a supplied foreign, malformed or null Origin.
  Cookie-authenticated writes require the exact configured Origin or, only when
  Origin is absent, a Referer with that origin. Safe reads are unaffected.
  Non-browser callers without a session cookie can omit both headers.
- Configure `TRUST_PROXY=loopback` only for a verified loopback reverse-proxy
  topology. Default trust remains disabled. Never trust all network peers.
  nginx overwrites Host/protocol metadata and appends the actual peer to XFF;
  the API stops traversal at the first untrusted address.
- Make `API_HOST` an optional IP bind. A native proxy deployment sets it to
  `127.0.0.1`; existing container/development defaults remain compatible.
- Bind the web server and private gateway to loopback as well. Do not rely on
  an unverified external firewall as the application's internal boundary.

## Operations and compatibility

Set the origin before restarting production API/worker processes. Cookie-based
CLI mutation requests must send the configured Origin (or valid Referer).
Aliases should redirect to the canonical origin rather than silently broaden the
allowlist. The deployed source/manifest and environment changes must be recorded
separately from a Git commit; no commit or public release is implied by this repair.

Negative tests cover sibling/null/malformed origins, missing cookie-write origin,
forwarded-host spoofing, public sockets spoofing XFF, and per-client rate buckets.
Rollback keeps a private copy of the prior source/configuration; reverting the
security repair must not be mistaken for a passing production gate.
