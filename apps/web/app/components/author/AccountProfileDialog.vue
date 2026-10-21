<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
defineProps<{ profile: { displayName: string; email: string } | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useLocale();
const dialog = ref<HTMLDialogElement | null>(null);
onMounted(() => dialog.value?.showModal?.());
</script>
<template>
  <dialog ref="dialog" data-testid="account-profile-dialog" :aria-label="t('accountProfile.title')" class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 text-nf-text shadow-nf-lg backdrop:bg-black/60" @cancel.prevent="emit('close')">
    <h2 class="font-nf-literary text-2xl font-semibold">{{ t('accountProfile.title') }}</h2>
    <dl v-if="profile" class="mt-5 space-y-4 text-[13px]">
      <div><dt class="text-nf-text-faint">{{ t('accountProfile.name') }}</dt><dd class="mt-1 break-words font-medium">{{ profile.displayName }}</dd></div>
      <div><dt class="text-nf-text-faint">{{ t('accountProfile.email') }}</dt><dd class="mt-1 break-all">{{ profile.email }}</dd></div>
    </dl>
    <p v-else class="mt-4 text-[13px] text-nf-text-dim">{{ t('accountProfile.unavailable') }}</p>
    <form method="dialog" class="mt-6 flex justify-end" @submit.prevent="emit('close')"><button type="submit" autofocus data-testid="account-profile-close" class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-4 py-2 text-[13px] text-nf-text focus-visible:nf-focus">{{ t('common.close') }}</button></form>
  </dialog>
</template>
