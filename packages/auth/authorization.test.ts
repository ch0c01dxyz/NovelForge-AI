import { describe, expect, it } from "vitest";
import {
  can,
  canPlatform,
  CAPABILITIES,
  ForbiddenError,
  PLATFORM_ONLY_CAPABILITIES,
  requireCapability,
  ROLES,
  ROLE_CAPABILITIES,
} from "./authorization.ts";

describe("capability model", () => {
  it("OWNER holds every workspace capability but no platform capability", () => {
    for (const c of CAPABILITIES) {
      // Platform-only capabilities are never conferred by a workspace
      // role (ADR-0005): a workspace OWNER must not be able to manage
      // global LLM gateway credentials.
      expect(can("OWNER", c)).toBe(!PLATFORM_ONLY_CAPABILITIES.has(c));
    }
  });

  it("no workspace role holds a platform-only capability", () => {
    for (const role of ROLES) {
      for (const c of PLATFORM_ONLY_CAPABILITIES) {
        expect(can(role, c)).toBe(false);
      }
    }
  });

  it("platform administration is a separate axis from workspace roles", () => {
    // A super admin may administer gateways...
    expect(canPlatform("SUPER_ADMIN", "gateway:manage")).toBe(true);
    expect(canPlatform("SUPER_ADMIN", "model:manage")).toBe(true);
    // ...but platform role is NOT a bypass for workspace authorization:
    // it grants nothing outside the platform capability set.
    expect(canPlatform("SUPER_ADMIN", "chapter:update")).toBe(false);
    expect(canPlatform("SUPER_ADMIN", "member:invite")).toBe(false);
    expect(canPlatform("SUPER_ADMIN", "workspace:delete")).toBe(false);
    // And a non-admin holds no platform capability.
    expect(canPlatform(null, "gateway:manage")).toBe(false);
    expect(canPlatform(null, "model:read")).toBe(false);
  });

  it("VIEWER can only read novels and chapters", () => {
    expect(can("VIEWER", "novel:read")).toBe(true);
    expect(can("VIEWER", "chapter:read")).toBe(true);
    for (const c of CAPABILITIES) {
      if (c !== "novel:read" && c !== "chapter:read") {
        expect(can("VIEWER", c)).toBe(false);
      }
    }
  });

  it("ADMIN can use AI generation like the roles below it", () => {
    // ADMIN outranks AUTHOR and EDITOR; omitting generation capabilities
    // from ADMIN alone would reject a more privileged actor.
    expect(can("ADMIN", "generation:create")).toBe(true);
    expect(can("ADMIN", "generation:read")).toBe(true);
  });

  it("EDITOR reads and updates but cannot create/delete novels or manage members", () => {
    expect(can("EDITOR", "novel:update")).toBe(true);
    expect(can("EDITOR", "novel:create")).toBe(false);
    expect(can("EDITOR", "novel:delete")).toBe(false);
    expect(can("EDITOR", "member:invite")).toBe(false);
  });

  it("AUTHOR can create/archive but not delete novels", () => {
    expect(can("AUTHOR", "novel:create")).toBe(true);
    expect(can("AUTHOR", "novel:archive")).toBe(true);
    expect(can("AUTHOR", "novel:delete")).toBe(false);
  });

  // ---- Phase 6 canon capabilities ----
  // These need explicit assertions: the generic loops above check
  // "workspace capability vs platform capability" and VIEWER's exact set,
  // but nothing generic pins WHICH roles hold a given workspace
  // capability. Without these, a future edit could grant EDITOR
  // canon:approve and every existing test would still pass.

  it("canon capabilities are workspace-scoped, never platform capabilities", () => {
    for (const c of ["canon:read", "canon:manage", "canon:approve"] as const) {
      expect(PLATFORM_ONLY_CAPABILITIES.has(c)).toBe(false);
      // A platform SUPER_ADMIN is deliberately not a member of every
      // workspace, so platform authority must not confer story-truth
      // approval over every tenant's canon (ADR-0005/ADR-0008).
      expect(canPlatform("SUPER_ADMIN", c)).toBe(false);
    }
  });

  it("canon:read is held by OWNER, ADMIN, AUTHOR and EDITOR — not VIEWER", () => {
    expect(can("OWNER", "canon:read")).toBe(true);
    expect(can("ADMIN", "canon:read")).toBe(true);
    expect(can("AUTHOR", "canon:read")).toBe(true);
    expect(can("EDITOR", "canon:read")).toBe(true);
    expect(can("VIEWER", "canon:read")).toBe(false);
  });

  it("canon:manage and canon:approve are held by OWNER, ADMIN and AUTHOR only", () => {
    for (const c of ["canon:manage", "canon:approve"] as const) {
      expect(can("OWNER", c), `OWNER ${c}`).toBe(true);
      expect(can("ADMIN", c), `ADMIN ${c}`).toBe(true);
      expect(can("AUTHOR", c), `AUTHOR ${c}`).toBe(true);
      // An editor reviews continuity; committing story truth is the
      // canon-authority act reserved to the author (CLAUDE.md §5).
      expect(can("EDITOR", c), `EDITOR ${c}`).toBe(false);
      expect(can("VIEWER", c), `VIEWER ${c}`).toBe(false);
    }
  });

  it("ADMIN manages members and novels but cannot delete workspaces", () => {
    expect(can("ADMIN", "member:invite")).toBe(true);
    expect(can("ADMIN", "member:change-role")).toBe(true);
    expect(can("ADMIN", "workspace:delete")).toBe(false);
  });

  it("every role has at least novel:read; all mapped capabilities are valid", () => {
    for (const r of ROLES) {
      expect(ROLE_CAPABILITIES[r].has("novel:read")).toBe(true);
      for (const c of ROLE_CAPABILITIES[r]) {
        expect(CAPABILITIES).toContain(c);
      }
    }
  });

  it("requireCapability throws a typed ForbiddenError", () => {
    expect(() => requireCapability("VIEWER", "novel:create")).toThrow(ForbiddenError);
    expect(() => requireCapability("AUTHOR", "novel:create")).not.toThrow();
  });
});
