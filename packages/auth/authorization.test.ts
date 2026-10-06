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

  // ---- NF-WF-005 workflow:approve ----
  // Deciding a parked HUMAN_APPROVAL step mirrors canon:approve: it commits
  // the run's continuation (or fails it), which is the same authority act.
  // Explicit assertions, for the same reason as the canon block above.

  it("workflow:approve is a workspace-scoped capability, never a platform one", () => {
    expect(PLATFORM_ONLY_CAPABILITIES.has("workflow:approve")).toBe(false);
    // A platform SUPER_ADMIN is deliberately not a member of every
    // workspace, so platform authority must not decide every tenant's
    // parked approvals (ADR-0005/ADR-0008).
    expect(canPlatform("SUPER_ADMIN", "workflow:approve")).toBe(false);
  });

  it("workflow:approve is held by OWNER, ADMIN and AUTHOR only", () => {
    expect(can("OWNER", "workflow:approve")).toBe(true);
    expect(can("ADMIN", "workflow:approve")).toBe(true);
    expect(can("AUTHOR", "workflow:approve")).toBe(true);
    // An editor reviews continuity; deciding what a workflow continues
    // with is the authority act reserved to the author (CLAUDE.md §5).
    expect(can("EDITOR", "workflow:approve")).toBe(false);
    expect(can("VIEWER", "workflow:approve")).toBe(false);
  });

  it("ADMIN manages members and novels but cannot delete workspaces", () => {
    expect(can("ADMIN", "member:invite")).toBe(true);
    expect(can("ADMIN", "member:change-role")).toBe(true);
    expect(can("ADMIN", "workspace:delete")).toBe(false);
  });

  // ---- NF-WF-021 simulation capabilities (Q7) ----
  // Simulation is a distinct workspace-scoped domain: reusing
  // revision:manage would grant simulation-runners the power to rewind
  // story history. Explicit assertions, for the same reason as the canon
  // block above.

  it("simulation capabilities are workspace-scoped, never platform capabilities", () => {
    for (const c of ["simulation:read", "simulation:manage"] as const) {
      expect(PLATFORM_ONLY_CAPABILITIES.has(c)).toBe(false);
      expect(canPlatform("SUPER_ADMIN", c)).toBe(false);
    }
  });

  it("simulation:read is held by OWNER, ADMIN, AUTHOR and EDITOR — not VIEWER", () => {
    expect(can("OWNER", "simulation:read")).toBe(true);
    expect(can("ADMIN", "simulation:read")).toBe(true);
    expect(can("AUTHOR", "simulation:read")).toBe(true);
    // An editor is a continuity reviewer: they may inspect simulation
    // outcomes, but running simulations is the author's act.
    expect(can("EDITOR", "simulation:read")).toBe(true);
    expect(can("VIEWER", "simulation:read")).toBe(false);
  });

  it("simulation:manage is held by OWNER, ADMIN and AUTHOR only", () => {
    expect(can("OWNER", "simulation:manage")).toBe(true);
    expect(can("ADMIN", "simulation:manage")).toBe(true);
    expect(can("AUTHOR", "simulation:manage")).toBe(true);
    expect(can("EDITOR", "simulation:manage")).toBe(false);
    expect(can("VIEWER", "simulation:manage")).toBe(false);
  });

  // ---- NF-WF-022A endgame capabilities (contract §Capabilities) ----
  // Endgame planning is a distinct workspace-scoped domain: reusing
  // canon:manage would grant canon-authoring power; reusing
  // simulation:manage would grant simulation-running power. Explicit
  // assertions, for the same reason as the canon/simulation blocks above.

  it("endgame capabilities are workspace-scoped, never platform capabilities", () => {
    for (const c of ["endgame:read", "endgame:manage"] as const) {
      expect(PLATFORM_ONLY_CAPABILITIES.has(c)).toBe(false);
      expect(canPlatform("SUPER_ADMIN", c)).toBe(false);
    }
  });

  it("endgame:read is held by OWNER, ADMIN, AUTHOR and EDITOR — not VIEWER", () => {
    expect(can("OWNER", "endgame:read")).toBe(true);
    expect(can("ADMIN", "endgame:read")).toBe(true);
    expect(can("AUTHOR", "endgame:read")).toBe(true);
    // An editor is a continuity reviewer: they may inspect the debt
    // report, but closure decisions are the author's act.
    expect(can("EDITOR", "endgame:read")).toBe(true);
    expect(can("VIEWER", "endgame:read")).toBe(false);
  });

  it("endgame:manage is held by OWNER, ADMIN and AUTHOR only", () => {
    expect(can("OWNER", "endgame:manage")).toBe(true);
    expect(can("ADMIN", "endgame:manage")).toBe(true);
    expect(can("AUTHOR", "endgame:manage")).toBe(true);
    expect(can("EDITOR", "endgame:manage")).toBe(false);
    expect(can("VIEWER", "endgame:manage")).toBe(false);
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
