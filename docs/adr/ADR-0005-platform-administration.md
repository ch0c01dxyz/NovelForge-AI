# ADR-0005: Platform administration is a separate authorization axis

## Status

Accepted (2026-09-25)

## Context

Phase 3 introduces platform-wide resources: LLM gateway instances and
their credentials, and the model registry that maps capability profiles
to concrete models. These are not tenant-scoped — there is one set of
gateways for the whole deployment, and their credentials are provider
secrets (CLAUDE.md §14).

ADR-0004 defines authorization as capabilities derived from a
`Membership` row: `ROLE_CAPABILITIES[role]` with roles OWNER, ADMIN,
AUTHOR, EDITOR, VIEWER, scoped to a workspace. ADR-0004 explicitly noted
it omitted "platform-level SUPER_ADMIN" from CLAUDE.md's role list.

Reusing a workspace role for gateway administration would mean that any
user who creates a workspace becomes OWNER of it and therefore holds
`gateway:manage` — the ability to read, rotate, or replace global LLM
provider credentials, and to route every tenant's generations to a
gateway they control. Workspace creation is self-service, so this is a
privilege-escalation path, not a theoretical one.

A second constraint: the model registry is global, but `model:read` was
initially granted to every workspace role. That made a declared platform
capability reachable through the workspace axis — the exact invariant
this ADR exists to enforce.

## Decision

We will treat platform administration as a second, independent
authorization axis.

1. A nullable `users.platform_role` column holds `SUPER_ADMIN` or null.
   It is read from the database on every request
   (`platformRoleOf(userId)`); it is never taken from a session token, a
   header, or any client-supplied value.
2. `PLATFORM_ONLY_CAPABILITIES` (gateway:read, gateway:manage,
   model:read, model:manage) are never conferred by any workspace role.
   `ROLE_CAPABILITIES` is constructed so that OWNER — which otherwise
   holds every capability — filters this set out, and a test asserts no
   workspace role holds any of them.
3. `canPlatform(platformRole, capability)` is a closed set: it returns
   true only for `SUPER_ADMIN` **and** only for a capability in
   `PLATFORM_CAPABILITIES`. A super admin is not implicitly a member of
   every workspace and gains no workspace capability from the platform
   role.
4. Both axes deny with 403, so the single app-wide `setErrorHandler`
   maps `ForbiddenError` and `PlatformForbiddenError` identically.
5. Workspace-scoped AI resources (generations) are gated by the
   workspace axis like every other tenant resource — membership first,
   then capability — returning 404 for non-members.

This decision covers platform authorization only. It does not define
tenant administration, billing roles, or an admin UI.

## Alternatives

- **Reuse the workspace OWNER role for gateway administration** —
  rejected: self-service workspace creation would confer control of
  global provider credentials (CLAUDE.md §13/§14).
- **A `SUPER_ADMIN` value added to `MembershipRole`** — rejected: it
  would make a global privilege look tenant-scoped, and every
  membership query would need to know that one row is special.
- **An environment allowlist of admin user ids** — rejected: not
  auditable in the database, requires a restart to change, and leaves no
  record of who granted the privilege.
- **Granting a super admin every capability** — rejected: it would make
  platform administration a bypass for workspace authorization, so a
  platform admin could edit any tenant's manuscript without membership.

## Consequences

- Gateway credentials and the model registry have a single, auditable
  owner: rows in `users` with `platform_role = 'SUPER_ADMIN'`.
- Provisioning the first admin is an out-of-band operation (a direct
  database update); there is deliberately no API to self-promote. A
  future admin-management surface must itself be platform-gated and
  audited.
- Authorization tests must cover both axes; the "OWNER holds every
  capability" assertion is replaced by "every workspace capability but
  no platform capability".
- Workspace roles gain no privilege from this change; existing
  behaviour for tenants is unchanged.
