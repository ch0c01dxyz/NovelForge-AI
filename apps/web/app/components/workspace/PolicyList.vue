<script setup lang="ts">
/**
 * Narrative policy list (NF-WF-016, Invariant 1.8).
 *
 * DRAMA_GAP and COOLDOWN policies are authorable (PUT upserts; DELETE
 * removes, with explicit confirmation). The policy payload is a
 * free-form record edited as JSON text with parse-error handling.
 *
 * SCALE is display-only (GAP-039): the SCALE payload/readout is shown
 * but no assessment form is offered — the UI invents no assessment
 * source. SCALE policies are never editable or deletable here.
 */
import { ref, onMounted, computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const EDITABLE_KINDS = ["DRAMA_GAP", "COOLDOWN"] as const;
const HARDNESSES = ["SOFT", "HARD"] as const;

interface Policy {
  kind: string;
  hardness: string;
  hardReason: string | null;
  payload: Record<string, unknown>;
  updatedAt?: string;
}

const policies = ref<Policy[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);

const form = ref({ kind: "DRAMA_GAP", hardness: "SOFT", hardReason: "", payloadText: "{}" });
const formError = ref<string | null>(null);
const saving = ref(false);

const confirmingDelete = ref<string | null>(null);
const deleteError = ref<string | null>(null);
const deleting = ref(false);

const scalePolicies = computed(() => policies.value.filter((p) => p.kind === "SCALE"));
const editablePolicies = computed(() => policies.value.filter((p) => p.kind !== "SCALE"));

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.narrative.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.narrative.errors.notFound");
  return t("workspace.narrative.errors.unknown");
}

const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}/narrative/policies`;

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    policies.value = await api<Policy[]>(base());
  } catch (e) {
    loadError.value = errorKey(e);
  } finally {
    loading.value = false;
  }
}

function parsePayload(): Record<string, unknown> | null {
  formError.value = null;
  const raw = form.value.payloadText.trim();
  if (!raw) {
    formError.value = t("workspace.narrative.policies.emptyJson");
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      formError.value = t("workspace.narrative.policies.objectRequired");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    formError.value = t("workspace.narrative.policies.invalidJson", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function save() {
  const payload = parsePayload();
  if (!payload) return;
  saving.value = true;
  try {
    await api(base(), {
      method: "PUT",
      body: JSON.stringify({
        kind: form.value.kind,
        hardness: form.value.hardness,
        hardReason: form.value.hardReason.trim() ? form.value.hardReason.trim() : null,
        payload,
      }),
    });
    form.value = { kind: "DRAMA_GAP", hardness: "SOFT", hardReason: "", payloadText: "{}" };
    showForm.value = false;
    await load();
  } catch (e) {
    formError.value = errorKey(e);
  } finally {
    saving.value = false;
  }
}

async function remove(kind: string) {
  deleteError.value = null;
  deleting.value = true;
  try {
    await api(`${base()}/${kind}`, { method: "DELETE" });
    confirmingDelete.value = null;
    await load();
  } catch (e) {
    deleteError.value = errorKey(e);
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-[12px] leading-relaxed text-nf-text-faint">
      {{ t("workspace.narrative.policies.about") }}
    </p>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.narrative.common.loading") }}
    </p>
    <p
      v-else-if="loadError"
      role="alert"
      class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
    >
      {{ loadError }}
    </p>

    <template v-else>
      <!-- SCALE: display-only (GAP-039) -->
      <div class="flex flex-col gap-2">
        <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
          {{ t("workspace.narrative.policies.scaleTitle") }}
        </h3>
        <p class="text-[12px] leading-relaxed text-nf-text-faint">
          {{ t("workspace.narrative.policies.scaleNote") }}
        </p>
        <p v-if="!scalePolicies.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.narrative.policies.scaleNone") }}
        </p>
        <div
          v-for="p in scalePolicies"
          :key="p.kind"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="text-[13px] font-medium text-nf-text">
            {{ t("workspace.narrative.policies.kind.SCALE") }} ·
            {{ t(`workspace.narrative.policies.hardness.${p.hardness}`) }}
          </p>
          <p v-if="p.hardReason" class="mt-0.5 text-[12px] text-nf-text-dim">{{ p.hardReason }}</p>
          <pre class="mt-1.5 max-h-48 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ JSON.stringify(p.payload, null, 2) }}</pre>
        </div>
      </div>

      <!-- Authorable policies -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
            {{ t("workspace.narrative.policies.title") }}
          </h3>
          <button
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-expanded="showForm"
            @click="showForm = !showForm"
          >
            {{ t("workspace.narrative.policies.newPolicy") }}
          </button>
        </div>

        <form
          v-if="showForm"
          class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3"
          @submit.prevent="save"
        >
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.policies.kindLabel") }}
              <select
                v-model="form.kind"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option v-for="k in EDITABLE_KINDS" :key="k" :value="k">
                  {{ t(`workspace.narrative.policies.kind.${k}`) }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.policies.hardnessLabel") }}
              <select
                v-model="form.hardness"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option v-for="h in HARDNESSES" :key="h" :value="h">
                  {{ t(`workspace.narrative.policies.hardness.${h}`) }}
                </option>
              </select>
            </label>
          </div>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.policies.hardReasonLabel") }}
            <input
              v-model="form.hardReason"
              type="text"
              maxlength="2000"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.policies.payloadLabel") }}
            <textarea
              v-model="form.payloadText"
              rows="6"
              spellcheck="false"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <p
            v-if="formError"
            role="alert"
            class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
          >
            {{ formError }}
          </p>
          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="saving"
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            >
              {{ t("workspace.narrative.policies.save") }}
            </button>
            <button
              type="button"
              class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="showForm = false"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
        </form>

        <p v-if="!editablePolicies.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.narrative.policies.empty") }}
        </p>
        <div
          v-for="p in editablePolicies"
          :key="p.kind"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-medium text-nf-text">
                {{ t(`workspace.narrative.policies.kind.${p.kind}`) }} ·
                {{ t(`workspace.narrative.policies.hardness.${p.hardness}`) }}
              </p>
              <p v-if="p.hardReason" class="mt-0.5 text-[12px] text-nf-text-dim">{{ p.hardReason }}</p>
            </div>
            <button
              v-if="confirmingDelete !== p.kind"
              class="shrink-0 rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="confirmingDelete = p.kind"
            >
              {{ t("workspace.common.delete") }}
            </button>
          </div>
          <pre class="mt-1.5 max-h-40 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ JSON.stringify(p.payload, null, 2) }}</pre>
          <div
            v-if="confirmingDelete === p.kind"
            role="alertdialog"
            :aria-label="t('workspace.narrative.policies.deleteConfirmTitle')"
            class="mt-2 rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-2"
          >
            <p class="text-[12.5px] text-nf-text">{{ t("workspace.narrative.policies.deleteConfirm", { kind: p.kind }) }}</p>
            <div class="mt-2 flex gap-2">
              <button
                class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus disabled:opacity-50"
                :disabled="deleting"
                @click="remove(p.kind)"
              >
                {{ t("workspace.common.confirm") }}
              </button>
              <button
                class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
                @click="confirmingDelete = null"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </div>
        </div>
        <p
          v-if="deleteError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ deleteError }}
        </p>
      </div>
    </template>
  </div>
</template>
