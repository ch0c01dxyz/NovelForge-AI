<template>
  <section
    :aria-label="t('workspace.relationships.bonds.title')"
    class="flex flex-col gap-4"
    data-testid="bonds"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.relationships.bonds.title") }}
    </h3>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.relationships.bonds.loading") }}
    </p>
    <div v-else-if="loadError" class="flex flex-col gap-2">
      <p role="alert" class="text-[12.5px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="reload"
      >
        {{ t("workspace.relationships.common.retry") }}
      </button>
    </div>

    <template v-else>
      <p
        v-if="!bonds.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="bonds-empty"
      >
        {{ t("workspace.relationships.bonds.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2" data-testid="bonds-list">
        <li
          v-for="bond in bonds"
          :key="bond.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              :aria-expanded="expandedBondId === bond.id"
              :data-testid="`bond-toggle-${bond.id}`"
              class="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-nf-text hover:underline focus-visible:nf-focus"
              @click="toggleBond(bond)"
            >
              {{ t(`workspace.relationships.bonds.structure.${bond.structure}`) }}
              <span class="font-normal text-nf-text-dim">
                — {{ bondMemberNames(bond) }}
              </span>
            </button>
            <span class="shrink-0 font-mono text-[11px] text-nf-text-faint">
              {{ spanLabel(bond.fromChapter, bond.toChapter) }}
            </span>
            <button
              v-if="confirmingId !== bond.id"
              type="button"
              :aria-label="t('workspace.relationships.bonds.deleteAria')"
              :data-testid="`bond-delete-${bond.id}`"
              class="shrink-0 rounded-md border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-warn focus-visible:nf-focus"
              @click="confirmingId = bond.id"
            >
              {{ t("workspace.relationships.bonds.deleteButton") }}
            </button>
          </div>

          <div
            v-if="confirmingId === bond.id"
            class="mt-2 rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-2"
            role="group"
            :aria-label="t('workspace.relationships.bonds.delete.confirmTitle')"
            :data-testid="`bond-confirm-${bond.id}`"
          >
            <p class="text-[12px] font-medium text-nf-warn">
              {{ t("workspace.relationships.bonds.delete.confirmTitle") }}
            </p>
            <p class="mt-0.5 text-[12px] leading-relaxed text-nf-text-dim">
              {{
                t("workspace.relationships.bonds.delete.confirmBody", {
                  structure: t(`workspace.relationships.bonds.structure.${bond.structure}`),
                })
              }}
            </p>
            <p
              v-if="deleteError"
              role="alert"
              class="mt-1 text-[12px] text-nf-warn"
            >
              {{ deleteError }}
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="deleting"
                :data-testid="`bond-confirm-yes-${bond.id}`"
                class="rounded-md border border-nf-warn/50 px-2.5 py-1 text-[12.5px] font-semibold text-nf-warn hover:bg-nf-warn/10 focus-visible:nf-focus disabled:opacity-50"
                @click="doDelete(bond)"
              >
                {{
                  deleting
                    ? t("workspace.relationships.common.deleting")
                    : t("workspace.relationships.bonds.delete.confirm")
                }}
              </button>
              <button
                type="button"
                :disabled="deleting"
                class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                @click="confirmingId = null; deleteError = null"
              >
                {{ t("workspace.relationships.bonds.delete.cancel") }}
              </button>
            </div>
          </div>

          <div v-if="expandedBondId === bond.id" class="mt-3 flex flex-col gap-3 border-t border-nf-border pt-3">
            <div>
              <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                {{ t("workspace.relationships.bonds.membersListLabel") }}
              </p>
              <p class="mt-0.5 text-[12.5px] text-nf-text-dim">
                {{ bondMemberNames(bond) }}
              </p>
            </div>

            <div>
              <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                {{ t("workspace.relationships.bonds.transitionsTitle") }}
              </p>
              <p
                v-if="transitionsLoading[bond.id]"
                class="mt-1 text-[12.5px] text-nf-text-faint"
              >
                {{ t("workspace.relationships.common.loading") }}
              </p>
              <p
                v-else-if="!(transitions[bond.id] ?? []).length"
                class="mt-1 text-[12.5px] text-nf-text-faint"
              >
                {{ t("workspace.relationships.bonds.transitionsEmpty") }}
              </p>
              <ul v-else class="mt-1 flex flex-col gap-1">
                <li
                  v-for="tr in transitions[bond.id]"
                  :key="tr.id"
                  class="text-[12.5px] text-nf-text-dim"
                >
                  {{
                    t("workspace.relationships.bonds.transitionSummary", {
                      kind: t(`workspace.relationships.bonds.kind.${tr.kind}`),
                      stage: t(`workspace.relationships.bonds.stage.${tr.stage}`),
                      chapter: tr.chapter,
                    })
                  }}
                </li>
              </ul>

              <form
                class="mt-2 flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
                :data-testid="`transition-form-${bond.id}`"
                @submit.prevent="addTransition(bond)"
              >
                <div class="grid grid-cols-3 gap-2.5">
                  <div>
                    <label
                      :for="`${uid}-${bond.id}-tchapter`"
                      class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                    >
                      {{ t("workspace.relationships.bonds.transitionChapterLabel") }}
                    </label>
                    <input
                      :id="`${uid}-${bond.id}-tchapter`"
                      v-model="transitionDrafts[bond.id]!.chapter"
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                    />
                  </div>
                  <div>
                    <label
                      :for="`${uid}-${bond.id}-tstage`"
                      class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                    >
                      {{ t("workspace.relationships.bonds.transitionStageLabel") }}
                    </label>
                    <select
                      :id="`${uid}-${bond.id}-tstage`"
                      v-model="transitionDrafts[bond.id]!.stage"
                      class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                    >
                      <option v-for="s in bondStages" :key="s" :value="s">
                        {{ t(`workspace.relationships.bonds.stage.${s}`) }}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      :for="`${uid}-${bond.id}-tkind`"
                      class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                    >
                      {{ t("workspace.relationships.bonds.transitionKindLabel") }}
                    </label>
                    <select
                      :id="`${uid}-${bond.id}-tkind`"
                      v-model="transitionDrafts[bond.id]!.kind"
                      class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                    >
                      <option v-for="k in transitionKinds" :key="k" :value="k">
                        {{ t(`workspace.relationships.bonds.kind.${k}`) }}
                      </option>
                    </select>
                  </div>
                </div>
                <p
                  v-if="transitionErrors[bond.id]"
                  role="alert"
                  class="text-[12px] text-nf-warn"
                >
                  {{ transitionErrors[bond.id] }}
                </p>
                <button
                  type="submit"
                  :disabled="addingTransitionId === bond.id"
                  :data-testid="`transition-submit-${bond.id}`"
                  class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                >
                  {{
                    addingTransitionId === bond.id
                      ? t("workspace.relationships.bonds.addingTransition")
                      : t("workspace.relationships.bonds.addTransition")
                  }}
                </button>
              </form>
            </div>

            <form
              class="flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
              :data-testid="`interaction-form-${bond.id}`"
              @submit.prevent="recordInteraction(bond)"
            >
              <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                {{ t("workspace.relationships.bonds.interactionsTitle") }}
              </p>
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    :for="`${uid}-${bond.id}-ichapter`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.relationships.bonds.interactionChapterLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${bond.id}-ichapter`"
                    v-model="interactionDrafts[bond.id]!.chapter"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
                <div>
                  <label
                    :for="`${uid}-${bond.id}-iweight`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.relationships.bonds.interactionWeightLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${bond.id}-iweight`"
                    v-model="interactionDrafts[bond.id]!.weight"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
              </div>
              <div>
                <label
                  :for="`${uid}-${bond.id}-isummary`"
                  class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                >
                  {{ t("workspace.relationships.bonds.interactionSummaryLabel") }}
                </label>
                <input
                  :id="`${uid}-${bond.id}-isummary`"
                  v-model="interactionDrafts[bond.id]!.summary"
                  type="text"
                  maxlength="20000"
                  class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                />
              </div>
              <p
                v-if="interactionErrors[bond.id]"
                role="alert"
                class="text-[12px] text-nf-warn"
              >
                {{ interactionErrors[bond.id] }}
              </p>
              <button
                type="submit"
                :disabled="recordingInteractionId === bond.id"
                :data-testid="`interaction-submit-${bond.id}`"
                class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
              >
                {{
                  recordingInteractionId === bond.id
                    ? t("workspace.relationships.bonds.addingInteraction")
                    : t("workspace.relationships.bonds.addInteraction")
                }}
              </button>
            </form>

            <form
              class="flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
              :data-testid="`stage-form-${bond.id}`"
              @submit.prevent="lookupStage(bond)"
            >
              <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                {{ t("workspace.relationships.bonds.stageAtTitle") }}
              </p>
              <div class="flex items-end gap-2.5">
                <div class="w-36">
                  <label
                    :for="`${uid}-${bond.id}-schapter`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.relationships.bonds.stageAtChapterLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${bond.id}-schapter`"
                    v-model="stageDrafts[bond.id]!.chapter"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
                <button
                  type="submit"
                  :disabled="checkingStageId === bond.id"
                  :data-testid="`stage-submit-${bond.id}`"
                  class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                >
                  {{ t("workspace.relationships.bonds.stageAtCheck") }}
                </button>
              </div>
              <p
                v-if="stageErrors[bond.id]"
                role="alert"
                class="text-[12px] text-nf-warn"
              >
                {{ stageErrors[bond.id] }}
              </p>
              <div
                v-if="stageResults[bond.id] !== undefined"
                aria-live="polite"
                :data-testid="`stage-result-${bond.id}`"
                class="rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-2"
              >
                <p v-if="stageResults[bond.id]" class="text-[12.5px] text-nf-text">
                  {{
                    t("workspace.relationships.bonds.stageAtResult", {
                      chapter: lastStageChapter[bond.id] ?? "",
                      stage: t(`workspace.relationships.bonds.stage.${stageResults[bond.id]}`),
                    })
                  }}
                </p>
                <p v-else class="text-[12.5px] text-nf-text-faint">
                  {{
                    t("workspace.relationships.bonds.stageAtNone", {
                      chapter: lastStageChapter[bond.id] ?? "",
                    })
                  }}
                </p>
              </div>
            </form>

            <form
              class="flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
              :data-testid="`neglect-form-${bond.id}`"
              @submit.prevent="checkNeglect(bond)"
            >
              <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                {{ t("workspace.relationships.bonds.neglectTitle") }}
              </p>
              <div class="flex items-end gap-2.5">
                <div class="w-36">
                  <label
                    :for="`${uid}-${bond.id}-nchapter`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.relationships.bonds.neglectChapterLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${bond.id}-nchapter`"
                    v-model="neglectDrafts[bond.id]!.chapter"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
                <button
                  type="submit"
                  :disabled="checkingNeglectId === bond.id"
                  :data-testid="`neglect-submit-${bond.id}`"
                  class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                >
                  {{ t("workspace.relationships.bonds.neglectCheck") }}
                </button>
              </div>
              <p
                v-if="neglectErrors[bond.id]"
                role="alert"
                class="text-[12px] text-nf-warn"
              >
                {{ neglectErrors[bond.id] }}
              </p>
              <div
                v-if="neglectResults[bond.id] !== undefined"
                aria-live="polite"
                :data-testid="`neglect-result-${bond.id}`"
                class="rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-2"
              >
                <p
                  v-if="neglectResults[bond.id]!.neglected"
                  class="text-[12.5px] text-nf-warn"
                >
                  {{
                    t("workspace.relationships.bonds.neglectBad", {
                      chapters: neglectResults[bond.id]!.chaptersSinceMeaningful ?? 0,
                      last: neglectResults[bond.id]!.lastMeaningfulChapter ?? 0,
                    })
                  }}
                </p>
                <p
                  v-else-if="neglectResults[bond.id]!.lastMeaningfulChapter !== null"
                  class="text-[12.5px] text-nf-ok"
                >
                  {{
                    t("workspace.relationships.bonds.neglectOk", {
                      last: neglectResults[bond.id]!.lastMeaningfulChapter ?? "",
                    })
                  }}
                </p>
                <p v-else class="text-[12.5px] text-nf-text-faint">
                  {{ t("workspace.relationships.bonds.neglectNever") }}
                </p>
              </div>
            </form>
          </div>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="bond-create-form"
        @submit.prevent="create"
      >
        <div>
          <label
            :for="`${uid}-structure`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.relationships.bonds.structureLabel") }}
          </label>
          <select
            :id="`${uid}-structure`"
            v-model="structure"
            data-testid="bond-structure-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="s in bondStructures" :key="s" :value="s">
              {{ t(`workspace.relationships.bonds.structure.${s}`) }}
            </option>
          </select>
        </div>
        <fieldset>
          <legend class="mb-1 text-[12px] font-medium text-nf-text-dim">
            {{ t("workspace.relationships.bonds.membersLabel") }}
          </legend>
          <p class="mb-1.5 text-[11.5px] text-nf-text-faint">
            {{ t("workspace.relationships.bonds.membersHint") }}
          </p>
          <div class="flex max-h-36 flex-col gap-1 overflow-y-auto">
            <label
              v-for="c in characters"
              :key="c.id"
              class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-within:nf-focus"
            >
              <input
                v-model="memberIds"
                type="checkbox"
                :value="c.id"
                :data-testid="`bond-member-${c.id}`"
                class="h-4 w-4"
              />
              {{ c.name }}
            </label>
          </div>
        </fieldset>
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label
              :for="`${uid}-from`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.bonds.fromChapterLabel") }}
            </label>
            <input
              :id="`${uid}-from`"
              v-model="fromChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="bond-from-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <div>
            <label
              :for="`${uid}-to`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.bonds.toChapterLabel") }}
            </label>
            <input
              :id="`${uid}-to`"
              v-model="toChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="bond-to-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
        </div>
        <p v-if="fieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ fieldError }}
        </p>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn" data-testid="bond-submit-error">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="bond-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.relationships.bonds.adding")
              : t("workspace.relationships.bonds.add")
          }}
        </button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Bonds (NF-WF-016, Invariant 1.2): list, create with member selection,
 * delete (two-step explicit confirmation), transitions, interactions,
 * and the read-only stage-at-chapter and neglect readouts.
 *
 * There is no list-interactions route: interactions surface through the
 * neglect readout, which is the API's read side. The UI does not invent
 * a list the API cannot serve.
 */
