<script setup lang="ts">
/**
 * Notification bell (NF-WF-019C): the reader's in-app notification entry
 * point. Renders only when a session exists — the unread-count fetch
 * 401s for anonymous readers and the bell hides itself (progressive
 * enhancement; the inbox route is server-gated regardless).
 *
 * Polling only: the count refreshes on mount (no websocket in 019).
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const { api } = useApi();
const { t } = useLocale();

const visible = ref(false);
const unreadCount = ref(0);

onMounted(async () => {
  try {
    const data = await api<{ unreadCount: number }>("/reader/notifications?limit=1");
    unreadCount.value = data.unreadCount;
    visible.value = true;
  } catch (e) {
    // 401 → anonymous: no bell. Anything else → hide quietly too; the
    // inbox page surfaces load errors, not the bell.
    if (!(e instanceof ApiError) || e.status !== 401) {
      visible.value = false;
    }
  }
});
</script>

<template>
  <NuxtLink
    v-if="visible"
    to="/read/notifications"
    class="relative inline-flex items-center rounded-lg border border-nf-border bg-nf-bg-1 px-3 py-2 text-[13px] text-nf-text-dim shadow-nf-sm hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus"
    :aria-label="
      unreadCount > 0
        ? t('notifications.bellUnread', { n: unreadCount })
        : t('notifications.bellLabel')
    "
  >
    <span aria-hidden="true">🔔</span>
    <span class="ml-2 hidden sm:inline">{{ t("notifications.bellLabel") }}</span>
    <span
      v-if="unreadCount > 0"
      class="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-nf-accent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-nf-accent-ink"
      aria-hidden="true"
    >
      {{ unreadCount > 99 ? "99+" : unreadCount }}
    </span>
  </NuxtLink>
</template>
