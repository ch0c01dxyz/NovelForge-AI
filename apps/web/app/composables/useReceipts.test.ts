/**
 * useReceipts capability-helper tests (NF-WF-018C).
 *
 * The client-side role -> capability derivation is progressive
 * enhancement (the server enforces); these tests pin the documented
 * matrix so a drift is caught here, not in the UI.
 *
 * Matrix (packages/auth/authorization.ts ROLE_CAPABILITIES):
 * - generation:read (ledger + failures): OWNER, ADMIN, AUTHOR, EDITOR.
 * - canon:read (evaluations): OWNER, ADMIN, AUTHOR, EDITOR.
 * - workflow:manage (audit trail): OWNER, ADMIN only.
 * - VIEWER sees none of the receipts surfaces.
 */
import { describe, expect, it } from "vitest";
import {
  canReadReceipts,
  canReadEvaluations,
  canReadAuditTrail,
  type WorkspaceRole,
} from "./useReceipts";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "AUTHOR", "EDITOR", "VIEWER"];

describe("canReadReceipts", () => {
  it("grants generation:read holders (everyone except VIEWER)", () => {
    for (const role of ROLES) {
      expect(canReadReceipts(role), role).toBe(role !== "VIEWER");
    }
  });
  it("denies null (not a member)", () => {
    expect(canReadReceipts(null)).toBe(false);
  });
});

describe("canReadEvaluations", () => {
  it("grants canon:read holders (everyone except VIEWER)", () => {
    for (const role of ROLES) {
      expect(canReadEvaluations(role), role).toBe(role !== "VIEWER");
    }
  });
  it("denies null", () => {
    expect(canReadEvaluations(null)).toBe(false);
  });
});

describe("canReadAuditTrail", () => {
  it("grants workflow:manage holders (OWNER, ADMIN only)", () => {
    for (const role of ROLES) {
      expect(canReadAuditTrail(role), role).toBe(
        role === "OWNER" || role === "ADMIN",
      );
    }
  });
  it("denies null", () => {
    expect(canReadAuditTrail(null)).toBe(false);
  });
});
