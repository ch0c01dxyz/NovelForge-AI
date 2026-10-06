/**
 * Synced reading progress tests (NF-WF-019D).
 *
 * Covers the client merge semantics: max(updatedAt) wins between
 * device-local 014 progress and the server row; ties keep the server
 * row (deterministic); the winner is written back via the idempotent
 * PUT; offline writes queue and flush on reconnect; anonymous users
 * make no progress-network calls beyond the single session probe.
 *
 * The network is fully mocked (global fetch stub).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useSyncedReadingProgress } from "./useSyncedReadingProgress";
import { useReadingProgress } from "./useReadingProgress";

const NOVEL_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "test-novel";

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(body: unknown, status = 200): MockResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
let serverRow: {
  novelId: string;
  chapterNumber: number;
  scrollRatio: number | null;
  updatedAt: string;
} | null;
let putCalls: Array<{ novelId: string; chapterNumber: number; clientUpdatedAt: string }>;
let sessionValid: boolean;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  serverRow = null;
  putCalls = [];
  sessionValid = true;
  fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/auth/session") {
      return sessionValid ? jsonResponse({ userId: "u1" }) : jsonResponse({ error: "NO_SESSION" }, 401);
    }
    if (url.startsWith("/api/reader/progress") && method === "GET") {
      return jsonResponse({ progress: serverRow });
    }
    if (url === "/api/reader/progress" && method === "PUT") {
      const body = JSON.parse(init?.body ?? "{}") as {
        novelId: string;
        chapterNumber: number;
        clientUpdatedAt: string;
      };
      putCalls.push(body);
      // Server LWW: apply only when newer than the stored row.
      const incoming = Date.parse(body.clientUpdatedAt);
      const stored = serverRow ? Date.parse(serverRow.updatedAt) : NaN;
      if (!serverRow || incoming > stored) {
        serverRow = {
          novelId: body.novelId,
          chapterNumber: body.chapterNumber,
          scrollRatio: null,
          updatedAt: body.clientUpdatedAt,
        };
      }
      return jsonResponse({ progress: serverRow });
    }
    if (url.startsWith("/api/reader/progress/") && method === "DELETE") {
      serverRow = null;
      return { ok: true, status: 204, json: async () => null };
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  // Online by default.
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSyncedReadingProgress (019D merge semantics)", () => {
  it("anonymous: no progress-network calls; 014 device-local still works", async () => {
    sessionValid = false;
    const { loadSyncedProgress, syncState } = useSyncedReadingProgress();
    const { markRead, getProgress } = useReadingProgress();
    markRead(SLUG, 4);

    const merged = await loadSyncedProgress(SLUG, NOVEL_ID);
    expect(merged).toBeNull();
    expect(syncState.value).toBe("anonymous");
    // Only the session probe ran; no /api/reader/* call.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(["/api/auth/session"]);
    // 014 device-local is unaffected.
    expect(getProgress(SLUG)!.chapterNumber).toBe(4);
  });

  it("server row newer than device-local: server wins, scrollRatio seeds", async () => {
    const { markRead } = useReadingProgress();
    markRead(SLUG, 2);
    // Backdate the local entry so the server is newer.
    const raw = JSON.parse(localStorage.getItem("nf:reading-progress:v1")!);
    raw[SLUG].updatedAt = "2026-10-05T00:00:00.000Z";
    localStorage.setItem("nf:reading-progress:v1", JSON.stringify(raw));
    serverRow = {
      novelId: NOVEL_ID,
      chapterNumber: 5,
      scrollRatio: 0.4,
      updatedAt: "2026-10-06T00:00:00.000Z",
    };

    const { loadSyncedProgress, syncState } = useSyncedReadingProgress();
    const merged = await loadSyncedProgress(SLUG, NOVEL_ID);
    expect(merged).toEqual({ chapterNumber: 5, scrollRatio: 0.4 });
    expect(syncState.value).toBe("synced");
    // No PUT needed — the server row is already current.
    expect(putCalls).toHaveLength(0);
  });

  it("device-local newer than server: local wins and is written back", async () => {
    serverRow = {
      novelId: NOVEL_ID,
      chapterNumber: 3,
      scrollRatio: null,
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const { markRead } = useReadingProgress();
    markRead(SLUG, 8);

    const { loadSyncedProgress, syncState } = useSyncedReadingProgress();
    const merged = await loadSyncedProgress(SLUG, NOVEL_ID);
    expect(merged!.chapterNumber).toBe(8);
    expect(syncState.value).toBe("synced");
    // The winner was written back (idempotent PUT).
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.chapterNumber).toBe(8);
    expect(serverRow!.chapterNumber).toBe(8);
  });

  it("tie keeps the server row (deterministic)", async () => {
    const ts = "2026-10-06T10:00:00.000Z";
    serverRow = { novelId: NOVEL_ID, chapterNumber: 6, scrollRatio: 0.7, updatedAt: ts };
    const raw: Record<string, { chapterNumber: number; updatedAt: string }> = {};
    raw[SLUG] = { chapterNumber: 2, updatedAt: ts };
    localStorage.setItem("nf:reading-progress:v1", JSON.stringify(raw));

    const { loadSyncedProgress } = useSyncedReadingProgress();
    const merged = await loadSyncedProgress(SLUG, NOVEL_ID);
    expect(merged).toEqual({ chapterNumber: 6, scrollRatio: 0.7 });
  });

  it("offline writes queue and flush on reconnect", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { saveProgress, flushQueue, syncState } = useSyncedReadingProgress();
    saveProgress(NOVEL_ID, 9, 0.3);
    // Wait for the debounced PUT attempt.
    await new Promise((r) => setTimeout(r, 2100));
    expect(putCalls).toHaveLength(0);
    expect(syncState.value).toBe("offline");
    const queue = JSON.parse(localStorage.getItem("nf:progress-sync-queue:v1")!);
    expect(queue[NOVEL_ID].chapterNumber).toBe(9);

    // Reconnect → flush.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue();
    expect(putCalls).toHaveLength(1);
    expect(serverRow!.chapterNumber).toBe(9);
    expect(syncState.value).toBe("synced");
    expect(localStorage.getItem("nf:progress-sync-queue:v1")).toBe("{}");
  });

  it("clearSyncedProgress issues an idempotent DELETE", async () => {
    serverRow = {
      novelId: NOVEL_ID,
      chapterNumber: 4,
      scrollRatio: null,
      updatedAt: "2026-10-06T00:00:00.000Z",
    };
    const { clearSyncedProgress } = useSyncedReadingProgress();
    await clearSyncedProgress(NOVEL_ID);
    expect(serverRow).toBeNull();
    const urls = fetchMock.mock.calls.map((c) => `${c[1]?.method ?? "GET"} ${c[0]}`);
    expect(urls).toContain(`DELETE /api/reader/progress/${NOVEL_ID}`);
  });
});
