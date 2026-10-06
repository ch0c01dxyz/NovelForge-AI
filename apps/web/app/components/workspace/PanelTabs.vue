<template>
  <div
    role="tablist"
    :aria-label="ariaLabel"
    class="flex flex-wrap gap-1 border-b border-nf-border"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      :id="`tab-${tab.id}`"
      :aria-selected="tab.id === modelValue"
      :aria-controls="`panel-${tab.id}`"
      :tabindex="tab.id === modelValue ? 0 : -1"
      data-testid="panel-tab"
      :class="
        tab.id === modelValue
          ? 'border-b-2 border-nf-accent px-3 py-2 text-[13px] font-semibold text-nf-text focus-visible:nf-focus'
          : 'border-b-2 border-transparent px-3 py-2 text-[13px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus'
      "
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * PanelTabs (NF-WF-016): accessible tab bar shared by TimelinePanel and
 * PlanningPanel. Implements the ARIA tabs keyboard pattern (Left/Right/
 * Home/End move and activate). Labels arrive translated via props so this
 * component carries no i18n keys of its own.
 */
export interface PanelTab {
  id: string;
  label: string;
}

const props = defineProps<{
  tabs: PanelTab[];
  modelValue: string;
  /** Accessible name for the tablist (already translated by the caller). */
  ariaLabel: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", id: string): void;
}>();

function onKeydown(e: KeyboardEvent) {
  const ids = props.tabs.map((t) => t.id);
  const idx = ids.indexOf(props.modelValue);
  let next: number | null = null;
  if (e.key === "ArrowRight") next = (idx + 1) % ids.length;
  else if (e.key === "ArrowLeft") next = (idx - 1 + ids.length) % ids.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = ids.length - 1;
  if (next === null) return;
  e.preventDefault();
  const id = ids[next]!;
  emit("update:modelValue", id);
  document.getElementById(`tab-${id}`)?.focus();
}

</script>
