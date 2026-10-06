/**
 * Accessibility tests (NF-WF-017A, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on the ImportDialog in both
 * locales, following the 014/015/016 apps/web/app/a11y precedent.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axe, configureAxe } from "vitest-axe";
import ImportDialog from "../components/import-export/ImportDialog.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string = tFor(en);

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

vi.mock("../composables/useApi", () => ({
  useApi: () => ({ api: async () => ({ created: 1, skipped: [] }) }),
  ApiError: class ApiError extends Error {},
}));

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe.each([
  ["en", en],
  ["id", id],
] as const)("ImportDialog axe (%s)", (_name, locale) => {
  it("has zero WCAG 2.2 AA violations", async () => {
    currentT = tFor(locale);
    const wrapper = mount(ImportDialog, {
      props: { open: true, workspaceId: "ws-1", novelId: "nov-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
