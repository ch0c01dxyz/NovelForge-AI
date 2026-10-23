import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ReaderControls from "./ReaderControls.vue";
import { DEFAULT_READER_PREFERENCES } from "../../utils/readerPreferences";
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const link = { props: ["to"], template: '<a :href="to"><slot /></a>' };
let wrapper: VueWrapper;
function render(visible = true) {
  wrapper = mount(ReaderControls, { attachTo: document.body, props: {
    slug: "a-book", novelTitle: "A book", chapter: { number: 2, title: "River" },
    chapters: [{ number: 1, title: "Morning" }, { number: 2, title: "River" }, { number: 3, title: "Night" }],
    prevChapter: { number: 1, title: "Morning" }, nextChapter: { number: 3, title: "Night" }, visible,
  }, slots: { comments: '<textarea data-testid="comment-draft" />' }, global: { stubs: { NuxtLink: link } } });
  return wrapper;
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close"); document.body.innerHTML = ""; });
describe("floating reader controls", () => {
  it("provides an explicit toggle when controls are hidden", async () => {
    const w = render(false); await w.get('[data-testid="reader-show-controls"]').trigger('click');
    expect(w.emitted('toggle')).toHaveLength(1);
    expect(w.find('[data-testid="reader-bottom-controls"]').exists()).toBe(false);
  });
  it("uses published navigation, browse home and novel detail links", () => {
    const w = render();
    expect(w.get('a[aria-label="reader.prevChapter"]').attributes('href')).toBe('/read/a-book/1');
    expect(w.get('a[aria-label="reader.nextChapter"]').attributes('href')).toBe('/read/a-book/3');
    expect(w.findAll('a[href="/browse"]')).toHaveLength(2);
    expect(w.get('a[aria-label="reader.backToNovel"]').attributes('href')).toBe('/read/a-book');
  });
  it("filters chapter titles and numbers, sorts and marks the current chapter", async () => {
    const w = render(); await w.get('[data-testid="reader-chapters"]').trigger('click'); await flushPromises();
    const dialog = w.get('dialog[aria-label="readerTools.chapters"]');
    expect((dialog.element as HTMLDialogElement).open).toBe(true);
    expect(dialog.get('a[aria-current="page"]').attributes('href')).toBe('/read/a-book/2');
    await dialog.get('input[type="search"]').setValue('Night');
    expect(dialog.findAll('nav a')).toHaveLength(1);
    await dialog.get('input[type="search"]').setValue('');
    await dialog.get('select').setValue('true');
    expect(dialog.findAll('nav a')[0]!.attributes('href')).toBe('/read/a-book/3');
    await dialog.get('input[type="search"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect((dialog.element as HTMLDialogElement).open).toBe(false);
  });
  it("previews settings, restores on cancel and persists on save", async () => {
    const w = render(); await flushPromises();
    await w.get('[data-testid="reader-settings"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="reader-size"]').setValue(25);
    expect(w.emitted('preferences')!.at(-1)![0]).toMatchObject({ size: 25 });
    await w.get('dialog[aria-label="readerTools.settings"] button[aria-label="readerTools.close"]').trigger('click'); await flushPromises();
    expect(w.emitted('preferences')!.at(-1)![0]).toEqual(DEFAULT_READER_PREFERENCES);
    await w.get('[data-testid="reader-settings"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="reader-size"]').setValue(23);
    await w.get('form').trigger('submit'); await flushPromises();
    expect(JSON.parse(localStorage.getItem('novelforge.readerPreferences.v1')!)).toMatchObject({ size: 23 });
  });
  it("retains the comment composer when the modal closes and reopens", async () => {
    const w = render(); await w.get('[data-testid="reader-comments"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="comment-draft"]').setValue('A thoughtful comment');
    await w.get('dialog[aria-label="comments.title"] button[aria-label="readerTools.close"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="reader-comments"]').trigger('click'); await flushPromises();
    expect((w.get('[data-testid="comment-draft"]').element as HTMLTextAreaElement).value).toBe('A thoughtful comment');
  });
});
