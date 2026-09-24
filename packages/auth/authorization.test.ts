import { describe, expect, it } from "vitest";
import {
  can,
  CAPABILITIES,
  ForbiddenError,
  requireCapability,
  ROLES,
  ROLE_CAPABILITIES,
} from "./authorization.ts";

describe("capability model", () => {
  it("OWNER holds every capability", () => {
    for (const c of CAPABILITIES) expect(can("OWNER", c)).toBe(true);
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
