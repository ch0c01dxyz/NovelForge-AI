<script setup lang="ts">
const route = useRoute();
await navigateTo({ path: "/sign-in", query: route.query }, { replace: true });
</script>
<template><div /></template>
