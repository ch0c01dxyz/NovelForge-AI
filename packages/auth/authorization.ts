/**
 * Authorization capability model (ADR-0004).
 *
 * Granular capabilities instead of scattered `role === "ADMIN"` checks
 * (CLAUDE.md §13). Roles map to capability sets; enforcement is
 * server-side in application services. Pure module: no IO, no ORM.
 */

export const CAPABILITIES = [
  // Workspace
  "workspace:update",
  "workspace:delete",
  "member:invite",
  "member:remove",
  "member:change-role",
  // Novel
  "novel:create",
  "novel:read",
  "novel:update",
  "novel:delete",
  "novel:archive",
  // Manuscript (Phase 2)
  "chapter:create",
  "chapter:read",
  "chapter:update",
  "chapter:delete",
  "chapter:publish",
  // AI infrastructure (Phase 3) — platform-wide, not workspace-scoped.
  // Reading a gateway/model never exposes credentials; managing them does.
  "gateway:read",
  "gateway:manage",
  "model:read",
  "model:manage",
  "generation:create",
  "generation:read",
  // Agent / skill / workflow platform (Phase 4). Workspace-scoped: a
  // workspace owns its own agent, skill and workflow definitions.
  "agent:read",
  "agent:manage",
  "skill:read",
  "skill:manage",
  "workflow:read",
  "workflow:manage",
  "workflow:run",
  // Platform-scoped catalog. Only a platform administrator may define the
  // shared agent/skill/workflow catalog every workspace can read.
  "platform:define",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLES = ["OWNER", "ADMIN", "AUTHOR", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Capabilities that only a platform administrator may hold (ADR-0005).
 *
 * These govern platform-wide resources — LLM gateway instances and their
 * credentials, the model registry, and the PLATFORM-scoped agent/skill/
 * workflow catalog every workspace can read. A workspace role must never
 * confer them: workspace membership is per-tenant and self-service, so
 * mapping these to OWNER would let anyone who creates a workspace manage
 * global provider secrets or inject shared agent instructions into every
 * tenant's prompts (CLAUDE.md §13/§14, SECURITY.md prompt-injection
 * boundary). Declared before ROLE_CAPABILITIES because OWNER's set is
 * built from it.
 */
export const PLATFORM_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "gateway:read",
  "gateway:manage",
  "model:read",
  "model:manage",
  "platform:define",
]);

/**
 * Role -> capability mapping (ADR-0004). Ordered from most to least
 * privileged; every role includes novel:read.
 */
export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  OWNER: new Set<Capability>(
    CAPABILITIES.filter((c) => !PLATFORM_ONLY_CAPABILITIES.has(c)),
  ),
  ADMIN: new Set<Capability>([
    "workspace:update",
    "member:invite",
    "member:remove",
    "member:change-role",
    "novel:create",
    "novel:read",
    "novel:update",
    "novel:delete",
    "novel:archive",
    "chapter:create",
    "chapter:read",
    "chapter:update",
    "chapter:delete",
    "chapter:publish",
    // ADMIN is more privileged than AUTHOR/EDITOR, which both hold these;
    // omitting them would make ADMIN unable to use AI generation at all.
    "generation:create",
    "generation:read",
    // ADMIN owns the workspace's AI definitions and can run them.
    "agent:read",
    "agent:manage",
    "skill:read",
    "skill:manage",
    "workflow:read",
    "workflow:manage",
    "workflow:run",
  ]),
  AUTHOR: new Set<Capability>([
    "novel:create",
    "novel:read",
    "novel:update",
    "novel:archive",
    "chapter:create",
    "chapter:read",
    "chapter:update",
    "generation:create",
    "generation:read",
    // A writer may use and run the workspace's AI definitions, but
    // editing shared definitions is an ADMIN act.
    "agent:read",
    "skill:read",
    "workflow:read",
    "workflow:run",
  ]),
  EDITOR: new Set<Capability>([
    "novel:read",
    "novel:update",
    "chapter:read",
    "chapter:update",
    "generation:create",
    "generation:read",
    "agent:read",
    "skill:read",
    "workflow:read",
    "workflow:run",
  ]),
  VIEWER: new Set<Capability>(["novel:read", "chapter:read"]),
};

/** Can `role` perform `capability`? */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/** Guard helper: throws a typed error the API layer maps to 403. */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(capability: Capability) {
    super(`missing capability: ${capability}`);
  }
}

export function requireCapability(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw new ForbiddenError(capability);
}

export type PlatformRole = "SUPER_ADMIN" | null;

/**
 * Capabilities a platform administrator may exercise. Deliberately a
 * closed set: platform administration must never become a bypass for
 * workspace authorization (a super admin is not implicitly a member of
 * every workspace). It therefore does NOT include agent:manage /
 * skill:manage / workflow:manage — those act on a workspace's own
 * definitions and still require membership. `platform:define` is the
 * separate capability for the shared PLATFORM-scoped catalog.
 */
export const PLATFORM_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "gateway:read",
  "gateway:manage",
  "model:read",
  "model:manage",
  "platform:define",
]);

/**
 * Platform-level authorization. Separate axis from workspace roles:
 * `platformRole` comes from the user row, not from a membership, and it
 * only ever confers PLATFORM_CAPABILITIES.
 */
export function canPlatform(
  platformRole: PlatformRole,
  capability: Capability,
): boolean {
  return platformRole === "SUPER_ADMIN" && PLATFORM_CAPABILITIES.has(capability);
}

export class PlatformForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(capability: Capability) {
    super(`platform capability required: ${capability}`);
  }
}

export function requirePlatformCapability(
  platformRole: PlatformRole,
  capability: Capability,
): void {
  if (!canPlatform(platformRole, capability)) {
    throw new PlatformForbiddenError(capability);
  }
}
