<script setup lang="ts">
import SiteHeader from "./components/ui/SiteHeader.vue";
const route = useRoute();
// The author home, writer and AI Studio already own their application header.
const hasOwnHeader = computed(
  () =>
    ["/", "/author", "/login", "/sign-in"].includes(route.path) ||
    /^\/read\/[^/]+\/\d+\/?$/.test(route.path) ||
    /^\/workspaces\/[^/]+\/(ai-studio|novels\/[^/]+)\/?$/.test(route.path),
);
</script>

<template>
  <div>
    <SiteHeader v-if="!hasOwnHeader" />
    <NuxtPage :page-key="/^\/read\/[^/]+\/\d+\/?$/.test(route.path) ? page => page.path : undefined" />
  </div>
</template>
