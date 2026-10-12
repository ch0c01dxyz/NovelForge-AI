<script setup lang="ts">
/**
 * Per-novel S3 SCALE assistance enablement (NF-WF-050C amendment 1,
 * finding A). Author-facing, discoverable toggle for the off-by-default
 * optional AI proposal assistance.
 *
 * - Reads GET /scale-s3-setting; switching issues PUT {enabled, reason}.
 * - Server is the enforcer (canon:manage for PUT — stricter than
 *   novel:update, deliberately). The client role check mirrors
 *   ROLE_CAPABILITIES as progressive enhancement only.
 * - Any 403/404 on the GET (e.g. VIEWER below canon:read) renders the
 *   read-only "off" state — never an error banner.
 * - Disabling never erases proposals/dismissals (server keeps rows); the
 *   copy says so.
 */
import { computed, onMounted, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import { useAiStudio, type WorkspaceRole } from "../../composables/useAiStudio";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();
const aiStudio = useAiStudio();

const enabled = ref(false);
const loading = ref(true);
const saving = ref(false);
const errorKey = ref<string | null>(null);
const showForm = ref(false);
const pendingEnabled = ref(true);
const reason = ref("");
// Roles holding canon:manage (packages/auth/authorization.ts): OWNER,
// ADMIN, AUTHOR. Progressive enhancement only.
const role = ref<WorkspaceRole | null>(null);
const canManage = computed(() => role.value === "OWNER" || role.value === "ADMIN" || role.value === "AUTHOR");

async function load(): Promise<void> {
  loading.value = true;
  errorKey.value = null;
  try {
    const res = await api<{ enabled: boolean }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/scale-s3-setting`,
    );
    enabled.value = res.enabled === true;
  } catch {
    // Treated as disabled absence (consistent with the review panel).
    enabled.value = false;
  } finally {
    loading.value = false;
  }
}

function startToggle(next: boolean): void {
  if (!canManage.value || saving.value) return;
  pendingEnabled.value = next;
  reason.value = t("workspace.narrative.scaleReview.s3.setting.defaultReason");
  showForm.value = true;
  errorKey.value = null;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  const trimmed = reason.value.trim();
  if (trimmed.length === 0 || trimmed.length > 4000) {
    errorKey.value = "workspace.narrative.scaleReview.s3.setting.reasonInvalid";
    return;
  }
  saving.value = true;
  errorKey.value = null;
  try {
    await api(`/workspaces/${props.workspaceId}/novels/${props.novelId}/scale-s3-setting`, {
      method: "PUT",
      body: JSON.stringify({ enabled: pendingEnabled.value, reason: trimmed }),
    });
    enabled.value = pendingEnabled.value;
    showForm.value = false;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      errorKey.value = "workspace.narrative.scaleReview.s3.setting.forbidden";
    } else {
      errorKey.value = "workspace.narrative.scaleReview.s3.setting.saveFailed";
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
  aiStudio.getWorkspaceRole(props.workspaceId).then(
    (r) => (role.value = r),
    () => (role.value = null),
  );
});
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex flex-col">
        <span class="text-[12.5px] font-medium text-nf-text">
          {{ t("workspace.narrative.scaleReview.s3.setting.title") }}
        </span>
        <span class="text-[11.5px] text-nf-text-faint">
          {{ t("workspace.narrative.scaleReview.s3.setting.about") }}
        </span>
      </div>
      <span
        role="status"
        class="shrink-0 rounded bg-nf-bg-0 px-2 py-0.5 text-[11px] tabular-nums text-nf-text-faint"
      >
        {{ loading ? t("workspace.narrative.common.loading") : enabled
          ? t("workspace.narrative.scaleReview.s3.setting.stateOn")
          : t("workspace.narrative.scaleReview.s3.setting.stateOff") }}
      </span>
    </div>

    <p class="text-[11.5px] leading-relaxed text-nf-text-faint">
      {{ t("workspace.narrative.scaleReview.s3.setting.explain") }}
    </p>

    <div v-if="canManage && !loading" class="flex gap-2">
      <button
        type="button"
        class="rounded-lg bg-nf-accent px-3 py-1.5 text-[12.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        :disabled="saving || enabled"
        data-testid="s3-enable"
        @click="startToggle(true)"
      >
        {{ t("workspace.narrative.scaleReview.s3.setting.enable") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-nf-border px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:nf-hover focus-visible:nf-focus disabled:opacity-50"
        :disabled="saving || !enabled"
        data-testid="s3-disable"
        @click="startToggle(false)"
      >
        {{ t("workspace.narrative.scaleReview.s3.setting.disable") }}
      </button>
    </div>
    <p v-else-if="!loading" class="text-[11.5px] text-nf-text-faint">
      {{ t("workspace.narrative.scaleReview.s3.setting.readOnly") }}
    </p>

    <form v-if="showForm" class="flex flex-col gap-2" @submit.prevent="submit">
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.narrative.scaleReview.s3.setting.reasonLabel") }}
        <textarea
          v-model="reason"
          rows="2"
          data-testid="s3-reason"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
        />
      </label>
      <div class="flex gap-2">
        <button
          type="submit"
          :disabled="saving"
          data-testid="s3-submit"
          class="rounded-lg bg-nf-accent px-3 py-1.5 text-[12.5px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{ saving
            ? t("workspace.narrative.scaleReview.s3.setting.saving")
            : t("workspace.narrative.scaleReview.s3.setting.confirm", {
              state: pendingEnabled
                ? t("workspace.narrative.scaleReview.s3.setting.stateOn")
                : t("workspace.narrative.scaleReview.s3.setting.stateOff"),
            }) }}
        </button>
        <button
          type="button"
          :disabled="saving"
          class="rounded-lg border border-nf-border px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:nf-hover focus-visible:nf-focus disabled:opacity-50"
          @click="showForm = false"
        >
          {{ t("common.cancel") }}
        </button>
      </div>
    </form>

    <p
      v-if="errorKey"
      role="alert"
      class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12px] text-nf-warn"
    >
      {{ t(errorKey) }}
    </p>
  </div>
</template>
