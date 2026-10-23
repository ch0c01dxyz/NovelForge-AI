<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import ActionMenu from "../components/ui/ActionMenu.vue";
import BrandLogo from "../components/ui/BrandLogo.vue";
import LanguageMenu from "../components/ui/LanguageMenu.vue";
import NovelLibraryCard from "../components/author/NovelLibraryCard.vue";
import AccountProfileDialog from "../components/author/AccountProfileDialog.vue";
import { ApiError, useApi } from "../composables/useApi";
import { useLocale } from "../composables/useLocale";
import NewNovelWizard from "../components/author/NewNovelWizard.vue";
import WorkspaceManagerDialog from "../components/author/WorkspaceManagerDialog.vue";
interface Novel {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
  coverUrl?: string;
}
const { api } = useApi();
const { t } = useLocale();
const profile = ref<{ displayName: string; email: string } | null>(null);
const profileOpen = ref(false);
const accountMenu = ref<InstanceType<typeof ActionMenu> | null>(null);
const initials = computed(() => profile.value?.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "N");
async function closeProfile() { profileOpen.value = false;await nextTick();accountMenu.value?.$el.querySelector("summary")?.focus(); }
const novels = ref<Novel[]>([]);
const loading = ref(true);
const errorKey = ref("");
const platformRole = ref<string | null>(null);
const authenticated = ref(false);
const wizardOpen = ref(false);
const createButton = ref<HTMLButtonElement | null>(null);
const managerOpen = ref(false);
const managerButton = ref<HTMLButtonElement | null>(null);
const signingOut = ref(false);
const createdPath = ref("");

// NF author-home redesign: grid | list view, remembered per device.
type ViewMode = "grid" | "list";
const viewMode = ref<ViewMode>("grid");
const VIEW_KEY = "novelforge.libraryView";
watch(viewMode, (mode) => {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
});

