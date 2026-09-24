<script setup lang="ts">
/**
 * Home: the novels the signed-in user can reach. Unauthenticated visitors
 * are sent to /sign-in (with a redirect back here).
 */
interface Novel {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
}

const { api } = useApi();
const novels = ref<Novel[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    novels.value = await api<Novel[]>("/novels");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await navigateTo("/sign-in?redirect=/");
      return;
    }
    error.value = "Could not load your novels.";
  } finally {
    loading.value = false;
  }
});

async function signOut() {
  try {
    await api("/auth/logout", { method: "POST" });
  } finally {
    await navigateTo("/sign-in");
  }
}
</script>

<template>
  <div class="min-h-dvh bg-nf-bg-0 text-nf-text">
    <header
      class="flex items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 py-3 shadow-nf-sm"
    >
      <div class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight">
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </div>
      <div class="flex-1" />
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="signOut"
      >
        Sign out
      </button>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-10">
      <h1 class="mb-6 font-nf-literary text-2xl font-semibold">Your novels</h1>

      <p v-if="loading" class="text-[13px] text-nf-text-faint">Loading…</p>
      <p
        v-else-if="error"
        role="alert"
        class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-4 py-3 text-[13px] text-nf-warn"
      >
        {{ error }}
      </p>
      <p v-else-if="!novels.length" class="text-[13px] text-nf-text-dim">
        No novels yet. Create one through the API to get started.
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="n in novels" :key="n.id">
          <NuxtLink
            :to="`/workspaces/${n.workspaceId}/novels/${n.id}`"
            class="flex items-center gap-3 rounded-xl border border-nf-border bg-nf-bg-1 px-4 py-3 hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus"
          >
            <span class="font-nf-literary text-[15px] font-semibold">{{ n.title }}</span>
            <span class="ml-auto text-[11.5px] uppercase tracking-[0.1em] text-nf-text-faint">
              {{ n.status }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>
