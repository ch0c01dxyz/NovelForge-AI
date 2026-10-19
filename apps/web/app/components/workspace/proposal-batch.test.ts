import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import ProposalReview from "./ProposalReview.vue";

vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({
  t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : ""),
}) }));
const WS = "11111111-1111-4111-8111-111111111111";
const NOVEL = "22222222-2222-4222-8222-222222222222";
const H1 = "33333333-3333-4333-8333-333333333333";
const H2 = "44444444-4444-4444-8444-444444444444";
const H3 = "55555555-5555-4555-8555-555555555555";
const CP = "66666666-6666-4666-8666-666666666666";
const rows = ["one", "two", "three"].map((id) => ({ id, entityId: id, predicate: "role", statement: id, status: "PROPOSED", conflictKind: null, conflictsWithFactId: null, canonFactId: null }));
let wrapper: VueWrapper | undefined;
type Reply = { status?: number; body?: unknown };
async function setup(handler?: (url: string, init?: RequestInit) => Promise<Reply> | Reply | undefined, data = rows.slice(0, 2)) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const answer = await handler?.(url, init) ?? (init?.method === "POST"
      ? { body: url.endsWith("checkpoints") ? { checkpointId: CP, revisionId: H1 } : { revisionId: url.includes("/one/") ? H2 : H3 } }
      : { body: data });
    const status = answer.status ?? 200;
    return { ok: status < 300, status, json: async () => answer.body };
  }));
  wrapper = mount(ProposalReview, { props: { workspaceId: WS, novelId: NOVEL }, attachTo: document.body });
  await flushPromises();
  return { w: wrapper, calls, posts: () => calls.filter(c => c.init?.method === "POST") };
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); document.body.innerHTML = ""; });
async function selectAll(w: VueWrapper) { await w.get('[data-testid="proposal-select-all"]').setValue(true); }
async function confirm(w: VueWrapper) { await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises(); }

