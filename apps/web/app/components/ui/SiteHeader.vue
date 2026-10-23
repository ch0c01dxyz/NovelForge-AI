<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { ApiError, useApi } from "../../composables/useApi";
import LanguageMenu from "./LanguageMenu.vue";
import BrandLogo from "./BrandLogo.vue";
import ActionMenu from "./ActionMenu.vue";
import AccountProfileDialog from "../author/AccountProfileDialog.vue";
const { t } = useLocale();
const { api } = useApi();
const route = useRoute();
const mobileOpen = ref(false), mobileToggle = ref<HTMLButtonElement | null>(null);
const state = ref<"loading" | "guest" | "member" | "failed">("loading");
const profile = ref<{ displayName: string; email: string } | null>(null);
const platformRole = ref<string | null>(null), signingOut = ref(false), error = ref("");
const profileOpen = ref(false), accountMenu = ref<InstanceType<typeof ActionMenu> | null>(null);
const initials = computed(() => profile.value?.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "N");
const browsing = computed(() => route.path === "/browse" || route.path.startsWith("/read"));
let epoch = 0;
async function loadSession() {
  const stamp = ++epoch; state.value = "loading"; error.value = "";
  try {
    const session = await api<{ userId: string; platformRole?: string | null; profile?: { displayName: string; email: string } | null }>("/auth/session");
    if (stamp !== epoch) return;
    state.value = typeof session?.userId === "string" && session.userId ? "member" : "guest";
    profile.value = state.value === "member" && typeof session.profile?.displayName === "string" && typeof session.profile?.email === "string" ? session.profile : null;
    platformRole.value = state.value === "member" ? session.platformRole ?? null : null;
  } catch (e) {
    if (stamp !== epoch) return;
    state.value = e instanceof ApiError && e.status === 401 ? "guest" : "failed";
    profile.value = null; platformRole.value = null;
  }
}
async function closeProfile() {
  profileOpen.value = false; await nextTick(); accountMenu.value?.$el.querySelector("summary")?.focus();
}
async function closeMobile() {
  if (!mobileOpen.value) return;
  mobileOpen.value = false; await nextTick(); mobileToggle.value?.focus();
}
async function signOut() {
  if (signingOut.value) return;
  const stamp = epoch; signingOut.value = true; error.value = "";
  try {
    await api("/auth/logout", { method: "POST" });
    if (stamp !== epoch) return;
    state.value = "guest"; profile.value = null; platformRole.value = null; mobileOpen.value = false; profileOpen.value = false;
    await navigateTo("/browse");
  } catch { if (stamp === epoch) error.value = t("authorHome.signOutError"); }
  finally { if (stamp === epoch) signingOut.value = false; }
}
watch(() => route.path, () => { mobileOpen.value = false; });
onMounted(() => { void loadSession(); });
onUnmounted(() => { epoch++; });
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-nf-border bg-nf-bg-1 shadow-nf-sm"
    @keydown.esc="closeMobile"
  >
    <div class="mx-auto flex min-h-[56px] max-w-[1200px] items-center gap-3 px-3 py-1.5 sm:px-5">
    <NuxtLink
      to="/"
      class="flex shrink-0 items-center gap-2.5 rounded-md text-[14.5px] font-semibold tracking-tight focus-visible:nf-focus"
    >
      <BrandLogo compact />
    </NuxtLink>
    <nav
      :aria-label="t('authorHome.navigation')"
      class="ml-5 hidden items-center gap-1 text-[13px] text-nf-text-dim md:flex"
    >
      <NuxtLink to="/browse" :aria-current="browsing ? 'page' : undefined" class="rounded-lg px-3 py-2 transition-colors hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus" :class="browsing ? 'bg-nf-accent-dim text-nf-accent-hi' : ''">{{ t("discover.browseSection") }}</NuxtLink>
      <NuxtLink to="/author" class="rounded-lg px-3 py-2 transition-colors hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus">{{ t("authorHome.title") }}</NuxtLink>
    </nav>
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <LanguageMenu class="nf-site-language" />
      <NuxtLink v-if="state === 'guest'" to="/login" :aria-label="t('readerTools.signIn')" :title="t('readerTools.signIn')" class="inline-flex min-h-9 items-center gap-2 rounded-lg border border-nf-accent-border bg-nf-accent px-2.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4 shrink-0" aria-hidden="true"><path d="M12 3h4v14h-4M3 10h9m-3-3 3 3-3 3" /></svg><span class="hidden sm:inline">{{ t('readerTools.signIn') }}</span>
      </NuxtLink>
      <ActionMenu v-else-if="state === 'member'" ref="accountMenu" :label="t('accountProfile.menu')" class="nf-site-account" data-testid="site-account-menu">
        <template #trigger><span class="grid size-7 place-items-center rounded-full border border-nf-border-strong bg-nf-bg-2 text-[11px] font-semibold text-nf-text" aria-hidden="true">{{ initials }}</span></template>
        <div class="border-b border-nf-border px-3 py-3"><p class="break-words text-[13px] font-semibold">{{ profile?.displayName || t('accountProfile.title') }}</p><p v-if="profile" class="mt-1 break-all text-[11px] text-nf-text-dim">{{ profile.email }}</p></div>
        <button type="button" data-testid="site-account-profile" @click="profileOpen = true">{{ t('accountProfile.title') }}</button>
        <NuxtLink v-if="platformRole === 'SUPER_ADMIN'" to="/admin">{{ t('platformAdmin.title') }}</NuxtLink>
        <button type="button" data-testid="site-account-logout" :disabled="signingOut" class="text-nf-error disabled:opacity-50" @click="signOut">{{ t('authorHome.signOut') }}</button>
      </ActionMenu>
      <span v-else-if="state === 'loading'" role="status" :aria-label="t('common.loading')" class="size-9 rounded-lg border border-nf-border bg-nf-bg-2" />
      <button v-else type="button" :aria-label="t('siteHeader.retrySession')" :title="t('siteHeader.retrySession')" class="grid size-9 place-items-center rounded-lg border border-nf-border-strong text-nf-text-dim focus-visible:nf-focus" @click="loadSession"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4" aria-hidden="true"><path d="M16 7a6 6 0 1 0 0 6M16 3v4h-4" /></svg></button>
      <button ref="mobileToggle" type="button" data-testid="site-navigation-toggle" :aria-expanded="mobileOpen" aria-controls="site-mobile-navigation" :aria-label="t(mobileOpen ? 'siteHeader.closeNavigation' : 'siteHeader.openNavigation')" class="grid size-9 place-items-center rounded-lg border border-nf-border-strong text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus md:hidden" @click="mobileOpen = !mobileOpen">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="size-5" aria-hidden="true"><path :d="mobileOpen ? 'm5 5 10 10M5 15 15 5' : 'M3 5h14M3 10h14M3 15h14'" /></svg>
      </button>
    </div>
    </div>
    <nav v-if="mobileOpen" id="site-mobile-navigation" :aria-label="t('authorHome.navigation')" class="space-y-1 border-t border-nf-border p-3 text-sm text-nf-text-dim md:hidden">
      <NuxtLink to="/browse" :aria-current="browsing ? 'page' : undefined" class="block rounded-lg px-3 py-2.5 hover:bg-nf-bg-2 focus-visible:nf-focus" :class="browsing ? 'bg-nf-accent-dim text-nf-accent-hi' : ''" @click="mobileOpen = false">{{ t('discover.browseSection') }}</NuxtLink>
      <NuxtLink to="/author" class="block rounded-lg px-3 py-2.5 hover:bg-nf-bg-2 focus-visible:nf-focus" @click="mobileOpen = false">{{ t('authorHome.title') }}</NuxtLink>
    </nav>
    <p v-if="error || state === 'failed'" role="alert" class="mx-auto max-w-[1200px] px-4 pb-2 text-xs text-nf-warn">{{ error || t('siteHeader.sessionFailed') }}</p>
  </header>
  <AccountProfileDialog v-if="profileOpen" :profile="profile" @close="closeProfile" />
</template>

<style scoped>
.nf-site-account :deep(summary) { padding: 4px 6px; }
.nf-site-account :deep(.nf-menu-panel) { left: auto; right: 0; }
@media (max-width: 767px) {
  .nf-site-language :deep(.nf-menu-panel) { left: 0; right: auto; width: 180px; min-width: 180px; }
}
</style>
