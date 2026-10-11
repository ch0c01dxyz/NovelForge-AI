<!--
  ScalePayloadForm — typed SCALE proposal/alternative payload authoring.
  Replaces raw JSON textareas with typed selects/inputs/checkboxes that
  produce exactly the payloads the server validates:
  - STANDING_CHANGE: { standing: { scale, access, reputation }, hardness, hardReason }
  - CHAPTER_EXCEPTION: { claimIndices }
  Follows the writer-workspace design system (§15): same form control
  classes as the surrounding panel.
-->
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useLocale } from "../../composables/useLocale";

const { t } = useLocale();

const props = defineProps<{
  /** Proposal kind; determines which controls render. */
  kind: "STANDING_CHANGE" | "CHAPTER_EXCEPTION";
  /** Current evidence conflicts (for CHAPTER_EXCEPTION claim checkboxes). */
  conflicts: Array<{ scale: string; relevance: string; explanation: string }>;
  /** Prefix for data-testid attributes (e.g. "proposal" or "alt"). */
  testidPrefix: string;
}>();

// The 8 canonical narrative scales (frozen vocabulary).
const NARRATIVE_SCALES = [
  "PERSONAL",
  "FAMILY",
  "VILLAGE",
  "TOWN",
  "CITY",
  "PROVINCE",
  "KINGDOM",
  "EMPIRE",
] as const;

// --- STANDING_CHANGE state ---
const standingScale = ref<string>("VILLAGE");
const accessScales = ref<string[]>(["VILLAGE"]);
const reputation = ref<string>("40");
const hardness = ref<"HARD" | "SOFT">("HARD");
const hardReason = ref<string>("");

// --- CHAPTER_EXCEPTION state ---
const claimIndices = ref<number[]>([]);

// Reset claim selection when the evidence set changes.
watch(
  () => props.conflicts,
  () => {
    claimIndices.value = [];
  },
);

function toggleAccess(scale: string): void {
  const i = accessScales.value.indexOf(scale);
  if (i >= 0) {
    accessScales.value.splice(i, 1);
  } else {
    accessScales.value.push(scale);
  }
}

function toggleClaim(index: number): void {
  const i = claimIndices.value.indexOf(index);
  if (i >= 0) {
    claimIndices.value.splice(i, 1);
  } else {
    claimIndices.value.push(index);
  }
}

/** Build the typed payload; returns an error key when invalid. */
function buildPayload(): { payload: unknown; error: string | null } {
  if (props.kind === "STANDING_CHANGE") {
    if (!NARRATIVE_SCALES.includes(standingScale.value as (typeof NARRATIVE_SCALES)[number])) {
      return { payload: null, error: t("workspace.narrative.scaleReview.errors.invalid") };
    }
    // The frozen contract permits access:[] (empty access is valid standing).
    const rep = Number(reputation.value);
    if (!Number.isInteger(rep) || rep < 0 || rep > 100) {
      return { payload: null, error: t("workspace.narrative.scaleReview.payload.reputationInvalid") };
    }
    const trimmedReason = hardReason.value.trim();
    // HARD requires a nonblank reason (matches NarrativePolicy_hard_requires_reason).
    // SOFT permits a blank reason.
    if (hardness.value === "HARD" && trimmedReason.length === 0) {
      return { payload: null, error: t("workspace.narrative.scaleReview.payload.hardReasonRequired") };
    }
    return {
      payload: {
        standing: {
          scale: standingScale.value,
          access: [...accessScales.value],
          reputation: rep,
        },
        hardness: hardness.value,
        hardReason: trimmedReason.length > 0 ? trimmedReason : null,
      },
      error: null,
    };
  }
  // CHAPTER_EXCEPTION
  if (claimIndices.value.length === 0) {
    return { payload: null, error: t("workspace.narrative.scaleReview.payload.claimsRequired") };
  }
  const sorted = [...claimIndices.value].sort((a, b) => a - b);
  return { payload: { claimIndices: sorted }, error: null };
}

function reset(): void {
  standingScale.value = "VILLAGE";
  accessScales.value = ["VILLAGE"];
  reputation.value = "40";
  hardness.value = "HARD";
  hardReason.value = "";
  claimIndices.value = [];
}

defineExpose({ buildPayload, reset });

const testid = (name: string) => `${props.testidPrefix}-${name}`;
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- STANDING_CHANGE controls -->
    <template v-if="kind === 'STANDING_CHANGE'">
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.narrative.scaleReview.payload.standingScaleLabel") }}
        <select
          :data-testid="testid('scale')"
          v-model="standingScale"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option v-for="s in NARRATIVE_SCALES" :key="s" :value="s">
            {{ s }}
          </option>
        </select>
      </label>
      <fieldset class="flex flex-col gap-1">
        <legend class="text-[12px] text-nf-text-dim">
          {{ t("workspace.narrative.scaleReview.payload.accessLabel") }}
        </legend>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <label
            v-for="s in NARRATIVE_SCALES"
            :key="s"
            class="flex items-center gap-1.5 text-[12.5px] text-nf-text"
          >
            <input
              :data-testid="testid(`access-${s}`)"
              type="checkbox"
              :checked="accessScales.includes(s)"
              class="accent-nf-accent focus-visible:nf-focus"
              @change="toggleAccess(s)"
            />
            {{ s }}
          </label>
        </div>
      </fieldset>
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.narrative.scaleReview.payload.reputationLabel") }}
        <input
          :data-testid="testid('reputation')"
          v-model="reputation"
          type="number"
          min="0"
          max="100"
          step="1"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        />
      </label>
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.narrative.scaleReview.payload.hardnessLabel") }}
        <select
          :data-testid="testid('hardness')"
          v-model="hardness"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option value="HARD">{{ t("workspace.narrative.scaleReview.payload.hardness.HARD") }}</option>
          <option value="SOFT">{{ t("workspace.narrative.scaleReview.payload.hardness.SOFT") }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
        {{ t("workspace.narrative.scaleReview.payload.hardReasonLabel") }}
        <input
          :data-testid="testid('hard-reason')"
          v-model="hardReason"
          type="text"
          maxlength="500"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        />
      </label>
    </template>

    <!-- CHAPTER_EXCEPTION controls -->
    <template v-else>
      <fieldset class="flex flex-col gap-1">
        <legend class="text-[12px] text-nf-text-dim">
          {{ t("workspace.narrative.scaleReview.payload.claimsLabel") }}
        </legend>
        <div v-if="conflicts.length > 0" class="flex flex-col gap-1.5">
          <label
            v-for="(c, i) in conflicts"
            :key="i"
            class="flex items-start gap-2 rounded-md border border-nf-border bg-nf-bg-0 p-2 text-[12.5px] text-nf-text"
          >
            <input
              :data-testid="testid(`claim-${i}`)"
              type="checkbox"
              :checked="claimIndices.includes(i)"
              class="mt-0.5 accent-nf-accent focus-visible:nf-focus"
              @change="toggleClaim(i)"
            />
            <span>
              <span class="font-mono font-medium">#{{ i }} · {{ c.scale }}</span>
              <span class="text-nf-text-dim"> — {{ c.explanation }}</span>
            </span>
          </label>
        </div>
        <p v-else class="text-[12px] text-nf-text-dim">
          {{ t("workspace.narrative.scaleReview.payload.noClaims") }}
        </p>
      </fieldset>
    </template>
  </div>
</template>
