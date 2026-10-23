import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { reactive, ref } from "vue";
import SiteHeader from "./SiteHeader.vue";
import AccountProfileDialog from "../author/AccountProfileDialog.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
const locale = ref("en"), route = reactive({ path: "/browse" });
const navigate = vi.fn();
vi.stubGlobal("useRoute", () => route);
vi.stubGlobal("navigateTo", navigate);
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ locale, setLocale: (value: string) => { locale.value = value; }, t: (key: string) => {
  const read = (dictionary: unknown) => key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], dictionary);
  return read(locale.value === 'id' ? id : en) ?? read(en) ?? key;
} }) }));
const wrappers: VueWrapper[] = [];
const session = { userId: 'owner', platformRole: 'SUPER_ADMIN', profile: { displayName: 'Egar Rizki', email: 'owner@example.invalid' } };
function render() {
  const w = mount(SiteHeader, { attachTo: document.body, global: { stubs: { BrandLogo: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
  wrappers.push(w); return w;
}
beforeEach(() => { locale.value = 'en'; route.path = '/browse'; api.mockReset().mockRejectedValue(new ApiError('UNAUTHENTICATED', 401)); navigate.mockReset(); });
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); });
describe('shared public site header', () => {
  it.each([['en', 'Sign in', 'Open navigation'], ['id', 'Masuk', 'Buka navigasi']])('renders guest controls and selected route in %s', async (language, signIn, open) => {
    locale.value = language; const w = render(); await flushPromises();
    expect(w.get('a[href="/login"]').attributes('aria-label')).toBe(signIn);
    expect(w.get('[data-testid="site-navigation-toggle"]').attributes('aria-label')).toBe(open);
    expect(w.get('a[href="/browse"]').attributes('aria-current')).toBe('page');
    expect(w.find('[data-testid="site-account-menu"]').exists()).toBe(false);
    expect(w.text()).not.toMatch(/siteHeader\.|accountProfile\./);
  });
  it('opens mobile navigation, restores toggle focus on Escape and closes on route change', async () => {
    const w = render(); await flushPromises(); const button = w.get('[data-testid="site-navigation-toggle"]');
    await button.trigger('click'); expect(button.attributes('aria-expanded')).toBe('true');
    expect(w.find('#site-mobile-navigation a[href="/author"]').exists()).toBe(true);
    await w.get('#site-mobile-navigation').trigger('keydown', { key: 'Escape' }); await flushPromises();
    expect(w.find('#site-mobile-navigation').exists()).toBe(false); expect(document.activeElement).toBe(button.element);
    await button.trigger('click'); route.path = '/read/novel'; await flushPromises();
    expect(button.attributes('aria-expanded')).toBe('false');
  });
  it('uses a confirmed account/profile and hides the sign-in action; admin entry follows the reported role', async () => {
    api.mockResolvedValue(session); const w = render(); await flushPromises();
    expect(w.find('a[href="/login"]').exists()).toBe(false);
    expect(w.get('[data-testid="site-account-menu"]').text()).toContain('Egar Rizki');
    expect(w.find('a[href="/admin"]').exists()).toBe(true);
    await w.get('[data-testid="site-account-profile"]').trigger('click');
    expect(w.findComponent(AccountProfileDialog).props('profile')).toEqual(session.profile);
    w.findComponent(AccountProfileDialog).vm.$emit('close'); await flushPromises();
    expect(document.activeElement).toBe(w.get('[data-testid="site-account-menu"] summary').element);
  });
  it('does not infer authentication from malformed session data and never shows admin for ordinary members', async () => {
    api.mockResolvedValueOnce({ profile: session.profile, platformRole: 'SUPER_ADMIN' });
    const guest = render(); await flushPromises(); expect(guest.find('a[href="/admin"]').exists()).toBe(false);
    api.mockResolvedValueOnce({ ...session, platformRole: null }); const member = render(); await flushPromises();
    expect(member.find('a[href="/admin"]').exists()).toBe(false);
    expect(member.find('[data-testid="site-account-logout"]').exists()).toBe(true);
  });
  it('offers explicit retry for session failure and preserves account state when logout fails', async () => {
    api.mockRejectedValueOnce(new Error('Network')); const w = render(); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Account details');
    api.mockResolvedValueOnce(session); await w.get('button[aria-label="Reload account menu"]').trigger('click'); await flushPromises();
    api.mockRejectedValueOnce(new Error('Network')); await w.get('[data-testid="site-account-logout"]').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="site-account-menu"]').exists()).toBe(true); expect(navigate).not.toHaveBeenCalled();
    expect(w.get('[role="alert"]').text()).toBe(en.authorHome.signOutError);
    api.mockResolvedValueOnce(undefined); await w.get('[data-testid="site-account-logout"]').trigger('click'); await flushPromises();
    expect(navigate).toHaveBeenCalledWith('/browse'); expect(w.find('a[href="/login"]').exists()).toBe(true);
  });
  it('ignores a late session response after unmount', async () => {
    let resolve!: (value: unknown) => void; api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const w = render(); w.unmount(); resolve(session); await flushPromises(); expect(navigate).not.toHaveBeenCalled();
  });
});
