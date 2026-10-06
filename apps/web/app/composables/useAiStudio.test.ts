/**
 * useAiStudio capability-helper tests (NF-WF-018A).
 *
 * The client-side role -> capability derivation is progressive enhancement
 * (the server enforces); these tests pin the documented matrix so a
 * drift is caught here, not in the UI.
 *
 * Matrix (packages/auth/authorization.ts ROLE_CAPABILITIES):
 * - VIEWER sees nothing (no workflow:read).
 * - AUTHOR/EDITOR/OWNER/ADMIN hold workflow:read (view runs/definitions).
 * - workflow:approve: OWNER, ADMIN, AUTHOR only.
 * - agent:manage/skill:manage/workflow:manage: OWNER, ADMIN only.
 * - workflow:run: everyone except VIEWER.
 */
import { describe, expect, it } from "vitest";
import {
  canViewStudio,
  canManageDefinitions,
  canDecideApprovals,
  canLaunchRuns,
  type WorkspaceRole,
} from "./useAiStudio";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "AUTHOR", "EDITOR", "VIEWER"];

describe("canViewStudio", () => {
  it("grants everyone except VIEWER", () => {
    for (const role of ROLES) {
      expect(canViewStudio(role), role).toBe(role !== "VIEWER");
    }
  });
  it("denies null (not a member)", () => {
    expect(canViewStudio(null)).toBe(false);
  });
});

describe("canManageDefinitions", () => {
  it("grants OWNER and ADMIN only", () => {
    for (const role of ROLES) {
      expect(canManageDefinitions(role), role).toBe(
        role === "OWNER" || role === "ADMIN",
      );
    }
  });
  it("denies null", () => {
    expect(canManageDefinitions(null)).toBe(false);
  });
});

describe("canDecideApprovals", () => {
  it("grants OWNER, ADMIN, AUTHOR only (deliberately not EDITOR/VIEWER)", () => {
    for (const role of ROLES) {
      expect(canDecideApprovals(role), role).toBe(
        role === "OWNER" || role === "ADMIN" || role === "AUTHOR",
      );
    }
  });
  it("denies null", () => {
    expect(canDecideApprovals(null)).toBe(false);
  });
});

describe("canLaunchRuns", () => {
  it("grants everyone except VIEWER", () => {
    for (const role of ROLES) {
      expect(canLaunchRuns(role), role).toBe(role !== "VIEWER");
    }
  });
  it("denies null", () => {
    expect(canLaunchRuns(null)).toBe(false);
  });
});
