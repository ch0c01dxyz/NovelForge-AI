/**
 * GenerationLedger component tests (NF-WF-018C).
 *
 * - Lists generations with task/profile/status/tokens/latency/error
 *   category; the honest "no cost accounting" label is present and no
 *   cost column exists anywhere in the table (contract Invariant 4, Q3).
 * - Selecting a row loads the detail with per-attempt rows
 *   (gateway, model, status, latency).
 * - The status filter narrows the rows client-side.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GenerationLedger from "./GenerationLedger.vue";
import { en } from "../../i18n/en";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => {
    const t = (path: string) => {
      const parts = path.split(".");
      let node: unknown = en;
      for (const p of parts) node = (node as Record<string, unknown>)?.[p];
      return typeof node === "string" ? node : path;
    };
    return { t, locale: { value: "en" }, setLocale: vi.fn() };
  },
}));

const generations = [
  {
    id: "gen-1",
    novelId: null,
    userId: "u-1",
    task: "selection.rewrite-tone",
    modelProfile: "CREATIVE_WRITER",
    status: "SUCCEEDED",
    inputTokens: 120,
    outputTokens: 80,
    latencyMs: 900,
    errorCategory: null,
    errorMessage: null,
    createdAt: "2026-10-06T00:00:00Z",
    completedAt: "2026-10-06T00:00:01Z",
  },
  {
    id: "gen-2",
    novelId: null,
    userId: "u-1",
    task: "chapter.draft",
    modelProfile: "CREATIVE_WRITER",
    status: "FAILED",
    inputTokens: 50,
    outputTokens: null,
    latencyMs: 120,
    errorCategory: "DETERMINISTIC",
    errorMessage: "no model is configured for profile CREATIVE_WRITER",
    createdAt: "2026-10-06T01:00:00Z",
    completedAt: "2026-10-06T01:00:01Z",
  },
];

const detail = {
  ...generations[1],
  attempts: [
    {
      attemptNumber: 1,
      gatewayId: "gw-abcdef123456",
      modelId: null,
      status: "FAILED",
      errorCategory: "DETERMINISTIC",
      latencyMs: 120,
    },
  ],
};

const listGenerationsMock = vi.fn();
const getGenerationMock = vi.fn();

vi.mock("../../composables/useReceipts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../composables/useReceipts")>();
  return {
    ...original,
    useReceipts: () => ({
      listGenerations: listGenerationsMock,
      getGeneration: getGenerationMock,
    }),
  };
});

function mountLedger(props: Record<string, unknown> = {}) {
  return mount(GenerationLedger, {
    props: { workspaceId: "ws-1", ...props },
    attachTo: document.body,
  });
}

describe("GenerationLedger", () => {
  it("shows a plain explanation and retains the full error in closed support details", async () => {
    const wrapper = mountLedger();
    await flushPromises();
    await wrapper.findAll("tbody tr")[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(en.run.failedMessage);
    expect(wrapper.get("details").attributes("open")).toBeUndefined();
    expect(wrapper.get("summary").text()).toBe(en.run.technicalDetails);
    expect(wrapper.get("details").text()).toContain(generations[1]!.errorMessage);
    wrapper.unmount();
  });
  beforeEach(() => {
    listGenerationsMock.mockReset().mockResolvedValue(generations);
    getGenerationMock.mockReset().mockResolvedValue(detail);
    document.body.innerHTML = "";
  });

  it("lists generations with the honest no-cost label and no cost column", async () => {
    const wrapper = mountLedger();
    await flushPromises();
    const html = wrapper.html();
    expect(html).toContain("selection.rewrite-tone");
    expect(html).toContain("chapter.draft");
    // The honest label (contract Invariant 4).
    expect(html).toContain("Tokens and latency only — no cost accounting");
    // No cost column anywhere: the table headers must not mention cost.
    const headers = wrapper.findAll("thead th").map((h) => h.text());
    expect(headers.join(" ").toLowerCase()).not.toContain("cost");
    expect(listGenerationsMock).toHaveBeenCalledWith("ws-1", { limit: 100 });
  });

  it("opens the detail with per-attempt rows on row select", async () => {
    const wrapper = mountLedger();
    await flushPromises();
    const rows = wrapper.findAll("tbody tr");
    // Second row = the FAILED generation.
    await rows[1]!.trigger("click");
    await flushPromises();
    expect(getGenerationMock).toHaveBeenCalledWith("ws-1", "gen-2");
    const html = wrapper.html();
    // Attempt row: gateway (truncated id), model, status, latency.
    expect(html).toContain("gw-abcdef");
    expect(html).toContain("120 ms");
    expect(html).toContain("no model is configured for profile CREATIVE_WRITER");
  });

  it("narrows rows with the status filter", async () => {
    const wrapper = mountLedger();
    await flushPromises();
    const select = wrapper.find("select#ledger-status-filter");
    await select.setValue("FAILED");
    await flushPromises();
    const html = wrapper.html();
    expect(html).toContain("chapter.draft");
    expect(html).not.toContain("selection.rewrite-tone");
  });

  it("hides the filter when the status is locked (failure log)", async () => {
    const wrapper = mountLedger({ lockedStatus: "FAILED" });
    await flushPromises();
    expect(wrapper.find("select#ledger-status-filter").exists()).toBe(false);
    const html = wrapper.html();
    expect(html).toContain("chapter.draft");
    expect(html).not.toContain("selection.rewrite-tone");
  });
});
