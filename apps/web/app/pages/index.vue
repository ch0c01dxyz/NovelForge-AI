<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { ApiError, useApi } from "../composables/useApi";
import { useLocale } from "../composables/useLocale";
import NewNovelWizard from "../components/author/NewNovelWizard.vue";
interface Novel {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
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
const signingOut = ref(false);
const createdPath = ref("");
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
    <main class="mx-auto max-w-3xl px-5 py-10">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 class="font-nf-literary text-2xl font-semibold">{{ t("authorHome.title") }}</h1>
          <p class="mt-2 text-sm text-nf-text-dim">{{ t("authorHome.intro") }}</p>
        </div>
        <button
          v-if="authenticated"
          ref="createButton"
          :disabled="wizardOpen"
          :aria-expanded="wizardOpen"
          class="rounded-lg bg-nf-accent px-4 py-2.5 text-sm font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50"
          @click="wizardOpen = true"
        >
          {{ t("authorHome.create") }}
        </button>
      </div>
      <NewNovelWizard v-if="wizardOpen" @close="closeWizard" @created="created" />
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
      <p
        v-else-if="!novels.length"
        class="mt-8 rounded-xl border border-nf-border bg-nf-bg-1 p-6 text-sm text-nf-text-dim"
      >
        {{ t("authorHome.empty") }}
      </p>
      <ul v-else class="mt-6 flex flex-col gap-2">
        <li v-for="n in novels" :key="n.id">
          <NuxtLink
            :to="`/workspaces/${n.workspaceId}/novels/${n.id}`"
            class="flex items-center gap-3 rounded-xl border border-nf-border bg-nf-bg-1 px-4 py-3 hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
            ><span class="min-w-0 break-words font-nf-literary text-[15px] font-semibold">{{
              n.title
            }}</span
            ><span class="ml-auto text-xs text-nf-text-dim">{{
              t(
                n.status === "DRAFT"
                  ? "authorHome.statusDraft"
                  : n.status === "ACTIVE"
                    ? "authorHome.statusActive"
                    : n.status === "ARCHIVED"
                      ? "authorHome.statusArchived"
                      : n.status,
              )
            }}</span></NuxtLink
          >
        </li>
      </ul>
    </main>
  </div>
</template>