describe("proposal batch decisions", () => {
  it("selects pending rows only and requires explicit confirmation", async () => {
    const { w, posts } = await setup(undefined, [...rows, { ...rows[0]!, id: "old", status: "APPROVED" }]);
    await selectAll(w);
    expect(w.findAll('[data-testid^="proposal-select-"]')).toHaveLength(4);
    await w.get('[data-testid="proposal-batch-approve"]').trigger("click");
    expect(posts()).toHaveLength(0);
    await w.get('[data-testid="confirm-cancel"]').trigger("click");
    expect(posts()).toHaveLength(0);
  });
  it("creates a checkpoint and chains committed revisions sequentially", async () => {
    let finish!: (value: Reply) => void;
    const { w, posts } = await setup((url, init) => {
      if (url.includes("/one/approve-batch-item")) return new Promise<Reply>(r => { finish = r; });
      if (init?.method === "POST") return { body: url.endsWith("checkpoints") ? { checkpointId: CP, revisionId: H1 } : { revisionId: H3 } };
      return { body: rows.slice(0, 2) };
    });
    await selectAll(w); await w.get('[data-testid="proposal-batch-approve"]').trigger("click"); await confirm(w);
    expect(posts()).toHaveLength(2);
    expect(w.get('[data-testid="proposal-select-all"]').attributes("disabled")).toBeDefined();
    expect(w.get('select').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="confirm-ok"]').trigger("click"); expect(posts()).toHaveLength(2);
    finish({ body: { revisionId: H2 } }); await flushPromises();
    expect(posts()).toHaveLength(3);
    expect(JSON.parse(posts()[1]!.init!.body as string)).toEqual({ expectedHeadRevisionId: H1 });
    expect(JSON.parse(posts()[2]!.init!.body as string)).toEqual({ expectedHeadRevisionId: H2 });
    expect(w.get('[data-testid="proposal-batch-results"]').text()).toContain("approved");
  });
  it("rejects selected rows with a shared note through novel-scoped routes", async () => {
    const { w, posts } = await setup();await selectAll(w);
    await w.get('[data-testid="proposal-batch-note"]').setValue("not supported");
    await w.get('[data-testid="proposal-batch-reject"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(3);
    expect(posts()[1]!.url).toBe(`/api/workspaces/${WS}/novels/${NOVEL}/canon/proposals/one/reject-batch-item`);
    expect(JSON.parse(posts()[1]!.init!.body as string)).toEqual({ expectedHeadRevisionId: H1, note: "not supported" });
    expect(JSON.parse(posts()[2]!.init!.body as string).expectedHeadRevisionId).toBe(H2);
  });
  it("blocks approval for conflicts and repeated subject/predicate slots", async () => {
    const { w } = await setup(undefined, [{ ...rows[0]!, conflictKind: "FUNCTIONAL_CONFLICT" as never }, rows[1]!]);
    await selectAll(w);expect(w.get('[data-testid="proposal-batch-approve"]').attributes("disabled")).toBeDefined();
    expect(w.get('[data-testid="proposal-batch-reject"]').attributes("disabled")).toBeUndefined();
    w.unmount();wrapper = undefined;
    const duplicate = await setup(undefined, [rows[0]!, { ...rows[1]!, entityId: rows[0]!.entityId }]);
    await selectAll(duplicate.w);expect(duplicate.w.get('[data-testid="proposal-batch-approve"]').attributes("disabled")).toBeDefined();
  });
  it("stops after a conflict and distinguishes success from unprocessed items", async () => {
    const { w, posts } = await setup((url, init) => {
      if (url.includes("/two/approve-batch-item")) return { status: 409, body: { error: "CONFLICT" } };
      if (init?.method === "POST") return { body: { checkpointId: CP, revisionId: url.endsWith("checkpoints") ? H1 : H2 } };
      return { body: rows };
    }, rows);
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(3);
    const results=w.get('[data-testid="proposal-batch-results"]').text();expect(results).toContain("approved");expect(results).toContain("failed");expect(results).toContain("notProcessed");
  });
  it("makes no decisions if the checkpoint fails", async () => {
    const { w, posts } = await setup((url, init) => init?.method === "POST" ? { status: 500, body: { error: "INTERNAL" } } : { body: rows });
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(1);expect(w.get('[data-testid="proposal-batch-results"]').text()).toContain("notProcessed");
  });
  it("labels network outcomes unknown without retrying or continuing", async () => {
    const { w, posts } = await setup((url, init) => {
      if (url.includes("approve-batch-item")) throw new Error("connection lost after request");
      return { body: init?.method === "POST" ? { checkpointId: CP, revisionId: H1 } : rows };
    });
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(2);expect(w.get('[data-testid="proposal-batch-results"]').text()).toContain("unknown");
  });
  it("requires both checkpoint identity and revision before dispatching decisions", async () => {
    const { w, posts } = await setup((url, init) => ({ body: init?.method === "POST" ? { revisionId: H1 } : rows }));
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(1);
  });
  it("treats malformed success receipts as unknown and stops", async () => {
    const { w, posts } = await setup((url, init) => ({ body: init?.method === "POST" ? (url.endsWith("checkpoints") ? { checkpointId: CP, revisionId: H1 } : {}) : rows }));
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(2);expect(w.get('[data-testid="proposal-batch-results"]').text()).toContain("unknown");
  });
  it("does not dispatch another item after unmount during a request", async () => {
    let finish!: (value: Reply) => void;
    const { w, posts } = await setup((url) => url.includes("/one/approve-batch-item") ? new Promise<Reply>(r => { finish = r; }) : undefined);
    await selectAll(w);await w.get('[data-testid="proposal-batch-approve"]').trigger("click");await confirm(w);
    expect(posts()).toHaveLength(2);w.unmount();wrapper = undefined;
    finish({ body: { revisionId: H2 } });await flushPromises();expect(posts()).toHaveLength(2);
  });
});
