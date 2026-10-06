/**
 * usePlatformAdmin tests (NF-WF-018B).
 *
 * - isSuperAdmin is the exact UI-gating predicate (progressive
 *   enhancement; the server enforces).
 * - getPlatformRole reads the additive session field.
 * - listGateways hits the frozen route path.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { usePlatformAdmin } from "./usePlatformAdmin";

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSuperAdmin", () => {
  it("is true only for SUPER_ADMIN", () => {
    const { isSuperAdmin } = usePlatformAdmin();
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe("getPlatformRole", () => {
  it("reads platformRole from the session response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ userId: "u-1", platformRole: "SUPER_ADMIN" }),
    );
    const { getPlatformRole } = usePlatformAdmin();
    expect(await getPlatformRole()).toBe("SUPER_ADMIN");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("returns null for a regular user", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ userId: "u-2", platformRole: null }),
    );
    const { getPlatformRole } = usePlatformAdmin();
    expect(await getPlatformRole()).toBeNull();
  });
});

describe("listGateways", () => {
  it("calls the frozen gateway list route", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: "gw-1", hasCredential: true }]));
    const { listGateways } = usePlatformAdmin();
    const rows = await listGateways();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gateways",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(rows[0]!.hasCredential).toBe(true);
  });
});
