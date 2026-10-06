/**
 * ImportDialog component tests (NF-WF-017A): the author-facing import UI.
 *
 * - Renders file/paste tabs; file input detects format by extension.
 * - Manual format override is honored.
 * - Successful file import calls the multipart route and shows the
 *   success report (chapters + skip notices).
 * - Typed 400 codes map to error strings; unknown codes fall back.
 * - Paste tab posts the frozen JSON {text, format} shape.
 * - Esc dismisses; the submit is disabled until a file/text is present.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ImportDialog from "./ImportDialog.vue";

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

const apiCalls: Array<{ path: string; init?: RequestInit }> = [];
// NOTE: the mock factory is hoisted, so ApiError is defined INSIDE the
// factory — importing the real class at module top would hit the
// "accessed before initialization" trap.
vi.mock("../../composables/useApi", () => {
  class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(`${status} ${code}`);
      this.name = "ApiError";
    }
  }
  return {
    useApi: () => ({
      api: async <T,>(path: string, init?: RequestInit): Promise<T> => {
        apiCalls.push({ path, init });
        const fail = (globalThis as { __importFail?: string }).__importFail;
        if (fail) throw new ApiError(fail, 400);
        return { created: 2, skipped: ["1 table dropped"] } as T;
      },
    }),
    ApiError,
  };
});

beforeEach(() => {
  apiCalls.length = 0;
  delete (globalThis as { __importFail?: string }).__importFail;
});

function mountDialog() {
  return mount(ImportDialog, {
    props: { open: true, workspaceId: "ws-1", novelId: "nov-1" },
    attachTo: document.body,
  });
}

function setFile(wrapper: ReturnType<typeof mount>, name: string, type: string, content = "x") {
  const input = wrapper.find('[data-testid="import-file-input"]');
  const file = new File([content], name, { type });
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  return input.trigger("change");
}

describe("ImportDialog", () => {
  it("detects format by extension and enables submit", async () => {
    const wrapper = mountDialog();
    await setFile(wrapper, "novel.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(wrapper.find('[data-testid="import-detected"]').text()).toContain("format=DOCX");
    expect((wrapper.find('[data-testid="import-submit"]').element as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });

  it("keeps submit disabled without a file", () => {
    const wrapper = mountDialog();
    expect((wrapper.find('[data-testid="import-submit"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it("manual format override is sent to the file route", async () => {
    const wrapper = mountDialog();
    await setFile(wrapper, "notes.txt", "text/plain", "# Title\nbody");
    await wrapper.find('[data-testid="import-format-override"]').setValue("md");
    await wrapper.find('[data-testid="import-submit"]').trigger("click");
    await flushPromises();
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]!.path).toBe("/workspaces/ws-1/novels/nov-1/chapters/import/file");
    const form = apiCalls[0]!.init!.body as FormData;
    expect(form.get("format")).toBe("md");
    expect((form.get("file") as File).name).toBe("notes.txt");
    // Success report shows chapters + skip notices.
    expect(wrapper.find('[data-testid="import-success"]').text()).toContain("count=2");
    expect(wrapper.text()).toContain("1 table dropped");
    wrapper.unmount();
  });

  it("typed 400 codes map to error keys; unknown codes fall back to generic", async () => {
    (globalThis as { __importFail?: string }).__importFail = "IMPORT_NO_TEXT";
    const wrapper = mountDialog();
    await setFile(wrapper, "scan.pdf", "application/pdf");
    await wrapper.find('[data-testid="import-submit"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="import-error"]').text()).toContain(
      "importExport.import.errors.IMPORT_NO_TEXT",
    );
    wrapper.unmount();

    (globalThis as { __importFail?: string }).__importFail = "SOME_NEW_CODE";
    const wrapper2 = mountDialog();
    await setFile(wrapper2, "scan.pdf", "application/pdf");
    await wrapper2.find('[data-testid="import-submit"]').trigger("click");
    await flushPromises();
    expect(wrapper2.find('[data-testid="import-error"]').text()).toContain(
      "importExport.import.errors.generic|code=SOME_NEW_CODE",
    );
    wrapper2.unmount();
  });

  it("paste tab posts the frozen JSON shape", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="import-tab-paste"]').trigger("click");
    await wrapper.find('[data-testid="import-paste-text"]').setValue("# Title\nbody");
    await wrapper.find('[data-testid="import-submit"]').trigger("click");
    await flushPromises();
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]!.path).toBe("/workspaces/ws-1/novels/nov-1/chapters/import");
    expect(JSON.parse(apiCalls[0]!.init!.body as string)).toEqual({ text: "# Title\nbody", format: "md" });
    wrapper.unmount();
  });

  it("Esc emits close; done emits imported then close", async () => {
    const wrapper = mountDialog();
    await wrapper.find("section[role='dialog']").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();

    const wrapper2 = mountDialog();
    await setFile(wrapper2, "a.txt", "text/plain");
    await wrapper2.find('[data-testid="import-submit"]').trigger("click");
    await flushPromises();
    await wrapper2.find('[data-testid="import-done"]').trigger("click");
    expect(wrapper2.emitted("imported")).toHaveLength(1);
    expect(wrapper2.emitted("close")).toHaveLength(1);
    wrapper2.unmount();
  });
});
