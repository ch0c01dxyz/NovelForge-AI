<script setup lang="ts">
import SiteHeader from "./components/ui/SiteHeader.vue";
const route = useRoute();
// The author home, writer and AI Studio already own their application header.
const hasOwnHeader = computed(
  () =>
    ["/", "/sign-in"].includes(route.path) ||
    /^\/workspaces\/[^/]+\/(ai-studio|novels\/[^/]+)\/?$/.test(route.path),
);
</script>

<template>
  <div>
    <SiteHeader v-if="!hasOwnHeader" />
    <NuxtPage />
  </div>
</template>
