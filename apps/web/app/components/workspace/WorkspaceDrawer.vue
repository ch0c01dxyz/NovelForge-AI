<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40" role="presentation">
      <div
        class="absolute inset-0 bg-black/40"
        data-testid="drawer-backdrop"
        @click="emit('close')"
      />
      <section
        ref="panelRef"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="absolute right-0 top-0 flex h-full w-full max-w-[720px] flex-col border-l border-nf-border bg-nf-bg-1 shadow-xl focus-visible:nf-focus"
      >
        <header class="flex items-center gap-3 border-b border-nf-border px-5 py-3">
          <h2 class="min-w-0 flex-1 truncate text-[15px] font-semibold text-nf-text">
            {{ title }}
          </h2>
          <button
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Workspace drawer shell (NF-WF-016): the right-side drawer that hosts
 * every authoring-workspace panel. Esc dismisses and focus returns to
 * the opener; the panel content is the domain component passed via the
 * default slot.
 *
 * Follows the 007/015 component pattern (props/emits, no store).
 */
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  /** Whether the drawer is open. */
  open: boolean;
  /** Visible title (already translated by the caller). */
  title: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useLocale();
const panelRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      opener.value = (document.activeElement as HTMLElement | null) ?? null;
      nextTick(() => panelRef.value?.focus());
    } else {
      opener.value?.focus();
      opener.value = null;
    }
  },
  { flush: "post" },
);

onMounted(() => document.addEventListener("keydown", onKeydown, true));
onUnmounted(() => document.removeEventListener("keydown", onKeydown, true));
