import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiChapterCreation, type AiChapterSetup } from "./useAiChapterCreation";
import { readChapterCreation } from "../utils/chapterCreationJournal";
import { readWorkflowStart } from "../utils/workflowStartJournal";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./useApi", () => ({ useApi: () => ({ api }), ApiError: class extends Error { constructor(readonly status: number) { super(); } } }));
const setup: AiChapterSetup = { workflowId: "workflow", outlineRef: "outline", styleNotes: "Keep the missing letter unrevealed", targetWordCount: 800, stepModelRefs: { write: "model" }, fingerprint: "a".repeat(64) };
beforeEach(() => { sessionStorage.clear();api.mockReset(); });
describe("recoverable AI chapter creation", () => {
  it("persists before reserving, retains exact notes/model/id across an unknown enqueue, and never reserves twice", async () => {
    let reservationId = "";const requests: unknown[] = [];let starts = 0;
    api.mockImplementation(async (path: string, options?: { body: string }) => {
      if (path === "/auth/session") return { userId: "author" };
      const body = JSON.parse(options!.body);
      if (path.endsWith("/chapters")) {
        expect(readChapterCreation("author")?.reserved).toBe(false);
        reservationId = body.creationRequestId;return { id: reservationId, number: 7 };
      }
      requests.push(body);starts++;
      expect(readWorkflowStart("author")?.request.input.chapterNumber).toBe(7);
      if (starts === 1) throw new Error("Connection lost after enqueue");
      return { id: "run", statusUrl: "status" };
    });
    const first = useAiChapterCreation();
    await expect(first.start("workspace", "novel", "Pending AI", setup, async () => {})).rejects.toThrow();
    expect(readChapterCreation("author")?.pending.chapterId).toBe(reservationId);
    const restored = useAiChapterCreation();
    await restored.restore();
    await expect(restored.start("other", "novel", "ignored", undefined, async () => {})).rejects.toThrow("original novel");
    await restored.start("workspace", "novel", "ignored", undefined, async id => { expect(id).toBe(reservationId); });
    expect(requests[0]).toEqual(requests[1]);
    expect((requests[0] as { input: unknown }).input).toEqual({ chapterId: reservationId, chapterNumber: 7, outlineRef: "outline", styleNotes: setup.styleNotes, targetWordCount: 800 });
    expect(api.mock.calls.filter(([path]) => path.endsWith("/chapters"))).toHaveLength(1);
    expect(readChapterCreation("author")).toBeNull();expect(readWorkflowStart("author")).toBeNull();
  });
  it("fails before any story mutation when storage cannot persist, and keeps a confirmed reservation if opening fails", async () => {
    api.mockResolvedValue({ userId: "author" });
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await expect(useAiChapterCreation().start("workspace", "novel", "Pending", setup, async () => {})).rejects.toThrow();
    expect(api).toHaveBeenCalledTimes(1);storage.mockRestore();api.mockReset();
    api.mockImplementation(async (path: string, options?: { body: string }) => path === "/auth/session" ? { userId: "author" } : { id: JSON.parse(options!.body).creationRequestId, number: 2 });
    await expect(useAiChapterCreation().start("workspace", "novel", "Pending", setup, async () => { throw Error("scope changed"); })).rejects.toThrow("scope changed");
    expect(readChapterCreation("author")?.reserved).toBe(true);
    expect(api.mock.calls.some(([path]) => path.endsWith("/run"))).toBe(false);
  });
  it("retains the original account intent instead of enqueueing after an account switch", async () => {
    let actor = "author";
    api.mockImplementation(async (path: string, options?: { body: string }) => path === "/auth/session" ? { userId: actor } : { id: JSON.parse(options!.body).creationRequestId, number: 2 });
    await expect(useAiChapterCreation().start("workspace", "novel", "Pending", setup, async () => { actor = "another-author"; })).rejects.toThrow("Account changed");
    expect(readChapterCreation("author")?.reserved).toBe(true);expect(readChapterCreation("another-author")).toBeNull();
    expect(api.mock.calls.some(([path]) => path.endsWith("/run"))).toBe(false);
  });
  it("can explicitly resolve a deleted confirmed reservation before enqueue but cannot discard an unknown workflow", async () => {
    api.mockImplementation(async (path: string, options?: { body: string }) => path === "/auth/session" ? { userId: "author" } : path.includes("/creation-requests/") ? { chapter: null } : { id: JSON.parse(options!.body).creationRequestId, number: 2 });
    const creation = useAiChapterCreation();
    await expect(creation.start("workspace", "novel", "Pending", setup, async () => { throw Error("deleted while opening"); })).rejects.toThrow();
    expect(readChapterCreation("author")?.reserved).toBe(true);
    expect(await creation.resolveReservation("workspace", "novel")).toBeNull();expect(readChapterCreation("author")).toBeNull();
    api.mockImplementation(async (path: string, options?: { body: string }) => {
      if (path === "/auth/session") return { userId: "author" };
      if (path.endsWith("/run")) throw Error("unknown enqueue");
      return { id: JSON.parse(options!.body).creationRequestId, number: 3 };
    });
    await expect(creation.start("workspace", "novel", "Pending", setup, async () => {})).rejects.toThrow();
    await expect(creation.resolveReservation("workspace", "novel")).rejects.toThrow("pending workflow");
    expect(readChapterCreation("author")).not.toBeNull();expect(readWorkflowStart("author")).not.toBeNull();
  });
});
