# ADR-0004: Authorization — Capability-Based RBAC

Status: Accepted
Date: 2026-09-24

## Context

CLAUDE.md §13 requires granular permissions rather than scattered
`if (user.role === "ADMIN")` checks, workspace- and novel-level
ownership enforcement, and server-side-only authorization. Phase 1
introduces workspaces, memberships, and novels; later phases add story
domains that must reuse the same enforcement pattern.

## Decision

1. **Capabilities, not roles, at enforcement points.** A fixed
   capability vocabulary (`workspace:update`, `member:invite`,
   `member:change-role`, `member:remove`, `novel:create`,
   `novel:read`, `novel:update`, `novel:delete`, `novel:archive`, …)
   lives in `@novelforge/auth/authorization`. Services call
   `requireCapability(role, capability)`; they never compare role
   strings inline.
2. **Roles map to capability sets** (OWNER ⊃ ADMIN ⊃ AUTHOR ⊃ EDITOR ⊃
   VIEWER, per CLAUDE.md role list minus platform-level SUPER_ADMIN,
   which arrives with admin tooling). The mapping is data
   (`ROLE_CAPABILITIES`), unit-testable, and the single place role
   semantics change.
3. **Membership is the tenant gate.** Every workspace-scoped operation
   first resolves the actor's membership row server-side. A missing
   membership answers **404**, not 403, so foreign workspace/novel
   existence is not leaked (SECURITY.md: data access boundaries).
4. **Ownership invariants are service rules**, not schema checks:
   - granting OWNER requires the actor to be OWNER;
   - non-OWNERs cannot demote/remove an OWNER;
   - the last OWNER cannot be demoted or removed.
5. **Audit foundation**: sensitive mutations (workspace created,
   member added/removed/role changed, novel created) append immutable
   `audit_logs` rows via an AuditService (create/read only —
   ADR-0003 §6). Payloads never contain secrets (CLAUDE.md §22).
6. **Layering** (API-BOUNDARIES.md): routes authenticate (session) and
   validate (Zod), then delegate to application services
   (`createPlatformServices`) which own use cases, transactions, and
   capability enforcement. Domain rules stay out of controllers; the
   capability module is pure and ORM-free.

## Alternatives considered

- **Role checks inline in routes**: rejected — the exact pattern
  CLAUDE.md §13 forbids; scatters policy, untestable in isolation.
- **External authorization service (OPA/Cerbos)**: overkill for a
  modular monolith in Phase 1; the capability module preserves the
  boundary so an external engine can replace `can()` later without
  touching call sites.
- **Per-novel memberships now**: deferred. Novels inherit workspace
  membership in Phase 1; novel-level membership/ownership is a
  Phase 2+ migration when sharing a single novel across workspaces
  becomes a real requirement. The service signatures already take
  `(actorUserId, workspaceId, novelId)` so the tightening is additive.

## Consequences

- Adding a capability = one enum entry + mapping update + service call;
  no route changes elsewhere.
- 404-instead-of-403 for non-members is deliberate; UI must not infer
  resource existence from status codes.
- Audit rows are the compliance trail for admin actions (CLAUDE.md
  §33); retention policy is a Phase 13 concern.
- Session revocation on membership change is currently coarse (ADR-0002
  §5); fine-grained per-workspace session versioning is deferred.
