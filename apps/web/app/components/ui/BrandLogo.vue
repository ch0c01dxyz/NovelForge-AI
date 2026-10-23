<script setup lang="ts">
import { onMounted } from "vue";
import { useBranding, type PlatformBranding } from "../../composables/useBranding";
const props = defineProps<{ preview?: PlatformBranding; compact?: boolean; large?: boolean }>();
const { branding, loaded, load } = useBranding();
onMounted(() => { if (!props.preview && !loaded.value) void load().catch(() => { /* Keep the default brand when public settings are unavailable. */ }); });
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-2.5" :aria-label="(preview ?? branding).name">
    <span class="grid shrink-0 place-items-center rounded-md bg-nf-accent font-nf-literary font-bold" :class="[large ? 'size-7' : 'size-6.5', (preview ?? branding).mark.length > 1 ? 'text-[10px]' : large ? 'text-base' : 'text-[15px]']" :style="{ color: (preview ?? branding).markColor }" aria-hidden="true">{{ (preview ?? branding).mark }}</span>
    <span class="truncate" :class="compact ? 'hidden max-w-[96px] min-[360px]:inline sm:max-w-[10rem] xl:max-w-[15rem]' : 'max-w-[min(60vw,20rem)]'">{{ (preview ?? branding).name }}</span>
  </span>
</template>
