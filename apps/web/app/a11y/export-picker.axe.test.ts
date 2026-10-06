/**
 * Accessibility tests (NF-WF-017B, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on the ExportPicker in both
 * locales, following the 014/015/016/017A apps/web/app/a11y precedent.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axe, configureAxe } from "vitest-axe";
import ExportPicker from "../components/import-export/ExportPicker.vue";
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
] as const)("ExportPicker axe (%s)", (localeName, locale) => {
  it("has zero axe violations", async () => {
    currentT = tFor(locale);
    const wrapper = mount(ExportPicker, {
      props: { open: true, workspaceId: "ws1", novelId: "n1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });
});
