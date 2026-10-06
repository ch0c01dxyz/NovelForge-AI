/**
 * ExportPicker component tests (NF-WF-017B): the author-facing export UI.
 *
 * - Renders the five retained export formats; md is the default.
 * - Format selection changes the download URL's ?format= param.
 * - Download fetches the export route and triggers an anchor download.
 * - EXPORT_TOO_LARGE maps to the actionable error string; unknown
 *   codes fall back to the generic message.
 * - Esc dismisses; backdrop click cancels.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ExportPicker from "./ExportPicker.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const fetchCalls: string[] = [];
let fetchBehavior: "ok" | "too-large" | "unknown" = "ok";

beforeEach(() => {
  fetchCalls.length = 0;
  fetchBehavior = "ok";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetchCalls.push(url);
      if (fetchBehavior === "ok") {
        return {
          ok: true,
          blob: async () => new Blob(["fake-export"], { type: "text/markdown" }),
        };
      }
      return {
        ok: false,
        json: async () =>
          fetchBehavior === "too-large" ? { error: "EXPORT_TOO_LARGE" } : { error: "BOOM" },
      };
    }),
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function mountPicker() {
  const clicks: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.href);
  });
  const wrapper = mount(ExportPicker, {
    props: { open: true, workspaceId: "ws1", novelId: "n1" },
    attachTo: document.body,
  });
  return { wrapper, clicks };
}

describe("ExportPicker", () => {
  it("renders all five retained formats with md selected by default", () => {
    const { wrapper } = mountPicker();
    for (const f of ["md", "txt", "docx", "pdf", "epub"]) {
      expect(wrapper.find(`[data-testid="export-format-${f}"]`).exists()).toBe(true);
    }
    const selected = wrapper.find('input[name="export-format"]:checked');
    expect((selected.element as HTMLInputElement).value).toBe("md");
  });

  it("downloads the selected format via the export route", async () => {
    const { wrapper, clicks } = mountPicker();
    await wrapper.find('[data-testid="export-format-epub"] input').setValue("epub");
    await wrapper.find('[data-testid="export-download"]').trigger("click");
    await flushPromises();
    expect(fetchCalls).toEqual(["/api/workspaces/ws1/novels/n1/export?format=epub"]);
    expect(clicks).toEqual(["blob:fake"]);
  });

  it("maps EXPORT_TOO_LARGE to the actionable error and stays open", async () => {
    fetchBehavior = "too-large";
    const { wrapper } = mountPicker();
    await wrapper.find('[data-testid="export-download"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="export-error"]').text()).toBe(
      "importExport.export.errors.EXPORT_TOO_LARGE",
    );
  });

  it("falls back to the generic message for unknown codes", async () => {
    fetchBehavior = "unknown";
    const { wrapper } = mountPicker();
    await wrapper.find('[data-testid="export-download"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="export-error"]').text()).toContain(
      "importExport.export.errors.generic",
    );
  });

  it("Esc dismisses and emits close", async () => {
    const { wrapper } = mountPicker();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("backdrop click cancels", async () => {
    const { wrapper } = mountPicker();
    await wrapper.find('[data-testid="export-backdrop"]').trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});