import { onMounted, reactive, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import type { RelationshipCharacter } from "./RelationshipPanel.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  characters: RelationshipCharacter[];
}>();

const { t } = useLocale();
const { api } = useApi();

const uid = `bonds-${Math.random().toString(36).slice(2, 8)}`;

const bondStructures = [
  "MONOGAMY",
  "POLYGAMY",
  "POLYAMORY",
  "HAREM",
  "REVERSE_HAREM",
  "POLITICAL_MARRIAGE",
  "CUSTOM",
] as const;
type BondStructure = (typeof bondStructures)[number];

const bondStages = [
  "ATTRACTION",
  "COURTSHIP",
  "COMMITMENT",
  "MARRIAGE",
  "LEGACY",
] as const;
type BondStage = (typeof bondStages)[number];

const transitionKinds = ["ADVANCE", "REGRESS", "SEVER"] as const;
type TransitionKind = (typeof transitionKinds)[number];

interface Bond {
  id: string;
  novelId: string;
  structure: BondStructure;
  memberIds: string[];
  fromChapter: number;
  toChapter: number | null;
}

interface Transition {
  id: string;
  bondId: string;
  chapter: number;
  stage: BondStage;
  kind: TransitionKind;
}

interface NeglectReport {
  lastMeaningfulChapter: number | null;
  chaptersSinceMeaningful: number | null;
  neglected: boolean;
}

