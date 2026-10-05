/**
 * Reading-progress tests (NF-WF-014, Invariant 5).
 *
 * The composable is device-local by construction: it never imports
 * fetch and never calls the network. These tests pin the storage
 * contract (chapter-granular {chapterNumber, updatedAt}, versioned
 * key, write-on-200-only call discipline) and assert zero network
 * calls during a full markRead → listProgress cycle.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { useReadingProgress } from "./useReadingProgress";

const KEY = "nf:reading-progress:v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReadingProgress (device-local, no network)", () => {
  it("writes a chapter-granular entry and reads it back", () => {
    const { markRead, getProgress } = useReadingProgress();
    markRead("my-novel", 7);
    const entry = getProgress("my-novel");
    expect(entry).not.toBeNull();
    expect(entry!.chapterNumber).toBe(7);
    expect(typeof entry!.updatedAt).toBe("string");
    // No scroll position is stored.
    expect(Object.keys(entry!).sort()).toEqual(["chapterNumber", "updatedAt"]);
  });

  it("overwrites the entry for the same slug", () => {
    const { markRead, getProgress } = useReadingProgress();
    markRead("my-novel", 3);
    markRead("my-novel", 5);
    expect(getProgress("my-novel")!.chapterNumber).toBe(5);
  });

  it("lists entries newest-first", () => {
    const { markRead, listProgress } = useReadingProgress();
    // Distinct timestamps: same-millisecond writes would tie the sort.
    vi.spyOn(Date.prototype, "toISOString")
      .mockReturnValueOnce("2026-10-05T00:00:00.000Z")
      .mockReturnValueOnce("2026-10-06T00:00:00.000Z");
    markRead("a", 1);
    markRead("b", 2);
    const list = listProgress();
    expect(list.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("drops an entry (404 path — no 'removed' oracle)", () => {
    const { markRead, dropProgress, getProgress } = useReadingProgress();
    markRead("gone", 2);
    dropProgress("gone");
    expect(getProgress("gone")).toBeNull();
    expect(localStorage.getItem(KEY)).not.toContain("gone");
  });

  it("ignores invalid input and corrupt storage without throwing", () => {
    const { markRead, getProgress } = useReadingProgress();
    markRead("", 1);
    markRead("x", 0);
    markRead("x", -2);
    expect(getProgress("")).toBeNull();
    localStorage.setItem(KEY, "not-json{{{");
    expect(getProgress("x")).toBeNull();
    expect(() => markRead("y", 1)).not.toThrow();
  });

  it("makes zero network calls during a full cycle", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { markRead, getProgress, listProgress, dropProgress } =
      useReadingProgress();
    markRead("net-novel", 4);
    getProgress("net-novel");
    listProgress();
    dropProgress("net-novel");
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the versioned storage key only", () => {
    const { markRead } = useReadingProgress();
    markRead("k", 1);
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(KEY);
  });
});