async function load() {
  loading.value = true;
  errorKey.value = "";
  platformRole.value = null;
  authenticated.value = false;
  try {
    const session = await api<{ userId: string; platformRole: string | null; profile?: { displayName: string; email: string } }>("/auth/session");
    authenticated.value = true;
    platformRole.value = session.platformRole;
    profile.value = session.profile ?? null;
    novels.value = await api<Novel[]>("/novels");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      authenticated.value = false;
      platformRole.value = null;
      await navigateTo("/login?redirect=/author");
      return;
    }
    errorKey.value = "authorHome.loadError";
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "grid" || saved === "list") viewMode.value = saved;
  } catch { /* Storage unavailable: retain the server-rendered grid. */ }
  void load();
});
async function closeWizard() {
  wizardOpen.value = false;
  await nextTick();
  createButton.value?.focus();
}
async function closeManager() {
  managerOpen.value = false;
  await nextTick();
  managerButton.value?.focus();
}
async function created(workspaceId: string, novelId: string) {
  createdPath.value = `/workspaces/${workspaceId}/novels/${novelId}`;
  wizardOpen.value = false;
  try {
    await navigateTo(createdPath.value);
  } catch {
    errorKey.value = "authorHome.navigationError";
  }
}
async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await api("/auth/logout", { method: "POST" });
    await navigateTo("/sign-in");
  } catch {
    errorKey.value = "authorHome.signOutError";
  } finally {
    signingOut.value = false;
  }
}
</script>
<template>
  <div class="min-h-dvh bg-nf-bg-0 text-nf-text">
    <header class="flex min-h-[52px] items-center gap-3 border-b border-nf-border bg-nf-bg-1 px-3 py-2 shadow-nf-sm sm:px-5">
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2.5 text-[14.5px] font-semibold tracking-tight focus-visible:nf-focus">
        <BrandLogo compact />
      </NuxtLink>
      <nav class="ml-auto flex min-w-0 items-center gap-2" :aria-label="t('authorHome.navigation')">
        <NuxtLink v-if="platformRole === 'SUPER_ADMIN'" to="/admin" :aria-label="t('platformAdmin.title')" :title="t('platformAdmin.title')" class="inline-flex min-h-9 items-center gap-2 rounded-lg border border-nf-border-strong bg-nf-bg-2 px-2.5 py-1.5 text-[12px] font-medium text-nf-text-dim hover:border-nf-accent-border hover:text-nf-text focus-visible:nf-focus">
          <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5 16 5v4.5c0 4-6 8-6 8s-6-4-6-8V5z" /><path d="m7.5 9.5 1.5 1.5 3.5-3.5" /></svg><span class="hidden sm:inline">{{ t("platformAdmin.title") }}</span>
        </NuxtLink>
        <LanguageMenu />
        <ActionMenu v-if="authenticated" ref="accountMenu" :label="t('accountProfile.menu')" class="nf-account-menu" data-testid="account-menu">
          <template #trigger><span class="grid size-7 shrink-0 place-items-center rounded-full border border-nf-border-strong bg-nf-bg-2 font-nf-literary text-[11px] font-semibold text-nf-text" aria-hidden="true">{{ initials }}</span></template>
          <div class="border-b border-nf-border px-3 py-3"><p class="break-words text-[13px] font-semibold text-nf-text">{{ profile?.displayName || t('accountProfile.title') }}</p><p v-if="profile" class="mt-1 break-all text-[11px] text-nf-text-faint">{{ profile.email }}</p></div>
          <button type="button" data-testid="account-profile" class="items-center gap-2.5 text-nf-text-dim" @click="profileOpen = true"><svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="6" r="3" /><path d="M4 17c0-4 12-4 12 0" /></svg>{{ t("accountProfile.title") }}</button>
          <button type="button" data-testid="account-logout" :disabled="signingOut" class="items-center gap-2.5 text-nf-error disabled:opacity-50" @click="signOut"><svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H4v14h4M10 10h7m-3-3 3 3-3 3" /></svg>{{ t("authorHome.signOut") }}</button>
        </ActionMenu>
      </nav>
    </header>
    <AccountProfileDialog v-if="profileOpen" :profile="profile" @close="closeProfile" />
    <main class="mx-auto max-w-[1120px] px-5 py-10 sm:px-10 sm:py-14">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div class="nf-section-label mb-3">NovelForge · {{ t("authorHome.workspace") }}</div>
          <h1 class="font-nf-literary text-[32px] font-semibold tracking-tight">{{ t("authorHome.title") }}</h1>
          <p class="mt-3 max-w-lg text-sm leading-relaxed text-nf-text-dim">{{ t("authorHome.intro") }}</p>
        </div>
        <div class="flex max-w-full flex-wrap items-center gap-2">
          <button
            v-if="authenticated"
            ref="managerButton"
            :disabled="wizardOpen || managerOpen"
            :aria-expanded="managerOpen"
            aria-haspopup="dialog"
            class="rounded-lg border border-nf-border-strong px-4 py-2.5 text-sm text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            data-testid="manage-workspaces"
            @click="managerOpen = true"
          >
            {{ t("authorHome.manageWorkspaces") }}
          </button>
          <button
            v-if="authenticated"
            ref="createButton"
            :disabled="wizardOpen || managerOpen"
            :aria-expanded="wizardOpen"
            class="rounded-lg bg-nf-accent px-4 py-2.5 text-sm font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50"
            @click="wizardOpen = true"
          >
            {{ t("authorHome.create") }}
          </button>
        </div>
      </div>
      <NewNovelWizard v-if="wizardOpen" @close="closeWizard" @created="created" />
      <WorkspaceManagerDialog v-if="managerOpen" @close="closeManager" />
      <p v-if="loading" role="status" class="mt-6 text-sm text-nf-text-dim">
        {{ t("common.loading") }}
      </p>
      <div
        v-else-if="errorKey"
        role="alert"
        class="mt-6 rounded-lg border border-nf-warn/40 bg-nf-warn/10 p-4 text-sm text-nf-warn"
      >
        <p>{{ t(errorKey) }}</p>
        <NuxtLink
          v-if="createdPath"
          :to="createdPath"
          class="mt-2 inline-block underline focus-visible:nf-focus"
          >{{ t("authorHome.openNovel") }}</NuxtLink
        >
        <button v-else class="mt-2 underline focus-visible:nf-focus" @click="load">
          {{ t("common.retry") }}
        </button>
      </div>
      <section
        v-else-if="!novels.length"
        class="mt-10 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-nf-border-strong bg-nf-bg-1 px-8 py-12 text-center"
      >
        <svg class="mb-5 size-10 text-nf-text-dim" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M16 8C12 5 7 5 3 6v20c4-1 9-1 13 2 4-3 9-3 13-2V6c-4-1-9-1-13 2Zm0 0v20M7 11h5m-5 5h5m8-5h5m-5 5h5" /></svg>
        <p class="max-w-md text-sm leading-7 text-nf-text-dim">{{ t("authorHome.empty") }}</p>
      </section>
      <template v-else>
        <!-- View mode: grid | list (NF author-home redesign). -->
        <div
          class="mt-10 flex items-center justify-end gap-1 border-b border-nf-border pb-2"
          role="group"
          :aria-label="t('authorHome.viewMode')"
        >
          <button
            type="button"
            :aria-pressed="viewMode === 'grid'"
            data-testid="view-grid"
            class="grid size-8 place-items-center rounded-md border focus-visible:nf-focus"
            :class="viewMode === 'grid' ? 'border-nf-accent/50 bg-nf-accent-dim text-nf-accent-hi' : 'border-transparent text-nf-text-faint hover:bg-nf-bg-2 hover:text-nf-text'"
            :title="t('authorHome.viewGrid')"
            @click="viewMode = 'grid'"
          >
            <svg class="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
          </button>
          <button
            type="button"
            :aria-pressed="viewMode === 'list'"
            data-testid="view-list"
            class="grid size-8 place-items-center rounded-md border focus-visible:nf-focus"
            :class="viewMode === 'list' ? 'border-nf-accent/50 bg-nf-accent-dim text-nf-accent-hi' : 'border-transparent text-nf-text-faint hover:bg-nf-bg-2 hover:text-nf-text'"
            :title="t('authorHome.viewList')"
            @click="viewMode = 'list'"
          >
            <svg class="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.8" cy="4" r="0.9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="8" r="0.9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="12" r="0.9" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>

        <ul :data-testid="`novel-library-${viewMode}`" class="mt-4" :class="viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'">
          <li v-for="n in novels" :key="n.id" class="min-w-0"><NovelLibraryCard :novel="n" :mode="viewMode" /></li>
        </ul>
      </template>
    </main>
  </div>
</template>
