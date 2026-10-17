/**
 * Client-side filter + pagination for the platform-admin tables
 * (pagination + search revision). The page owns the fetched arrays;
 * this only slices what the table renders so a 2 000+ row catalog
 * stays light in the DOM.
 *
 * ponytail: still client-side — the API returns full lists; move to
 * server-side ?offset/?limit when a catalog grows past memory.
 */
import { computed, ref, watch, type Ref } from "vue";

export function usePagedList<T>(
  rows: Ref<T[]> | (() => T[]),
  matches: (item: T, query: string) => boolean,
  pageSize = 20,
) {
  const query = ref("");
  const page = ref(1);
  const source = computed(() => (typeof rows === "function" ? rows() : rows.value));
  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return source.value;
    return source.value.filter((item) => matches(item, q));
  });
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(filtered.value.length / pageSize)),
  );
  const paged = computed(() => {
    const current = Math.min(page.value, pageCount.value);
    return filtered.value.slice((current - 1) * pageSize, current * pageSize);
  });
  watch(query, () => {
    page.value = 1;
  });
  watch(pageCount, () => {
    if (page.value > pageCount.value) page.value = pageCount.value;
  });
  return {
    query,
    page,
    pageCount,
    paged,
    total: computed(() => filtered.value.length),
  };
}
