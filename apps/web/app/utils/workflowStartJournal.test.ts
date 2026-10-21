import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkflowStart, readWorkflowStart, saveWorkflowStart, type PendingWorkflowStart } from "./workflowStartJournal";

const pending = (): PendingWorkflowStart => ({ actorUserId: "author", chapterId: "chapter", chapterTitle: "Original chapter",
  request: { workspaceId: "workspace", workflowId: "workflow", novelId: "novel", idempotencyKey: "same-key", input: { chapterNumber: 1, outlineRef: "outline", styleNotes: "Private instruction" }, stepModelRefs: { write: "model" } } });
beforeEach(() => { sessionStorage.clear();vi.restoreAllMocks(); });

describe("account-scoped workflow start journal", () => {
  it("persists exact request without credentials, restores across readers and isolates accounts", () => {
    const record = pending();saveWorkflowStart(record);
    expect(readWorkflowStart("author")).toEqual(record);expect(readWorkflowStart("another-author")).toBeNull();
    expect(sessionStorage.getItem("nf:workflow-start:v1:author")).not.toContain("token");
    clearWorkflowStart(record);expect(readWorkflowStart("author")).toBeNull();
  });
  it("refuses a competing request or changed payload/key and never removes its evidence", () => {
    const record = pending();saveWorkflowStart(record);
    const changed = pending();changed.request.input.styleNotes = "Another instruction";
    expect(() => saveWorkflowStart(changed)).toThrow();expect(() => clearWorkflowStart(changed)).toThrow();
    expect(readWorkflowStart("author")).toEqual(record);
  });
  it.each(["{broken", "null", JSON.stringify({ ...pending(), actorUserId: "other" }), JSON.stringify({ ...pending(), request: { ...pending().request, input: { chapterNumber: -1, outlineRef: "outline" } } }), JSON.stringify({ ...pending(), request: { ...pending().request, input: { ...pending().request.input, unexpected: "not a chapter input" } } })])("fails closed on corrupt/untrusted records", raw => {
    sessionStorage.setItem("nf:workflow-start:v1:author", raw);expect(() => readWorkflowStart("author")).toThrow();expect(sessionStorage.getItem("nf:workflow-start:v1:author")).toBe(raw);
  });
  it("refuses oversize records before storage", () => {
    const record = pending();record.request.input.styleNotes = "x".repeat(131072);expect(() => saveWorkflowStart(record)).toThrow();expect(sessionStorage.length).toBe(0);
  });
  it("refuses silently dropped storage writes and removals", () => {
    const record = pending();const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() => saveWorkflowStart(record)).toThrow();write.mockRestore();saveWorkflowStart(record);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});expect(() => clearWorkflowStart(record)).toThrow();expect(readWorkflowStart("author")).toEqual(record);
  });
});