const bonds = ref<Bond[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const structure = ref<BondStructure>("MONOGAMY");
const memberIds = ref<string[]>([]);
const fromChapter = ref("");
const toChapter = ref("");
const creating = ref(false);
const fieldError = ref<string | null>(null);
const submitError = ref<string | null>(null);

const expandedBondId = ref<string | null>(null);
const confirmingId = ref<string | null>(null);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

const transitions = reactive<Record<string, Transition[]>>({});
const transitionsLoading = reactive<Record<string, boolean>>({});
const transitionDrafts = reactive<Record<string, { chapter: string; stage: BondStage; kind: TransitionKind }>>({});
const transitionErrors = reactive<Record<string, string | null>>({});
const addingTransitionId = ref<string | null>(null);

const interactionDrafts = reactive<Record<string, { chapter: string; weight: string; summary: string }>>({});
const interactionErrors = reactive<Record<string, string | null>>({});
const recordingInteractionId = ref<string | null>(null);

const stageDrafts = reactive<Record<string, { chapter: string }>>({});
const stageResults = reactive<Record<string, BondStage | null | undefined>>({});
const lastStageChapter = reactive<Record<string, string>>({});
const stageErrors = reactive<Record<string, string | null>>({});
const checkingStageId = ref<string | null>(null);

const neglectDrafts = reactive<Record<string, { chapter: string }>>({});
const neglectResults = reactive<Record<string, NeglectReport | undefined>>({});
const neglectErrors = reactive<Record<string, string | null>>({});
const checkingNeglectId = ref<string | null>(null);

function basePath() {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/relationships/bonds`;
}
function bondPath(bondId: string) {
  return `${basePath()}/${bondId}`;
}

function nameOf(id: string): string {
  return props.characters.find((c) => c.id === id)?.name ?? id;
}
function bondMemberNames(bond: Bond): string {
  return bond.memberIds.map(nameOf).join(", ");
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.relationships.error.unauthorized");
    if (err.status === 403) return t("workspace.relationships.error.forbidden");
    if (err.status === 404) return t("workspace.relationships.error.notFound");
    if (err.status === 400) return t("workspace.relationships.error.invalid");
    return t("workspace.relationships.error.generic", { code: err.code });
  }
  return t("workspace.relationships.error.generic", { code: "UNKNOWN" });
}

function spanLabel(from: number, to: number | null): string {
  return to === null
    ? t("workspace.relationships.common.chapterOpen", { from })
    : t("workspace.relationships.common.chapterRange", { from, to });
}

function parseChapter(raw: unknown): number | null {
  // Vue auto-casts <input type="number"> v-model values to numbers, so
  // both shapes arrive here; a cleared input stays "".
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 1 && raw <= 100000 ? raw : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100000) return null;
  return n;
}

/** Weight is a decimal 0..1; the number input may hand us a real number. */
function parseWeight(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

/** True for "" and whitespace-only strings (a cleared number input stays ""). */
function isBlankChapter(raw: unknown): boolean {
  return raw === "" || (typeof raw === "string" && raw.trim() === "");
}

function ensureDrafts(bond: Bond) {
  transitionDrafts[bond.id] ??= { chapter: "", stage: "ATTRACTION", kind: "ADVANCE" };
  interactionDrafts[bond.id] ??= { chapter: "", weight: "", summary: "" };
  stageDrafts[bond.id] ??= { chapter: "" };
  neglectDrafts[bond.id] ??= { chapter: "" };
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    bonds.value = await api<Bond[]>(`${basePath()}?take=200&skip=0`);
    for (const bond of bonds.value) ensureDrafts(bond);
    if (expandedBondId.value && !bonds.value.some((b) => b.id === expandedBondId.value)) {
      expandedBondId.value = null;
    }
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function loadTransitions(bond: Bond) {
  transitionsLoading[bond.id] = true;
  try {
    transitions[bond.id] = await api<Transition[]>(`${bondPath(bond.id)}/transitions`);
  } catch (err) {
    transitionErrors[bond.id] = apiErrorMessage(err);
  } finally {
    transitionsLoading[bond.id] = false;
  }
}

async function create() {
  fieldError.value = null;
  submitError.value = null;
  if (memberIds.value.length < 1 || memberIds.value.length > 64) {
    fieldError.value = t("workspace.relationships.bonds.membersError");
    return;
  }
  const from = parseChapter(fromChapter.value);
  const to = isBlankChapter(toChapter.value) ? null : parseChapter(toChapter.value);
  if (from === null || (!isBlankChapter(toChapter.value) && to === null)) {
    fieldError.value = t("workspace.relationships.stances.chapterError");
    return;
  }
  if (to !== null && to < (from as number)) {
    fieldError.value = t("workspace.relationships.stances.rangeError");
    return;
  }
  creating.value = true;
  try {
    const created = await api<Bond>(basePath(), {
      method: "POST",
      body: JSON.stringify({
        structure: structure.value,
        memberIds: memberIds.value,
        fromChapter: from,
        toChapter: to,
      }),
    });
    structure.value = "MONOGAMY";
    memberIds.value = [];
    fromChapter.value = "";
    toChapter.value = "";
    bonds.value = [...bonds.value, created];
    ensureDrafts(created);
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

async function doDelete(bond: Bond) {
  deleteError.value = null;
  deleting.value = true;
  try {
    await api(bondPath(bond.id), { method: "DELETE" });
    confirmingId.value = null;
    if (expandedBondId.value === bond.id) expandedBondId.value = null;
    bonds.value = bonds.value.filter((b) => b.id !== bond.id);
  } catch (err) {
    deleteError.value = apiErrorMessage(err);
  } finally {
    deleting.value = false;
  }
}

async function addTransition(bond: Bond) {
  const draft = transitionDrafts[bond.id]!;
  transitionErrors[bond.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    transitionErrors[bond.id] = t("workspace.relationships.stances.chapterError");
    return;
  }
  addingTransitionId.value = bond.id;
  try {
    const created = await api<Transition>(`${bondPath(bond.id)}/transitions`, {
      method: "POST",
      body: JSON.stringify({ chapter, stage: draft.stage, kind: draft.kind }),
    });
    transitions[bond.id] = [...(transitions[bond.id] ?? []), created].sort(
      (a, b) => a.chapter - b.chapter,
    );
    draft.chapter = "";
    stageResults[bond.id] = undefined;
  } catch (err) {
    transitionErrors[bond.id] = apiErrorMessage(err);
  } finally {
    addingTransitionId.value = null;
  }
}

async function recordInteraction(bond: Bond) {
  const draft = interactionDrafts[bond.id]!;
  interactionErrors[bond.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    interactionErrors[bond.id] = t("workspace.relationships.stances.chapterError");
    return;
  }
  const weight = parseWeight(draft.weight);
  if (weight === null) {
    interactionErrors[bond.id] = t("workspace.relationships.bonds.interactionWeightError");
    return;
  }
  const s = draft.summary.trim();
  if (s.length > 20000) {
    interactionErrors[bond.id] = t("workspace.relationships.bonds.interactionSummaryError");
    return;
  }
  recordingInteractionId.value = bond.id;
  try {
    await api(`${bondPath(bond.id)}/interactions`, {
      method: "POST",
      body: JSON.stringify({
        chapter,
        weight,
        summary: s ? s : null,
      }),
    });
    draft.chapter = "";
    draft.weight = "";
    draft.summary = "";
    neglectResults[bond.id] = undefined;
  } catch (err) {
    interactionErrors[bond.id] = apiErrorMessage(err);
  } finally {
    recordingInteractionId.value = null;
  }
}

async function lookupStage(bond: Bond) {
  const draft = stageDrafts[bond.id]!;
  stageErrors[bond.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    stageErrors[bond.id] = t("workspace.relationships.stances.chapterError");
    stageResults[bond.id] = undefined;
    return;
  }
  checkingStageId.value = bond.id;
  try {
    const res = await api<{ stage: BondStage | null }>(
      `${bondPath(bond.id)}/stage?chapter=${chapter}`,
    );
    stageResults[bond.id] = res.stage ?? null;
    lastStageChapter[bond.id] = String(chapter);
  } catch (err) {
    stageErrors[bond.id] = apiErrorMessage(err);
  } finally {
    checkingStageId.value = null;
  }
}

async function checkNeglect(bond: Bond) {
  const draft = neglectDrafts[bond.id]!;
  neglectErrors[bond.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    neglectErrors[bond.id] = t("workspace.relationships.stances.chapterError");
    neglectResults[bond.id] = undefined;
    return;
  }
  checkingNeglectId.value = bond.id;
  try {
    neglectResults[bond.id] = await api<NeglectReport>(
      `${bondPath(bond.id)}/neglect?chapter=${chapter}`,
    );
  } catch (err) {
    neglectErrors[bond.id] = apiErrorMessage(err);
  } finally {
    checkingNeglectId.value = null;
  }
}

function toggleBond(bond: Bond) {
  if (expandedBondId.value === bond.id) {
    expandedBondId.value = null;
    return;
  }
  expandedBondId.value = bond.id;
  ensureDrafts(bond);
  if (transitions[bond.id] === undefined) void loadTransitions(bond);
}

onMounted(() => {
  void reload();
});
</script>
