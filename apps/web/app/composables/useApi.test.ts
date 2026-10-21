import { afterEach, expect, it, vi } from "vitest";
import { ApiError, useApi } from "./useApi";
afterEach(() => vi.unstubAllGlobals());
it.each(["agent/chapter-writer", "skill/chapter-continuity-check", "workflow/chapter-generation-review"])("retains only a bounded safe definition conflict key: %s", async definitionKey => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "STARTER_PACK_KEY_CONFLICT", definitionKey, private: "not propagated" }), { status: 409 })));
  await expect(useApi().api("/test")).rejects.toMatchObject({ code: "STARTER_PACK_KEY_CONFLICT", status: 409, definitionKey });
});
it("drops arbitrary response details and preserves existing error behavior", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "CONFLICT", definitionKey: "<arbitrary>" }), { status: 409 })));
  await expect(useApi().api("/test")).rejects.toEqual(new ApiError("CONFLICT", 409));
});
it("keeps non-JSON status fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })));
  await expect(useApi().api("/test")).rejects.toMatchObject({ code: "502", status: 502, definitionKey: undefined });
});
