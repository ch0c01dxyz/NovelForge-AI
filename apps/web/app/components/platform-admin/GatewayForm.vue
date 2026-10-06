<script setup lang="ts">
/**
 * Gateway form dialog (NF-WF-018B): create, edit, or rotate a gateway.
 *
 * Invariant 1: the credential is write-only. The apiKey field is never
 * prefilled — in edit mode the field is absent entirely (rotation is the
 * separate "rotate" mode). Esc dismisses with focus return.
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import type {
  GatewayView,
  CreateGatewayInput,
  UpdateGatewayInput,
} from "../../composables/usePlatformAdmin";

export type GatewayFormMode = "create" | "edit" | "rotate";

const props = defineProps<{
  mode: GatewayFormMode;
  gateway: GatewayView | null;
}>();

const emit = defineEmits<{
  (e: "submit", payload: CreateGatewayInput | UpdateGatewayInput): void;
  (e: "close"): void;
}>();

const { t } = useLocale();

const name = ref("");
const baseUrl = ref("");
const apiKey = ref("");
const priority = ref(100);
const weight = ref(1);
const timeoutMs = ref(60_000);
const maxRetries = ref(2);
const enabled = ref(true);
const saving = ref(false);
const formError = ref<string | null>(null);
const dialogRef = ref<HTMLElement | null>(null);

const titleKey = computed(() =>
  props.mode === "create"
    ? "platformAdmin.gateways.form.createTitle"
    : props.mode === "edit"
      ? "platformAdmin.gateways.form.editTitle"
      : "platformAdmin.gateways.form.rotateTitle",
);

watch(
  () => props.gateway,
  (g) => {
    name.value = g?.name ?? "";
    baseUrl.value = g?.baseUrl ?? "";
    // Never prefill the credential — not even from the masked view.
    apiKey.value = "";
    priority.value = g?.priority ?? 100;
    weight.value = g?.weight ?? 1;
    timeoutMs.value = g?.timeoutMs ?? 60_000;
    maxRetries.value = g?.maxRetries ?? 2;
    enabled.value = g?.enabled ?? true;
    formError.value = null;
  },
  { immediate: true },
);

function valid(): boolean {
  if (props.mode === "create") {
    return (
      name.value.trim().length > 0 &&
      baseUrl.value.trim().length > 0 &&
      apiKey.value.length >= 8
    );
  }
  if (props.mode === "rotate") return apiKey.value.length >= 8;
  return name.value.trim().length > 0 && baseUrl.value.trim().length > 0;
}

async function submit() {
  if (!valid() || saving.value) return;
  saving.value = true;
  formError.value = null;
  try {
    if (props.mode === "create") {
      const payload: CreateGatewayInput = {
        name: name.value.trim(),
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value,
        priority: priority.value,
        weight: weight.value,
        timeoutMs: timeoutMs.value,
        maxRetries: maxRetries.value,
        enabled: enabled.value,
      };
      emit("submit", payload);
    } else if (props.mode === "rotate") {
      const payload: UpdateGatewayInput = { apiKey: apiKey.value };
      emit("submit", payload);
    } else {
      const payload: UpdateGatewayInput = {
        name: name.value.trim(),
        baseUrl: baseUrl.value.trim(),
        priority: priority.value,
        weight: weight.value,
        timeoutMs: timeoutMs.value,
        maxRetries: maxRetries.value,
        enabled: enabled.value,
      };
      emit("submit", payload);
    }
    // The credential field is wiped the moment it leaves the form.
    apiKey.value = "";
  } finally {
    saving.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  nextTick(() => {
    dialogRef.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  });
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div
    ref="dialogRef"
    class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="t(titleKey)"
  >
    <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg">
      <h3 class="mb-1 text-[15px] font-semibold text-nf-text">{{ t(titleKey) }}</h3>
      <p v-if="mode !== 'edit'" class="mb-3 text-[12px] text-nf-text-dim">
        {{ t("platformAdmin.gateways.form.apiKeyHelp") }}
      </p>

      <div class="space-y-3">
        <label v-if="mode !== 'rotate'" class="block text-[12px] font-semibold text-nf-text">
          {{ t("platformAdmin.gateways.form.name") }}
          <input
            v-model="name"
            data-autofocus
            type="text"
            class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </label>
        <label v-if="mode !== 'rotate'" class="block text-[12px] font-semibold text-nf-text">
          {{ t("platformAdmin.gateways.form.baseUrl") }}
          <input
            v-model="baseUrl"
            type="url"
            class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </label>
        <label v-if="mode !== 'edit'" class="block text-[12px] font-semibold text-nf-text">
          {{ t("platformAdmin.gateways.form.apiKey") }}
          <input
            v-model="apiKey"
            :data-autofocus="mode === 'rotate' ? '' : undefined"
            type="password"
            autocomplete="new-password"
            :placeholder="t('platformAdmin.gateways.form.apiKeyPlaceholder')"
            class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            data-testid="gateway-apikey-input"
          />
        </label>
        <div v-if="mode !== 'rotate'" class="grid grid-cols-2 gap-3">
          <label class="block text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.gateways.form.priority") }}
            <input
              v-model.number="priority"
              type="number"
              min="0"
              max="10000"
              class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <label class="block text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.gateways.form.weight") }}
            <input
              v-model.number="weight"
              type="number"
              min="1"
              max="10000"
              class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <label class="block text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.gateways.form.timeoutMs") }}
            <input
              v-model.number="timeoutMs"
              type="number"
              min="1000"
              max="600000"
              class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <label class="block text-[12px] font-semibold text-nf-text">
            {{ t("platformAdmin.gateways.form.maxRetries") }}
            <input
              v-model.number="maxRetries"
              type="number"
              min="0"
              max="10"
              class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
        </div>
        <label v-if="mode === 'create'" class="flex items-center gap-2 text-[13px] text-nf-text">
          <input v-model="enabled" type="checkbox" class="focus-visible:nf-focus" />
          {{ t("platformAdmin.gateways.form.enabled") }}
        </label>
      </div>

      <p v-if="formError" class="mt-3 text-[13px] text-nf-warn" role="alert">{{ formError }}</p>

      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
          @click="emit('close')"
        >
          {{ t("platformAdmin.gateways.form.cancel") }}
        </button>
        <button
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="!valid() || saving"
          data-testid="gateway-form-save"
          @click="submit"
        >
          {{ saving ? t("platformAdmin.gateways.form.saving") : t("platformAdmin.gateways.form.save") }}
        </button>
      </div>
    </div>
  </div>
</template>
