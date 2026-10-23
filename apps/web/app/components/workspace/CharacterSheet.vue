<template>
  <section
    :aria-label="t('workspace.characters.sheet.title')"
    class="flex h-full flex-col gap-3 rounded-lg border border-nf-border bg-nf-bg-1 p-4"
    data-testid="character-sheet"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.characters.sheet.title") }}
    </h3>

    <div v-if="!character" class="flex h-full items-center justify-center">
      <p
        class="text-[12.5px] text-nf-text-faint"
        data-testid="select-character-first"
      >
        {{ t("workspace.characters.panel.selectCharacterFirst") }}
      </p>
    </div>

    <template v-else>
      <dl class="flex flex-col gap-3">
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
            {{ t("workspace.characters.sheet.nameLabel") }}
          </dt>
          <dd
            class="mt-0.5 font-nf-literary text-[18px] text-nf-text"
            data-testid="character-sheet-name"
          >
            {{ character.name }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
            {{ t("workspace.characters.sheet.keyLabel") }}
          </dt>
          <dd class="mt-0.5 font-mono text-[13px] text-nf-text-dim">
            {{ character.key }}
          </dd>
        </div>
        <div v-if="character.summary">
          <dt class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
            {{ t("workspace.characters.sheet.summaryLabel") }}
          </dt>
          <dd
            class="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-nf-text-dim"
            data-testid="character-sheet-summary"
          >
            {{ character.summary }}
          </dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
            {{ t("workspace.characters.sheet.storyEntityLabel") }}
          </dt>
          <dd class="mt-0.5">
            <span
              v-if="character.storyEntityId"
              class="inline-block rounded-md border border-nf-border-strong bg-nf-bg-2 px-2 py-0.5 font-mono text-[12px] text-nf-text-dim"
              data-testid="character-sheet-entity"
            >
              {{ character.storyEntityId }}
            </span>
            <span v-else class="text-[12.5px] text-nf-text-faint">
              {{ t("workspace.characters.sheet.storyEntityNone") }}
            </span>
          </dd>
        </div>
      </dl>
      <section v-if="character.affiliations?.length" :aria-label="t('storySuggestions.affiliations')" class="rounded-lg border border-nf-border p-3">
        <h4 class="text-sm font-semibold">{{ t('storySuggestions.affiliations') }}</h4>
        <ul class="mt-2 space-y-2"><li v-for="group in character.affiliations" :key="group.groupId" class="text-sm text-nf-text-dim"><strong>{{ group.name }}</strong><p>{{ ['MEMBER', 'LEADER'].includes(group.role ?? '') ? t(`storySuggestions.${group.role}`) : group.role || group.statement }}</p></li></ul>
        <p v-if="character.affiliationsTruncated" class="mt-2 text-xs text-nf-text-dim">{{ t('storySuggestions.moreAffiliations') }}</p>
      </section>

      <div
        role="note"
        class="mt-auto rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2.5"
        data-testid="character-sheet-noedit"
      >
        <p class="text-[12px] font-semibold text-nf-text-dim">
          {{ t("workspace.characters.sheet.noEditTitle") }}
        </p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-nf-text-faint">
          {{ t("workspace.characters.sheet.noEditBody") }}
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Character sheet (NF-WF-016, Invariant 1.1): read-only detail view.
 *
 * `storyEntityId` is displayed as a read-only label here. Explicit author
 * linking is available in Health & Memory; this sheet directs authors there
 * without deleting the character or its knowledge. All values render as text.
 */
import { useLocale } from "../../composables/useLocale";
import type { WorkspaceCharacter } from "./CharacterPanel.vue";

defineProps<{
  character: WorkspaceCharacter | null;
}>();

const { t } = useLocale();
</script>
