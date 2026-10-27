import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { axe } from "vitest-axe";
import Dialog from "./NovelDecodeDialog.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

const state = vi.hoisted(() => ({ locale: "en", api: vi.fn() }));
vi.mock("../../composables/useApi", async importOriginal => ({
  ...await importOriginal<typeof import("../../composables/useApi")>(),
  useApi: () => ({ api: state.api }),
}));
function translate(path: string, params?: Record<string, string | number>) {
  const lookup = (source: unknown) => path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source);
  const value = lookup(state.locale === "id" ? id : en) ?? lookup(en) ?? path;
  if (typeof value !== "string") return path;
  let rendered = value;
  if (params) for (const [key, item] of Object.entries(params)) rendered = rendered.replaceAll(`{${key}}`, String(item));
  return rendered;
}
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: translate }) }));

const base = "/workspaces/ws/novel-decodes";
const areas = ["SYNOPSIS", "OUTLINE", "STYLE", "CHARACTER", "CHARACTER_STATE", "CHARACTER_ARC", "RELATIONSHIP", "WORLD", "TIMELINE", "RESEARCH", "NARRATIVE", "ENDGAME", "CANON"];
const preview = { archiveHash: "archive-hash", warnings: ["Filename order checked"], novels: [
  { root: "wrapper/one", title: "First novel", chapterCount: 2, firstSourceNumber: 0, lastSourceNumber: 1, hasCover: true, warnings: [] },
  { root: "wrapper/two", title: "Second novel", chapterCount: 1, firstSourceNumber: 0, lastSourceNumber: 0, hasCover: false, warnings: ["Cover unavailable"] },
] };
const jobFixture = { id: "job", novelId: "new-private-novel", novelTitle: "Imported novel", status: "REVIEW", areas, totalChunks: 4, completedChunks: 4, candidateCount: 2, errorCode: null, unknowns: [], coverage: {}, expectedHeadRevisionId: "head-1", createdAt: "2026-10-27T00:00:00Z" };
const candidateFixture = { id: "candidate", area: "CHARACTER", title: "Ari", summary: "A source-supported character", subject: "Ari", target: null, chapterNumber: 0, citations: [{ chapterVersionId: "source-version", chapterNumber: 0, quote: "Ari stood beside the river." }], status: "PENDING", version: 1, result: null };
let job: Omit<typeof jobFixture, "errorCode" | "unknowns"> & { errorCode: string | null; unknowns: unknown } = structuredClone(jobFixture);
let rows: Array<typeof candidateFixture & { details?: Record<string, unknown> }> = [structuredClone(candidateFixture), { ...structuredClone(candidateFixture), id: "second" }];
let wrapper: VueWrapper | undefined;
function defaultApi(path: string, init?: RequestInit): unknown {
  if (path === `${base}/preview`) return structuredClone(preview);
  if (path === base && init?.method === "POST") return { job: structuredClone(job) };
  if (path === base) return { jobs: [] };
  if (path === `${base}/job`) return { job: structuredClone(job) };
  if (path.startsWith(`${base}/job/candidates?`)) return { candidates: structuredClone(rows), total: rows.length };
  if (path.endsWith("/approve") || path.endsWith("/reject")) {
    const candidateId = path.split("/").at(-2);
    rows = rows.map(row => row.id === candidateId ? { ...row, status: path.endsWith("/approve") ? "APPROVED" : "REJECTED", version: row.version + 1 } : row);
    job.expectedHeadRevisionId = "head-2";
    return { candidate: rows.find(row => row.id === candidateId) };
  }
  if (init?.method === "PATCH") {
    const input = JSON.parse(init.body as string);
    rows[0] = { ...rows[0]!, title: input.title, summary: input.summary, subject: input.subject, target: input.target, version: rows[0]!.version + 1 };
    return { candidate: rows[0] };
  }
  if (path.endsWith("/retry") || path.endsWith("/cancel")) return { job: { ...job, status: path.endsWith("/retry") ? "RUNNING" : "CANCELLED" } };
  throw Error(`Unexpected test request: ${path}`);
}
function open() {
  wrapper = mount(Dialog, { props: { open: true, workspaceId: "ws" }, attachTo: document.body,
    global: { stubs: { NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' } } } });
  return wrapper;
}
async function upload(w: VueWrapper) {
  const input = w.get('[data-testid="decode-file"]');
  Object.defineProperty(input.element, "files", { value: [new File(["archive"], "novels.zip", { type: "application/zip" })], configurable: true });
  await input.trigger("change"); await flushPromises();
}
async function create(w: VueWrapper) {
  await w.get('[data-testid="decode-create"]').trigger("click");
  await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises();
}
async function button(w: VueWrapper, label: string) {
  const found = w.findAll("button").find(item => item.text() === label);
  expect(found, `button ${label}`).toBeDefined(); await found!.trigger("click"); await flushPromises();
}
beforeEach(() => {
  sessionStorage.clear();
  state.api.mockReset(); state.api.mockImplementation(async (path, init) => defaultApi(path, init));
  state.locale = "en"; job = structuredClone(jobFixture); rows = [structuredClone(candidateFixture), { ...structuredClone(candidateFixture), id: "second" }];
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); document.body.innerHTML = ""; });

describe("NovelDecodeDialog", () => {
  it("localizes source-validation exclusions with their source chapter", async () => {
    state.locale = "id"; job.unknowns = ["Chapter 2: Source validation excluded 1 unsupported suggestions; none were applied."];
    const w = open(); await upload(w); await create(w);
    expect(w.text()).toContain("1 usulan dikeluarkan");
    expect(w.text()).not.toContain("Source validation excluded");
  });
  it("does not offer a retry that the server forbids for cancelled jobs", async () => {
    job.status = "CANCELLED";
    const w = open(); await upload(w); await create(w);
    expect(w.findAll("button").some(b => b.text() === translate("novelDecode.retryJob"))).toBe(false);
  });
  it("explains an exhausted model response without exposing technical codes", async () => {
    state.locale = "id"; job.status = "FAILED"; job.errorCode = "DECODE_OUTPUT_LIMIT";
    const w = open(); await upload(w); await create(w);
    expect(w.text()).toContain("Model berhenti sebelum analisis selesai");
    expect(w.text()).not.toContain("DECODE_OUTPUT_LIMIT");
  });
  it("reuses the uncertain import ID after a full component remount and archive re-upload", async () => {
    state.api.mockImplementation(async (path, init) => {
      if (path === base && init?.method === "POST") throw new TypeError("Connection lost");
      return defaultApi(path, init);
    });
    const first = open(); await upload(first); await create(first);
    first.unmount(); wrapper = undefined;
    const second = open(); await upload(second); await create(second);
    const calls = state.api.mock.calls.filter(([path, init]) => path === base && init?.method === "POST");
    expect(calls).toHaveLength(2);
    expect((calls[0]![1].body as FormData).get("requestId")).toBe((calls[1]![1].body as FormData).get("requestId"));
  });
  it("previews roots and explicitly creates a NEW private novel with all areas and multipart boundary left to the browser", async () => {
    const w = open(); await upload(w);
    expect(w.get('[data-testid="decode-root"]').findAll("option")).toHaveLength(2);
    expect(w.text()).toContain("source numbers 0–1");
    expect(w.findAll('input[type="checkbox"]')).toHaveLength(13);
    await w.get('[data-testid="decode-root"]').setValue("wrapper/two");
    expect(w.text()).toContain("Cover unavailable");
    await w.get('[data-testid="decode-create"]').trigger("click");
    expect(w.get('[role="alertdialog"]').text()).toContain("NEW private draft");
    expect(state.api.mock.calls.filter(([path, init]) => path === base && init?.method === "POST")).toHaveLength(0);
    await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises();
    const init = state.api.mock.calls.find(([path, options]) => path === base && options?.method === "POST")![1] as RequestInit;
    expect(init.headers).toEqual({}); expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("root")).toBe("wrapper/two"); expect(body.get("archiveHash")).toBe("archive-hash");
    expect(JSON.parse(body.get("areas") as string)).toEqual(areas);
    expect(body.get("requestId")).toMatch(/^[\da-f-]{36}$/);
    expect(w.get('a[href="/workspaces/ws/novels/new-private-novel"]').text()).toBe("Open imported novel");
    expect(w.text()).toContain("Ari stood beside the river.");
  });

  it("retains the same request ID and frozen inputs after an uncertain import, including modal reopen", async () => {
    let imports = 0;
    state.api.mockImplementation(async (path, init) => {
      if (path === base && init?.method === "POST" && imports++ === 0) throw new TypeError("Lost connection including private internal details");
      return defaultApi(path, init);
    });
    const w = open(); await upload(w); await create(w);
    expect(w.get('[role="alert"]').text()).toContain("may already exist");
    expect(w.text()).not.toContain("private internal details");
    expect(w.get('[data-testid="decode-file"]').attributes("disabled")).toBeDefined();
    expect(w.get('[data-testid="decode-root"]').attributes("disabled")).toBeDefined();
    await w.setProps({ open: false }); await w.setProps({ open: true }); await flushPromises(); await create(w);
    const calls = state.api.mock.calls.filter(([path, init]) => path === base && init?.method === "POST");
    expect(calls).toHaveLength(2);
    expect((calls[0]![1].body as FormData).get("requestId")).toBe((calls[1]![1].body as FormData).get("requestId"));
    expect((calls[1]![1].body as FormData).get("root")).toBe("wrapper/one");
  });

  it("discards a late preview response after the workspace changes", async () => {
    let resolvePreview!: (value: typeof preview) => void;
    state.api.mockImplementation(async (path, init) => {
      if (path === `${base}/preview`) return await new Promise(resolve => { resolvePreview = resolve; });
      if (path === "/workspaces/other/novel-decodes") return { jobs: [] };
      return defaultApi(path, init);
    });
    const w = open();
    const input = w.get('[data-testid="decode-file"]');
    Object.defineProperty(input.element, "files", { value: [new File(["archive"], "novels.zip")], configurable: true });
    await input.trigger("change"); await w.setProps({ workspaceId: "other" });
    resolvePreview(preview); await flushPromises();
    expect(w.find('[data-testid="decode-root"]').exists()).toBe(false);
    expect(w.text()).not.toContain("First novel");
  });

  it("requires at least one analysis area and distinguishes missing coverage from unselected areas", async () => {
    job.areas = ["WORLD"];
    const w = open(); await upload(w);
    for (const checkbox of w.findAll('input[type="checkbox"]')) await checkbox.setValue(false);
    expect(w.get('[data-testid="decode-create"]').attributes("disabled")).toBeDefined();
    await w.findAll('input[type="checkbox"]')[7]!.setValue(true); await create(w);
    expect(w.text()).toContain("World, lore & groups: no analysis coverage reported yet");
    expect(w.text()).toContain("Synopsis: not selected");
  });

  it("saves edits with the viewed version and reloads the job head between author decisions", async () => {
    const w = open(); await upload(w); await create(w);
    await button(w, "Edit");
    await w.get('[data-testid="decode-edit-title"]').setValue("Ari updated");
    await button(w, "Save");
    const edit = state.api.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(edit[1].body)).toMatchObject({ expectedVersion: 1, title: "Ari updated", subject: "Ari", target: null });
    const quote = w.get('[data-testid="decode-candidate-candidate"]').text(); expect(quote).toContain("Ari stood beside the river.");
    await button(w, "Approve");
    const approval = state.api.mock.calls.find(([path]) => path.endsWith("/candidate/approve"))!;
    expect(JSON.parse(approval[1].body)).toEqual({ expectedVersion: 2, expectedHeadRevisionId: "head-1" });
    const second = w.get('[data-testid="decode-candidate-second"]');
    await second.findAll("button").find(item => item.text() === "Reject")!.trigger("click"); await flushPromises();
    const rejection = state.api.mock.calls.find(([path]) => path.endsWith("/second/reject"))!;
    expect(JSON.parse(rejection[1].body)).toEqual({ expectedVersion: 1, expectedHeadRevisionId: "head-2" });
  });

  it("uses the editor's original version when a background refresh discovers a concurrent candidate edit", async () => {
    const w = open(); await upload(w); await create(w); await button(w, "Edit");
    rows[0]!.version = 7;
    await button(w, "Refresh");
    await w.get('[data-testid="decode-edit-title"]').setValue("My retained edit");
    await button(w, "Save");
    const edit = state.api.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(edit[1].body).expectedVersion).toBe(1);
  });

  it("edits native enum details while preserving other details and immutable source evidence", async () => {
    rows = [{ ...structuredClone(candidateFixture), area: "WORLD", details: { entityKind: "LOCATION", retainedField: "keep" } }];
    job.coverage = { WORLD: { processedChunks: 2, totalChunks: 4, candidates: 1, exhaustive: false } };
    const w = open(); await upload(w); await create(w);
    expect(w.text()).toContain("World element type: Location");
    expect(w.text()).toContain("World, lore & groups: 2/4 sections, 1 suggestions");
    expect(w.text()).toContain("not an exhaustive reconstruction");
    await button(w, "Edit");
    const enumSelect = w.get('[data-testid="decode-candidate-candidate"]').get("select");
    await enumSelect.setValue("FACTION"); await button(w, "Save");
    const edit = state.api.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(edit[1].body).details).toEqual({ entityKind: "FACTION", retainedField: "keep" });
    expect(JSON.parse(edit[1].body)).not.toHaveProperty("citations");
    expect(w.text()).toContain("Ari stood beside the river.");
  });

  it("displays arc milestones without inventing an editor or changing their source chapter boundaries", async () => {
    const milestones = [{ chapterNumber: 1, summary: "First observed change" }, { chapterNumber: 3, summary: "Later observed change" }];
    rows = [{ ...structuredClone(candidateFixture), area: "CHARACTER_ARC", details: { milestones } }];
    const w = open(); await upload(w); await create(w); await button(w, "Edit");
    expect(w.text()).toContain("Source chapter 1 · First observed change");
    expect(w.text()).toContain("Source chapter 3 · Later observed change");
    await button(w, "Save");
    const edit = state.api.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(edit[1].body).details.milestones).toEqual(milestones);
  });

  it("localizes stale failures without displaying machine errors or swallowing the source evidence", async () => {
    state.locale = "id";
    state.api.mockImplementation(async (path, init) => {
      if (path.endsWith("/approve")) throw new ApiError("DECODE_HEAD_REVISION_CHANGED_PRIVATE", 409);
      return defaultApi(path, init);
    });
    const w = open(); await upload(w); await create(w); await button(w, "Setujui");
    expect(w.get('[role="alert"]').text()).toContain("telah berubah");
    expect(w.text()).not.toContain("DECODE_HEAD_REVISION_CHANGED_PRIVATE");
    expect(w.text()).toContain("Ari stood beside the river.");
  });

  it("polls only while open and running; retry and cancel remain explicit", async () => {
    vi.useFakeTimers(); job.status = "RUNNING"; job.completedChunks = 1;
    state.api.mockImplementation(async (path, init) => path === base && !init?.method ? { jobs: [structuredClone(job)] } : defaultApi(path, init));
    const w = open(); await flushPromises(); await button(w, "Imported novelAnalyzing");
    const before = state.api.mock.calls.filter(([path]) => path === `${base}/job`).length;
    await vi.advanceTimersByTimeAsync(3001); await flushPromises();
    expect(state.api.mock.calls.filter(([path]) => path === `${base}/job`).length).toBeGreaterThan(before);
    expect(state.api.mock.calls.some(([path]) => path.endsWith("/retry") || path.endsWith("/cancel"))).toBe(false);
    await w.setProps({ open: false });
    const closed = state.api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000); expect(state.api.mock.calls).toHaveLength(closed);
    await w.setProps({ open: true }); await flushPromises();
    await button(w, "Stop analysis"); await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises();
    expect(state.api.mock.calls.filter(([path]) => path.endsWith("/cancel"))).toHaveLength(1);
    expect(w.findAll("button").some(b => b.text() === "Resume analysis")).toBe(false);
    job.status = "FAILED"; await button(w, "Refresh");
    await button(w, "Resume analysis");
    expect(state.api.mock.calls.filter(([path]) => path.endsWith("/retry"))).toHaveLength(1);
    const beforeUnmount = state.api.mock.calls.length;
    w.unmount(); wrapper = undefined;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.api.mock.calls).toHaveLength(beforeUnmount);
  });

  it("filters and pages suggestions on the server", async () => {
    state.api.mockImplementation(async (path, init) => path.includes("/candidates?") ? { candidates: [candidateFixture], total: 23 } : defaultApi(path, init));
    const w = open(); await upload(w); await create(w);
    const selects = w.findAll("select");
    await selects[0]!.setValue("RESEARCH"); await flushPromises();
    await button(w, "Next");
    const request = state.api.mock.calls.filter(([path]) => path.includes("/candidates?")).at(-1)![0];
    expect(request).toContain("area=RESEARCH"); expect(request).toContain("status=PENDING"); expect(request).toContain("skip=10");
  });

  it("traps keyboard focus, closes safely and does not intercept Escape when closed", async () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    const w = open(); await flushPromises();
    const section = w.get('[role="dialog"]').element;
    expect(document.activeElement).toBe(section);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(section.contains(document.activeElement)).toBe(true);
    await w.get('[data-testid="decode-backdrop"]').trigger("click"); expect(w.emitted("close")).toHaveLength(1);
    await w.setProps({ open: false }); expect(document.activeElement).toBe(opener);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["en", "id"])("renders translated preview and review states without WCAG AA violations (%s)", async locale => {
    state.locale = locale;
    const w = open(); await upload(w);
    expect(w.text()).not.toContain("novelDecode.");
    expect(w.text()).toContain(locale === "id" ? "Sinopsis" : "Synopsis");
    const options = { runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] } };
    expect((await axe(w.element, options)).violations).toEqual([]);
    await create(w);
    expect((await axe(w.element, options)).violations).toEqual([]);
  });
});
