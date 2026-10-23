<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useLocale();
const dialog = ref<HTMLDialogElement | null>(null);
let opener: HTMLElement | null = null, overflow: string | null = null;
function release() {
  if (overflow !== null) { document.body.style.overflow = overflow; overflow = null; }
  if (opener?.isConnected) opener.focus();
}
watch(() => props.open, async open => {
  await nextTick();
  if (open !== props.open || !dialog.value) return;
  if (open) {
    opener = document.activeElement as HTMLElement | null;
    overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.value.showModal();
    dialog.value.focus();
  } else { if (dialog.value.open) dialog.value.close(); release(); }
}, { immediate: true });
onUnmounted(release);
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if (event.key === "Escape") { event.preventDefault(); emit("close"); }
  else trapDialogFocus(event, dialog.value);
}
</script>
<template>
  <dialog ref="dialog" tabindex="-1" :aria-label="title" aria-modal="true"
    class="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-nf-border-strong bg-nf-bg-1 p-0 text-nf-text shadow-nf-md backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    @cancel.prevent="emit('close')" @keydown="keydown"
    @click.self="emit('close')">
    <header class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-nf-border bg-nf-bg-1 p-5">
      <h2 class="font-nf-literary text-xl font-semibold">{{ title }}</h2>
      <button type="button" class="nf-btn grid size-11 shrink-0 place-items-center" :aria-label="t('readerTools.close')" @click="emit('close')">✕</button>
    </header>
    <div class="p-5"><slot /></div>
  </dialog>
</template>
