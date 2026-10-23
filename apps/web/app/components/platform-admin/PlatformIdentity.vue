<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import BrandLogo from "../ui/BrandLogo.vue";
import { ApiError, useApi } from "../../composables/useApi";
import { DEFAULT_BRANDING, isPlatformBranding, useBranding } from "../../composables/useBranding";
import { useLocale } from "../../composables/useLocale";
const { t } = useLocale();
const { api } = useApi();
const { branding, load, loading } = useBranding();
const draft = ref({ ...DEFAULT_BRANDING });
const ready = ref(false), saving = ref(false), conflict = ref(false), message = ref("");
const valid = computed(() => /^[\p{L}\p{N} .'-]{1,40}$/u.test(draft.value.name.trim()) && /^[\p{L}\p{N} .'-]{1,3}$/u.test(draft.value.mark.trim()) && /^#[0-9a-fA-F]{6}$/.test(draft.value.markColor));
async function reload() {
  message.value = "";
  try { await load(); draft.value = { ...branding.value }; conflict.value = false; ready.value = true; }
  catch { message.value = "platformIdentity.loadFailed"; }
}
async function save() {
  if (!valid.value || !ready.value || saving.value || conflict.value) return;
  saving.value = true; message.value = "";
  try {
    const result = await api<unknown>("/platform/branding", { method: "PUT", body: JSON.stringify({ name: draft.value.name, mark: draft.value.mark, markColor: draft.value.markColor, expectedVersion: draft.value.version }) });
    if (!isPlatformBranding(result)) throw new Error("Invalid platform branding response");
    branding.value = result;
    draft.value = { ...branding.value }; message.value = "platformIdentity.saved";
  } catch (error) {
    conflict.value = error instanceof ApiError && error.status === 409;
    message.value = conflict.value ? "platformIdentity.conflict" : "platformIdentity.saveFailed";
  } finally { saving.value = false; }
}
onMounted(reload);
</script>

<template>
  <section aria-labelledby="platform-identity-heading" class="max-w-xl">
    <h2 id="platform-identity-heading" class="mb-1 text-[15px] font-semibold">{{ t("platformIdentity.title") }}</h2>
    <p class="mb-5 text-[13px] text-nf-text-dim">{{ t("platformIdentity.description") }}</p>
    <div class="mb-5 rounded-xl border border-nf-border bg-nf-bg-1 p-5">
      <p class="mb-3 text-[11px] text-nf-text-faint">{{ t("platformIdentity.preview") }}</p>
      <BrandLogo :preview="draft" class="text-[14.5px] font-semibold tracking-tight" />
    </div>
    <p v-if="loading" role="status" class="mb-3 text-[13px]">{{ t("common.loading") }}</p>
    <form class="grid gap-4" @submit.prevent="save">
      <label class="grid gap-1 text-[13px]">{{ t("platformIdentity.name") }}<input v-model="draft.name" data-testid="brand-name" maxlength="40" required :disabled="!ready || loading || saving" class="w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus" /></label>
      <label class="grid gap-1 text-[13px]">{{ t("platformIdentity.mark") }}<input v-model="draft.mark" data-testid="brand-mark" maxlength="3" required :disabled="!ready || loading || saving" class="w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus" /></label>
      <div class="grid gap-1 text-[13px]">
        <label for="brand-color-text">{{ t("platformIdentity.color") }}</label>
        <div class="flex items-center gap-2">
          <input v-model="draft.markColor" type="color" :aria-label="t('platformIdentity.color')" :disabled="!ready || loading || saving" class="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-nf-border bg-nf-bg-0 p-1 focus-visible:nf-focus" />
          <input id="brand-color-text" v-model="draft.markColor" data-testid="brand-color" maxlength="7" pattern="#[0-9a-fA-F]{6}" required :disabled="!ready || loading || saving" class="min-w-0 flex-1 rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus" placeholder="#1c1207" />
        </div>
      </div>
      <p class="text-[12px] text-nf-text-dim">{{ t("platformIdentity.hint") }}</p>
      <p v-if="message" :role="message === 'platformIdentity.saved' ? 'status' : 'alert'" class="text-[13px]" :class="message === 'platformIdentity.saved' ? 'text-nf-ok' : 'text-nf-warn'">{{ t(message) }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="submit" data-testid="brand-save" class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink focus-visible:nf-focus" :disabled="!valid || !ready || loading || saving || conflict">{{ t(saving ? "common.saving" : "common.save") }}</button>
        <button type="button" class="rounded-lg border border-nf-border px-4 py-2 text-[13px] text-nf-text-dim focus-visible:nf-focus" :disabled="loading || saving" @click="reload">{{ t("platformIdentity.reload") }}</button>
      </div>
    </form>
  </section>
</template>
