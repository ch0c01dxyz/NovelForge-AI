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
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLES = ["OWNER", "ADMIN", "AUTHOR", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Role -> capability mapping (ADR-0004). Ordered from most to least
 * privileged; every role includes novel:read.
 */
export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  OWNER: new Set<Capability>(CAPABILITIES),
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
  ]),
  AUTHOR: new Set<Capability>([
    "novel:create",
    "novel:read",
    "novel:update",
    "novel:archive",
  ]),
  EDITOR: new Set<Capability>(["novel:read", "novel:update"]),
  VIEWER: new Set<Capability>(["novel:read"]),
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

/** Membership changes must not create multiple owners or demote the last one. */
export const OWNER_MANAGEMENT_CAPS = ["member:change-role", "member:remove"] as const;
