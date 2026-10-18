<template>
  <div>
    <div class="flex gap-3" role="radiogroup" :aria-label="t('workspace.world.editor.citationKind')">
      <label class="flex items-center gap-1.5 text-[13px] text-nf-text">
        <input :checked="model.kind === 'CHAPTER'" type="radio" value="CHAPTER" class="accent-nf-accent"
          @change="update('kind', 'CHAPTER')" />
        {{ t("workspace.world.editor.citationKindChapter") }}
      </label>
      <label class="flex items-center gap-1.5 text-[13px] text-nf-text">
        <input :checked="model.kind === 'REFERENCE'" type="radio" value="REFERENCE" class="accent-nf-accent"
          @change="update('kind', 'REFERENCE')" />
        {{ t("workspace.world.editor.citationKindReference") }}
      </label>
    </div>
    <label class="mt-2 block">
      <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.versionId") }}</span>
      <input
        :value="model.versionId"
        type="text"
        :placeholder="t('workspace.world.editor.versionIdPlaceholder')"
        class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 font-mono text-[12px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
        @input="update('versionId', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="mt-2 block">
      <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.quote") }}</span>
      <textarea
        :value="model.quote"
        rows="3"
        :placeholder="t('workspace.world.editor.quotePlaceholder')"
        class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
        @input="update('quote', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <p class="mt-1 text-[12px] text-nf-text-faint">{{ t("workspace.world.editor.quoteHint") }}</p>
    <div class="mt-2 grid grid-cols-2 gap-2">
      <label class="block">
        <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.start") }}</span>
        <input
          :value="model.start"
          type="number"
          min="0"
          class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          @input="update('start', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="block">
        <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.end") }}</span>
        <input
          :value="model.end"
          type="number"
          min="1"
          class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          @input="update('end', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Citation fieldset shared by fact creation (required citation, Q8) and
 * source attach. The strip-aware quote hint is pinned by Invariant 2: the
 * quote is matched against STORED content, so strip tags before matching
 * and never invent offsets.
 */
import { computed, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";

export interface CitationForm {
  kind: "CHAPTER" | "REFERENCE";
  versionId: string;
  quote: string;
  start: string;
  end: string;
}

const props = defineProps<{ modelValue: CitationForm }>();
const emit = defineEmits<{ (e: "update:modelValue", v: CitationForm): void }>();

const { t } = useLocale();

// Local copy: each keystroke emits from the latest local state instead of
// reading props.modelValue, which can be a render behind when several fields
// change in the same tick (stale emits would clobber each other).
const local = ref<CitationForm>({ ...props.modelValue });
watch(
  () => props.modelValue,
  (v) => {
    local.value = { ...v };
  },
);
const model = computed(() => local.value);

function update<K extends keyof CitationForm>(key: K, value: CitationForm[K]) {
  local.value = { ...local.value, [key]: value };
  emit("update:modelValue", local.value);
}
</script>
