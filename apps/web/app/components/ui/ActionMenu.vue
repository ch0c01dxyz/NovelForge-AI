<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

defineProps<{ label: string }>();
const menu = ref<HTMLDetailsElement | null>(null);
function close(event: KeyboardEvent) {
  if (event.key !== "Escape" || !menu.value?.open) return;
  event.preventDefault();
  event.stopPropagation();
  menu.value.open = false;
  menu.value.querySelector("summary")?.focus();
}
function outside(event: PointerEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) menu.value.open = false;
}
function selected(event: MouseEvent) {
  const action = (event.target as Element).closest("a,button:not(:disabled)");
  if (!action || !menu.value) return;
  const returnFocus = action.tagName === "BUTTON" && menu.value.contains(document.activeElement);
  menu.value.open = false;
  if (returnFocus) menu.value.querySelector("summary")?.focus();
}
onMounted(() => document.addEventListener("pointerdown", outside));
onUnmounted(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <details ref="menu" class="nf-menu" @keydown="close">
    <summary
      class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
      :aria-label="label"
    >
      <slot name="trigger">{{ label }}</slot>
      <svg class="nf-menu-chevron size-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
    </summary>
    <div class="nf-menu-panel" @click="selected"><slot /></div>
  </details>
</template>
