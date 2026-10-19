<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
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
const { t, locale, setLocale } = useLocale();
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
try {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === "grid" || saved === "list") viewMode.value = saved;
} catch {
  /* storage unavailable — grid default */
}
watch(viewMode, (mode) => {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
});

/** Deterministic placeholder hue from the novel id — stable cover colors. */
function coverHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
async function load() {
  loading.value = true;
  errorKey.value = "";
  platformRole.value = null;
  authenticated.value = false;
  try {
    const session = await api<{ userId: string; platformRole: string | null }>("/auth/session");
    authenticated.value = true;
    platformRole.value = session.platformRole;
    novels.value = await api<Novel[]>("/novels");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      authenticated.value = false;
      platformRole.value = null;
      await navigateTo("/sign-in?redirect=/");
      return;
    }
    errorKey.value = "authorHome.loadError";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
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
    <header
      class="flex flex-wrap items-center gap-4 border-b border-nf-border bg-nf-bg-1 px-5 py-3 shadow-nf-sm"
    >
      <div class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight">
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >NovelForge
      </div>
      <nav
        class="ml-auto flex flex-wrap items-center gap-4 text-sm"
        :aria-label="t('authorHome.navigation')"
      >
        <NuxtLink
          v-if="platformRole === 'SUPER_ADMIN'"
          to="/admin"
          class="text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
          >{{ t("platformAdmin.title") }}</NuxtLink
        >
        <label class="flex items-center gap-2 text-nf-text-dim"
          >{{ t("authorHome.language") }}
          <select
            :value="locale"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 p-1.5 text-nf-text focus-visible:nf-focus"
            @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'id')"
          >
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
        </label>
        <button
          v-if="authenticated"
          :disabled="signingOut"
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          @click="signOut"
        >
          {{ t("authorHome.signOut") }}
        </button>
      </nav>
    </header>
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

        <!-- GRID: cover-first cards, full-bleed placeholder art -->
        <ul v-if="viewMode === 'grid'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="n in novels" :key="n.id">
            <NuxtLink
              :to="`/workspaces/${n.workspaceId}/novels/${n.id}`"
              class="nf-library-card group flex h-full flex-col overflow-hidden rounded-xl border border-nf-border bg-nf-bg-2 hover:border-nf-border-strong hover:bg-nf-bg-3 focus-visible:nf-focus"
            >
              <div class="relative aspect-[2/3] w-full overflow-hidden" aria-hidden="true">
                <img
                  v-if="n.coverUrl"
                  :src="n.coverUrl"
                  alt=""
                  class="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  loading="lazy"
                />
                <span
                  v-else
                  class="nf-cover-placeholder absolute inset-0 grid place-items-center"
                  :style="{ '--h': String(coverHue(n.id)) }"
                >
                  <span class="nf-cover-title font-nf-literary">{{ n.title }}</span>
                </span>
                <span
                  class="absolute left-3 top-3 rounded border px-2 py-0.5 font-mono text-[10.5px] backdrop-blur-sm"
                  :class="n.status === 'DRAFT' ? 'border-nf-border-strong bg-black/40 text-nf-text-dim' : 'border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi'"
                >{{
                  t(
                    n.status === "DRAFT"
                      ? "authorHome.statusDraft"
                      : n.status === "ACTIVE"
                        ? "authorHome.statusActive"
                        : n.status === "ARCHIVED"
                          ? "authorHome.statusArchived"
                          : n.status,
                  )
                }}</span>
              </div>
              <span class="flex min-h-0 flex-1 flex-col gap-1 p-4">
                <span class="min-w-0 break-words font-nf-literary text-lg font-semibold leading-snug">{{
                  n.title
                }}</span>
                <span class="mt-auto truncate font-mono text-[11px] text-nf-text-faint">/{{ n.slug }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>

        <!-- LIST: one row per novel -->
        <ul v-else class="flex flex-col gap-2">
          <li v-for="n in novels" :key="n.id">
            <NuxtLink
              :to="`/workspaces/${n.workspaceId}/novels/${n.id}`"
              class="nf-library-card group flex items-center gap-4 rounded-xl border border-nf-border bg-nf-bg-2 p-3 hover:border-nf-border-strong hover:bg-nf-bg-3 focus-visible:nf-focus"
            >
              <span class="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md border border-nf-border" aria-hidden="true">
                <img
                  v-if="n.coverUrl"
                  :src="n.coverUrl"
                  alt=""
                  class="size-full object-cover"
                  loading="lazy"
                />
                <span
                  v-else
                  class="nf-cover-placeholder grid size-full place-items-center text-[13px] font-nf-literary font-semibold"
                  :style="{ '--h': String(coverHue(n.id)) }"
                >{{ n.title.slice(0, 1) }}</span>
            </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="min-w-0 truncate font-nf-literary text-lg font-semibold">{{ n.title }}</span>
                <span class="truncate font-mono text-[11px] text-nf-text-faint">/{{ n.slug }}</span>
              </span>
              <span
                class="shrink-0 rounded border px-2 py-0.5 text-[11px]"
                :class="n.status === 'DRAFT' ? 'border-nf-border bg-nf-bg-0 text-nf-text-dim' : 'border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi'"
              >{{
                t(
                  n.status === "DRAFT"
                    ? "authorHome.statusDraft"
                    : n.status === "ACTIVE"
                      ? "authorHome.statusActive"
                      : n.status === "ARCHIVED"
                        ? "authorHome.statusArchived"
                        : n.status,
                )
              }}</span>
              <svg class="size-4 shrink-0 text-nf-text-faint transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M6 3.5L10.5 8L6 12.5"/></svg>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </main>
  </div>
</template>
