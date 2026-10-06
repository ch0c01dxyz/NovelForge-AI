<script setup lang="ts">
/**
 * Version history (NF-WF-018A): the append-only, immutable version list
 * of an agent/skill/workflow definition, served by the GAP-064
 * `GET /api/:kind/:id/versions` route. Read-only — no affordance edits
 * a version in place; "edit" always appends via DefinitionDetail.
 */
import type { DefinitionVersionRow } from "../../composables/useAiStudio";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  versions: DefinitionVersionRow[];
  currentVersionId: string | null;
}>();

const { t } = useLocale();

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}
</script>

<template>
  <section aria-labelledby="version-history-heading">
    <h3
      id="version-history-heading"
      class="mb-2 text-[13px] font-semibold text-nf-text"
    >
      {{ t("aiStudio.definitions.versionHistory") }}
    </h3>
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="border-b border-nf-border text-left text-nf-text-faint">
          <th scope="col" class="px-2 py-1.5 font-medium">
            {{ t("aiStudio.definitions.versionCol") }}
          </th>
          <th scope="col" class="px-2 py-1.5 font-medium">
            {{ t("aiStudio.definitions.createdAtCol") }}
          </th>
          <th scope="col" class="px-2 py-1.5 font-medium">
            {{ t("aiStudio.definitions.createdByCol") }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="v in props.versions"
          :key="v.id"
          class="border-b border-nf-border/60 text-nf-text-dim"
          :data-testid="`version-row-${v.number}`"
        >
          <td class="px-2 py-1.5 font-medium text-nf-text">
            v{{ v.number }}
            <span
              v-if="v.id === props.currentVersionId"
              class="ml-1 rounded bg-nf-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-nf-accent-hi"
            >
              {{ t("aiStudio.definitions.current") }}
            </span>
          </td>
          <td class="px-2 py-1.5">{{ formatDate(v.createdAt) }}</td>
          <td class="px-2 py-1.5">
            {{ v.createdBy ? t("aiStudio.definitions.createdBy", { name: v.createdBy }) : "—" }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
